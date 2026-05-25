/**
 * CrossThreadPersistenceService — 跨线程流式持久化服务
 *
 * 元编程原则：不修改 StoreMapper，作为独立 EventBus 监听器运行。
 * 通过声明式路由规则自动判断 chunk 归属，无需 if/else 侵入 StoreMapper。
 *
 * 路由规则：
 *   correlationId NOT in current messages + active session → 跨线程 → 缓冲写入 IndexedDB
 *   correlationId IN current messages → StoreMapper 处理（本服务忽略）
 *   无 active session → chunk 已过期 → 丢弃
 *
 * 初始化：在 initStoreMapper() 末尾调用 initCrossThreadPersistence()。
 */

import { chatEventBus } from './eventBus/ChatEventBus';
import { useChatStore } from '../useChatStore';
import { WriteBehindBuffer } from './utils/WriteBehindBuffer';
import { ops, applyToMessages } from './utils/MessageOperations';
import { createLogger } from '../../utils/logger';

const logger = createLogger('CrossThreadPersist');

// ─── 辅助：获取流式会话信息 ────────────────────────────────────

function getStreamController(): any | null {
    return typeof window !== 'undefined'
        ? (window as any).__StreamingResponseController
        : null;
}

function getStreamSession(correlationId: string): { threadId: string; isFinished: boolean } | null {
    const controller = getStreamController();
    if (!controller?.getSession) return null;
    const session = controller.getSession(correlationId);
    if (!session) return null;
    return { threadId: session.threadId, isFinished: session.isFinished };
}

// ─── 声明式路由规则 ──────────────────────────────────────────

/**
 * 判定一个 chunk 是否属于跨线程场景。
 * 规则："消息不在当前线程中 + 有活跃 session" → 跨线程。
 */
function isCrossThreadChunk(correlationId: string): boolean {
    const state = useChatStore.getState();

    // 当前线程已有此消息 → StoreMapper 处理，本服务忽略
    if (state.messages.some((m: any) => m.id === correlationId)) return false;

    // 无活跃 session → chunk 已过期
    const session = getStreamSession(correlationId);
    if (!session || session.isFinished) return false;

    return true;
}

// ─── 缓冲刷入 IndexedDB ─────────────────────────────────────-

/**
 * 将缓冲中的 delta 合并到 IndexedDB 的原始消息中。
 * 这是 WriteBehindBuffer.onFlush 回调——声明式，不手动管理。
 */
async function flushDeltasToDB(threadId: string, deltas: Map<string, string>): Promise<void> {
    const { threadPersistence } = await import('../persistence/threadPersistence');
    const messages = await threadPersistence.loadThreadMessages(threadId);

    let hasChanges = false;
    for (const [correlationId, accumulatedDelta] of deltas) {
        const idx = messages.findIndex((m: any) => m.id === correlationId);
        if (idx !== -1) {
            messages[idx] = ops.appendContent(accumulatedDelta).apply(messages[idx]);
            hasChanges = true;
        }
    }

    if (hasChanges) {
        await threadPersistence.saveThreadMessages(threadId, messages as any);
        logger.debug(`💾 Flushed ${deltas.size} cross-thread deltas to thread ${threadId.substring(0, 20)}`);
    }
}

// ─── 缓存引用 ──────────────────────────────────────────────

let buffer: WriteBehindBuffer<string, string> | null = null;

/**
 * 刷新指定线程的跨线程缓冲 delta 到 IndexedDB。
 * switchThread 在加载线程消息前调用此函数，确保 CPS 缓冲中的
 * 流式 delta 已落地，避免加载过期内容。
 */
export async function flushPendingForThread(threadId: string): Promise<void> {
    if (buffer && threadId && threadId !== '_orphaned') {
        await buffer.flushGroup(threadId);
    }
}

// ─── 服务初始化 ──────────────────────────────────────────────

export function initCrossThreadPersistence(): void {
    // 防重复初始化（与 StoreMapper 相同模式）
    if (typeof window !== 'undefined' && (window as any).__CROSS_THREAD_PERSIST_INIT__) {
        return;
    }
    if (typeof window !== 'undefined') {
        (window as any).__CROSS_THREAD_PERSIST_INIT__ = true;
    }

    // ── 声明式缓冲配置：不需要手动 timer/map/threshold 管理 ──
    buffer = new WriteBehindBuffer<string, string>({
        groupBy: (correlationId) => {
            const session = getStreamSession(correlationId);
            return session?.threadId ?? '_orphaned';
        },
        merge: (existing, incoming) => existing + incoming,
        onFlush: async (group, deltas) => {
            if (group === '_orphaned') {
                logger.warn(`⚠️ Skipping flush for orphaned group (${deltas.size} items)`);
                return;
            }
            await flushDeltasToDB(group, deltas);
        },
    });

    // ── 监听器：chunk ──
    // StoreMapper 也监听同一事件，但只处理"当前线程"的 chunk。
    // 本服务通过路由规则过滤出"跨线程"的 chunk，独立处理。
    chatEventBus.on('chat:stream:chunk', (payload: any) => {
        const { correlationId, delta } = payload;
        if (!isCrossThreadChunk(correlationId)) return;

        buffer.add(correlationId, delta);
        logger.debug(`📦 Buffered cross-thread chunk for ${correlationId.substring(0, 20)}`);
    });

    // ── 监听器：finished ──
    // 流完成时：先刷掉剩余缓冲，再标记消息为 completed
    // threadId 通过事件 payload 声明式提供（由 StreamingResponseController.emitFinished 注入），
    // 避免了 async handler 中查询 session 的竞态（emitFinished 之后会调用 stopListening 删除 session）。
    chatEventBus.on('chat:stream:finished', (payload: any) => {
        const { correlationId, threadId } = payload;
        if (!correlationId || !threadId) return;
        const state = useChatStore.getState();
        // 消息在当前 store 中 → StoreMapper 会处理 isLoading 和标记
        if (state.messages.some((m: any) => m.id === correlationId)) return;

        (async () => {
            await buffer.flushKey(correlationId);
            await applyToMessages(threadId, correlationId, ops.finishStream());
            logger.debug(`✅ Cross-thread stream finished: ${correlationId.substring(0, 20)}`);
        })();
    });

    // ── 监听器：thread:switching ──
    // 元编程：不导出函数给 switchThread 调用，通过事件驱动自行响应
    // 当用户切换会话时，flush 属于目标线程的缓冲 delta 到 IndexedDB
    chatEventBus.on('chat:thread:switching', async ({ threadId }: { threadId: string }) => {
        if (threadId && threadId !== '_orphaned' && buffer) {
            await buffer.flushGroup(threadId);
            logger.debug(`🔄 Flushed pending deltas for thread ${threadId.substring(0, 20)} on switch`);
        }
    });
}

export default initCrossThreadPersistence;
