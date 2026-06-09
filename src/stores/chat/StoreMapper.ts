/**
 * StoreMapper - 架构映射器 (核级对齐版)
 *
 * 负责将 EventBus 信号映射回 Zustand Store 状态。
 *
 * @version v1.1.0 - 集成 ContentSegmentManager
 */

import { chatEventBus } from './eventBus/ChatEventBus';
import { useChatStore } from '../useChatStore';
import { useThreadStore } from '../threadStore';
import { useSettingsStore } from '../settingsStore';
import { shouldAutoApprove as checkAutoApprove } from '../../utils/approvalPolicy';
import { toolApprovalRegistry } from '../../core/approval/ToolApprovalRegistry';
import { contentSegmentManager } from './generateResponse/ContentSegmentManager';
import { TOOL_PERMISSIONS } from '../../core/stream-schema-generated';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { createLogger } from '../../utils/logger';
import { debugLog } from '../../services/debugLog/DebugLogService';
import { PerThreadSessionStore } from './PerThreadSessionStore';
import type { PhaseData, WorkflowData, NodeData, ToolItem } from '../../types/workflow';

// 🏆 per-thread session 状态管理器（惰性初始化，避免循环依赖）
let _perThreadSessionStore: PerThreadSessionStore | null = null;
function getPerThreadSessionStore(): PerThreadSessionStore {
  if (!_perThreadSessionStore) {
    _perThreadSessionStore = new PerThreadSessionStore();
  }
  return _perThreadSessionStore;
}

// 🔥 Logger instance for StoreMapper
const logger = createLogger('StoreMapper');

// ✅ 元编程：数据流追踪（当元数据启用时）
const MULTI_MODAL_LOGGING_ENABLED = true;

/**
 * normalizeInteractionData — 归一化 InteractionData
 *
 * 兼容旧格式 { question, options, compactAsk } 和新格式 { questions: [...] }。
 * 统一输出 { title, questions, type, onSelect } 结构。
 * 单归一化点：消除 adapter / StoreMapper / InteractionCard 三处分叉。
 */
export function normalizeInteractionData(raw: any): any | null {
  if (!raw) return null;
  // 新格式：直接是 questions 数组
  if (raw.questions && Array.isArray(raw.questions) && raw.questions.length > 0) {
    return {
      type: raw.questions.length > 1 ? 'multiple' : (raw.type || raw.questions[0].type || 'single'),
      title: raw.title || '',
      questions: raw.questions,
      onSelect: raw.onSelect,
    };
  }
  // 旧格式：{ question, options, compactAsk } → 包装为 questions 数组
  if (raw.options && Array.isArray(raw.options) && raw.options.length > 0) {
    return {
      type: raw.type || 'single',
      title: raw.title || '',
      questions: [{
        id: '_default',
        type: raw.type || 'single',
        question: raw.question || '',
        compactAsk: raw.compactAsk,
        options: raw.options,
      }],
      onSelect: raw.onSelect,
    };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// 纯函数：消息创建（零副作用，供同线程 setState + 跨线程 IndexedDB 两路径复用）
// 元编程原则：消息对象构建逻辑只写一次，路由由调用侧决定
// ═══════════════════════════════════════════════════════════════

function createMessageTimestamps(): { userTimestamp: number; assistantTimestamp: number } {
  const now = Date.now();
  const sequenceCounter = typeof window !== 'undefined'
    ? ++(window as any).__MESSAGE_SEQUENCE_COUNTER__
    : 0;
  return {
    userTimestamp: now + sequenceCounter * 100,
    assistantTimestamp: now + sequenceCounter * 100 + 1,
  };
}

function createInitialMessagePair(
  messageId: string,
  assistantId: string,
  content: any,  // string | array（支持 multimodal）
  multiModalContent: any,
  timestamps: { userTimestamp: number; assistantTimestamp: number },
): { userMessage: any; assistantMessage: any } {
  return {
    userMessage: {
      id: messageId,
      role: 'user' as const,
      content,
      multiModalContent,
      timestamp: timestamps.userTimestamp,
      segments: [{
        id: `seg-user-${messageId}`,
        type: 'text' as const,
        phase: 'pre-tool' as const,
        content,
        order: 1,
        timestamp: timestamps.userTimestamp,
      }],
    },
    assistantMessage: {
      id: assistantId,
      role: 'assistant' as const,
      content: '',
      status: 'streaming' as const,
      timestamp: timestamps.assistantTimestamp,
      segments: [],
    },
  };
}

async function persistInitialMessagesToThread(
  threadId: string,
  userMessage: any,
  assistantMessage: any,
  messageId: string,
  assistantId: string,
): Promise<void> {
  try {
    const { threadPersistence } = await import('../persistence/threadPersistence');
    const existingMessages = await threadPersistence.loadThreadMessages(threadId);
    const filtered = existingMessages.filter(
      (m: any) => m.id !== messageId && m.id !== assistantId,
    );
    const updated = [...filtered, userMessage, assistantMessage];
    await threadPersistence.saveThreadMessages(threadId, updated as any);
    console.log('[StoreMapper] 💾 Cross-thread: persisted initial messages to thread',
      threadId.substring(0, 8), `(${updated.length} total)`);
  } catch (err) {
    console.error('[StoreMapper] ❌ Cross-thread persistence failed:', err);
  }
}

/**
 * resolveTargetThreadId — 声明式线程 ID 解析（消除两处克隆的过程化逻辑）
 *
 * 统一处理 activeThreadId 与 currentThreadId 不一致的同步，以及无效 ID 的降级。
 * 一次定义，所有持久化回调复用一行调用。
 */
function resolveTargetThreadId(state: { currentThreadId: string }): string | null {
  const threadState = useThreadStore.getState();
  let activeId = threadState.activeThreadId;
  let currentId = state.currentThreadId;

  // 降级 1: activeThreadId 缺失 → 用 currentThreadId 并回写 threadStore
  if (!activeId && currentId) {
    threadState.setActiveThread(currentId);
    activeId = currentId;
  }

  // 降级 2: currentThreadId 无效 → 用 activeThreadId 并同步 store
  if (!currentId || currentId === 'undefined' || currentId === 'default-thread') {
    if (activeId) {
      useChatStore.setState({ currentThreadId: activeId } as any);
      return activeId;
    }
    return null;
  }

  // 同步: activeThreadId 与 currentThreadId 不一致 → 以 activeThreadId 为准
  if (activeId && activeId !== currentId) {
    useChatStore.setState({ currentThreadId: activeId } as any);
    return activeId;
  }

  return currentId;
}

/**
 * threadSafeUpdate — 线程安全的消息更新辅助函数
 *
 * 先尝试在当前线程的 messages 中执行 updater；若 updater 返回 state 不变
 * (消息不在当前线程中)，则回退到 _messagesByThread[sessionId] bucket 重试，
 * 并通过 _threadId 路由写入正确线程的 bucket。
 *
 * 解决所有 handler（tool:call, tool:completed, segment:* 等）中的
 * 跨线程数据丢失问题，无需逐个修改。
 */
function threadSafeUpdate(
  sessionId: string | undefined,
  correlationId: string,
  updater: (state: any) => any,
): void {
  if (!sessionId) {
    useChatStore.setState(updater as any);
    return;
  }

  useChatStore.setState((realState: any) => {
    // Step 1: 在当前线程上尝试
    const result = updater(realState);
    if (result !== realState) return result;

    // Step 2: 跨线程回退 — 在 _messagesByThread[sessionId] 中重试
    const targetMsgs = realState._messagesByThread?.[sessionId];
    if (!targetMsgs) return result;

    // 通过虚拟 state 让 updater 操作目标线程的消息
    const crossState = { ...realState, messages: targetMsgs };
    const crossResult = updater(crossState);
    if (crossResult === crossState) return result;

    // 提取 messages 变更，标记 _threadId 路由到正确 bucket
    if ('messages' in crossResult && crossResult.messages !== targetMsgs) {
      return { ...crossResult, _threadId: sessionId };
    }
    return { ...crossResult, _threadId: sessionId } as any;
  });
}

export const initStoreMapper = () => {
    // 🔥 CRITICAL: 防止同一页面重复初始化（HMR）
    // 仅检查 window 级别，不检查 globalThis，避免跨 page 隔离问题
    if (typeof window !== 'undefined' && (window as any).__STORE_MAPPER_INITIALIZED__) {
        console.log('[StoreMapper] ⏭️ Already initialized, skipping duplicate init');
        return;
    }
    if (typeof window !== 'undefined') {
        (window as any).__STORE_MAPPER_INITIALIZED__ = true;
    }

    // 🔥 序号校验：追踪每个流的 delta 序号
    const streamIndexTracker = new Map<string, number>();

    // 🔥 CRITICAL FIX: 设置全局标记，表明 initStoreMapper 被调用了
    if (typeof window !== 'undefined') {
      (window as any).__STORE_MAPPER_CALLED__ = true;
      (window as any).__STORE_MAPPER_CALL_TIME__ = Date.now();
      // 🏆 注册 per-thread session store，供 switchThread 恢复 isLoading
      (window as any).__getPerThreadSessionStore = getPerThreadSessionStore;
      if (!(window as any).__STORE_MAPPER_INIT_LOGS__) {
        (window as any).__STORE_MAPPER_INIT_LOGS__ = [];
      }
      (window as any).__STORE_MAPPER_INIT_LOGS__.push({
        time: Date.now(),
        event: 'initStoreMapper called'
      });

      // 🏆 修复气泡次序：添加单调递增计数器确保消息顺序
      if (!(window as any).__MESSAGE_SEQUENCE_COUNTER__) {
        (window as any).__MESSAGE_SEQUENCE_COUNTER__ = 0;
      }
    }

    console.log('[StoreMapper] 🔗 Atomic Linkage Active - INITIALIZED');
    console.log('[StoreMapper] 🔗 Window.__STORE_MAPPER_CALLED__:', (window as any).__STORE_MAPPER_CALLED__);

    // 🔥 DEBUG: 验证监听器是否被注册
    setTimeout(() => {
      const handlers = (chatEventBus as any).handlers;
      const counts = {
        'chat:stream:chunk': handlers.get('chat:stream:chunk')?.length || 0,
        'chat:segment:updated': handlers.get('chat:segment:updated')?.length || 0,
        'chat:stream:start': handlers.get('chat:stream:start')?.length || 0,
        'chat:stream:finished': handlers.get('chat:stream:finished')?.length || 0,
        'chat:message:sent': handlers.get('chat:message:sent')?.length || 0
      };
      console.log('[StoreMapper] 🔍 DEBUG: Registered handlers:', counts);

      if (typeof window !== 'undefined') {
        (window as any).__STORE_MAPPER_INIT_LOGS__.push({
          time: Date.now(),
          event: 'handlers_registered',
          counts
        });
      }
    }, 1000);

    // 🏆 FIX: 防止重复续播的标记
    let continuationInProgress: { [key: string]: boolean } = {};

    // 🏆 FIX: 续播防抖定时器
    let continuationTimers: { [key: string]: NodeJS.Timeout } = {};

    // 🏆 FIX: 防止流式 chunk 重复追加的标记
    let processedChunks: { [key: string]: Set<string> } = {};

    // 🏆 FIX: 跟踪已完成的流，防止在流结束后触发续播
    let finishedStreams: Set<string> = new Set();

    // 🚀 OPTIMIZATION: 跟踪续播的内容，用于检测空续播
    let continuationContentTracker: { [key: string]: { hasContent: boolean; startTime: number } } = {};

    // ============================================
    // 🏆 新增：ContentSegmentManager 集成
    // ============================================

    // 监听流式开始 → 初始化 ContentSegmentManager
    chatEventBus.on('chat:stream:start', (payload: any) => {
        // 🔥 FIX: 优先使用 correlationId，并确认在 Store 中的物理存在
        const correlationId = payload.correlationId || payload.messageId;
        const messageId = payload.messageId; // UI 层面的 ID
        const streamSessionId = payload.sessionId;

        console.log('[StoreMapper] 🚀 Stream start:', { correlationId, messageId, thread: streamSessionId });

        // 🏆 声明式计数器：per-thread activeStreamCount 推导 isLoading（跨线程均须递增）
        getPerThreadSessionStore().incrementStreamCount(streamSessionId);
        // 🏆 Phase 4: 记录 streamingIds 到 per-thread session（用于断链检测和清理）
        getPerThreadSessionStore().addStreamingId(streamSessionId, correlationId);
        // 🏆 Phase 4: 新流开始时清除旧的摘要数据（PulseBanner 跨线程使用）
        getPerThreadSessionStore().clearStreamSummary(streamSessionId);
        debugLog({ category: 'stream:start', level: 'info', message: `Stream start: sessionId=${streamSessionId}`, threadId: streamSessionId, correlationId, data: { currentThreadId: useChatStore.getState().currentThreadId, isCrossThread: streamSessionId !== useChatStore.getState().currentThreadId } });

        // 🏆 设置 isStreaming 标记（仅在流所属线程 === 当前线程时更新 UI）
        const currentTid = useChatStore.getState().currentThreadId;
        if (streamSessionId && currentTid && streamSessionId !== currentTid) {
            console.log('[StoreMapper] 🔀 Cross-thread stream start, skipping UI update (current:', currentTid.substring(0, 8), 'stream:', streamSessionId.substring(0, 8), ')');
            debugLog({ category: 'cross-thread', level: 'warn', message: `Cross-thread stream start: stream=${streamSessionId} current=${currentTid}`, threadId: streamSessionId, correlationId });
        } else {
            useChatStore.setState((state: any) => ({
                messages: state.messages.map((m: any) =>
                    m.id === correlationId ? { ...m, isStreaming: true, status: 'streaming' } : m
                ),
            }) as any);
        }

        // 🏆 物理纠偏：确保 Store 中的消息可以通过 correlationId 被找到
        // 如果它们不一致，我们需要一个映射关系或者直接在 Manager 中处理
        contentSegmentManager.onStreamStart(correlationId);
        debugLog({ category: 'stream:start', level: 'debug', message: `CSM initialized for ${correlationId}`, threadId: streamSessionId, correlationId });
    });

    // 监听内容块 → 通知 ContentSegmentManager
    chatEventBus.on('chat:stream:chunk', (payload: any) => {
        const { delta, correlationId, deltaIndex, sessionId } = payload;

        // 🔥 DEBUG: 只在异常情况或每 50 个 delta 打印一次 - 使用 logger
        const shouldLog = deltaIndex === undefined || deltaIndex < 0 || deltaIndex % 50 === 0;

        if (shouldLog) {
            logger.debug('chat:stream:chunk received:', {
                correlationId,
                deltaIndex,
                deltaLength: delta?.length || 0,
                deltaPreview: delta?.substring(0, 30) || ''
            });
        }

        // 🔥 DEBUG: 检查 delta 是否包含路径混乱的迹象 - 使用 logger
        if (delta && delta.includes('/') && delta.length > 50) {
            logger.debug('Chunk with path detected:', delta);
        }

        // 🔥 序号校验：如果有序号，记录并检查顺序
        if (deltaIndex !== undefined && deltaIndex >= 0) {
            const lastIdx = streamIndexTracker.get(correlationId) ?? -1;
            streamIndexTracker.set(correlationId, deltaIndex);

            // 检测乱序 - 只在乱序时打印警告 - 使用 logger
            if (deltaIndex !== lastIdx + 1) {
                logger.warn(`Out-of-order delta detected: expected ${lastIdx + 1}, got ${deltaIndex}`);
            }
        }

        // 🏆 FIX: 物理自愈 - 如果 chunk 到了但 Manager 还没初始化（可能由于 start 事件丢失），手动补全
        if (!contentSegmentManager.isStreamActive(correlationId)) {
            logger.warn(`Stream ${correlationId} not active in Manager, triggering auto-start`);
            debugLog({ category: 'layer2:recovery', level: 'warn', message: `Layer2 auto-start: chunk before start event`, threadId: sessionId, correlationId, data: { deltaLength: delta?.length, deltaIndex } });
            contentSegmentManager.onStreamStart(correlationId);
        }

        // 🔥 FIX v1.0.0: 优化性能 - 通知 ContentSegmentManager（不触发 chat:segment:updated 事件）
        // ContentSegmentManager.onContentChunk 会触发 chat:segment:updated 事件，导致第二次 setState
        // 我们直接调用内部的 _onContentChunk（如果存在），避免事件触发
        // 如果不存在，则使用原方法并接受性能损失
        if ((contentSegmentManager as any)._onContentChunkWithoutEmit) {
            (contentSegmentManager as any)._onContentChunkWithoutEmit(delta, correlationId);
        } else {
            contentSegmentManager.onContentChunk(delta, correlationId);
        }

        // 🏆 FIX v1.0.0: 合并两次 setState 为一次 - 同时更新 content 和 segments
        // 这避免了每个 delta 触发两次 setState（一次 content，一次 segments）
        useChatStore.setState((state: any) => {
            const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
            if (messageIndex === -1) {
                // 🔥 跨线程 chunk：在 _messagesByThread[sessionId] 中查找并更新
                // 若 bucket 中存在该消息，写入正确线程的 bucket（不更新当前 UI 视图）
                // 若不存在，保留 state 不变，由 Part E CSM 恢复兜底
                if (sessionId && state._messagesByThread?.[sessionId]) {
                    const targetMsgs = state._messagesByThread[sessionId];
                    const tIdx = targetMsgs.findIndex((m: any) => m.id === correlationId);
                    if (tIdx !== -1) {
                        debugLog({ category: 'cross-thread', level: 'info', message: `Chunk routed to _messagesByThread[${sessionId}]`, threadId: sessionId, correlationId, data: { deltaLength: delta?.length, deltaIndex } });
                        const newTargetMsgs = [...targetMsgs];
                        const targetMsg = { ...newTargetMsgs[tIdx], isStreaming: true };
                        targetMsg.content = (targetMsg.content || '') + delta;
                        const csmSegments = contentSegmentManager.getSegments(correlationId);
                        if (csmSegments && csmSegments.length > 0) {
                            targetMsg.segments = csmSegments.map((s: any) => ({ ...s }));
                        }
                        newTargetMsgs[tIdx] = targetMsg;
                        // 🏆 Phase 4: 跨线程 chunk 标记未读更新
                        getPerThreadSessionStore().setHasUnreadUpdate(sessionId, true);
                        useThreadStore.getState().markUnreadActivity(sessionId, true);
                        return { messages: newTargetMsgs, _threadId: sessionId, isLoading: true };
                    }

                    // 🏆 Phase 4: Layer 2 auto-create — _messagesByThread 中消息不存在时自动创建（仅跨线程）
                    const currentTidLayer2 = useChatStore.getState().currentThreadId;
                    if (currentTidLayer2 && sessionId !== currentTidLayer2) {
                      debugLog({
                        category: 'layer2:recovery',
                        level: 'warn',
                        message: `Layer 2 auto-create: ${correlationId} not found in _messagesByThread[${sessionId}]`,
                      threadId: sessionId,
                      correlationId,
                      data: { deltaLength: delta?.length, deltaIndex }
                    });
                    const csmSegmentsForAuto = contentSegmentManager.getSegments(correlationId);
                    const csmContentForAuto = csmSegmentsForAuto
                      ?.filter((s: any) => s.type === 'text' && s.content)
                      .map((s: any) => s.content)
                      .join('') || '';
                    const autoCreatedMsg = {
                      id: correlationId,
                      role: 'assistant',
                      content: csmContentForAuto || (delta || ''),
                      status: 'streaming',
                      isStreaming: true,
                      timestamp: Date.now(),
                      segments: csmSegmentsForAuto ? csmSegmentsForAuto.map((s: any) => ({ ...s })) : [],
                    };
                    const newTargetMsgsWithAuto = [...targetMsgs, autoCreatedMsg];
                    // 🏆 Phase 4: 跨线程 chunk 标记未读更新（auto-create 场景）
                    getPerThreadSessionStore().setHasUnreadUpdate(sessionId, true);
                    useThreadStore.getState().markUnreadActivity(sessionId, true);
                    return { messages: newTargetMsgsWithAuto, _threadId: sessionId, isLoading: true };
                }  // ← closes cross-thread guard (auto-create)
                }  // ← closes sessionId & bucket check

                // 🏆 Phase 4: _messagesByThread bucket 不存在时，创建并初始化（仅跨线程）
                const currentTidForLayer2 = useChatStore.getState().currentThreadId;
                if (sessionId && currentTidForLayer2 && sessionId !== currentTidForLayer2) {
                  debugLog({
                    category: 'layer2:recovery',
                    level: 'warn',
                    message: `Layer 2 auto-create: creating bucket + message for ${correlationId}`,
                    threadId: sessionId,
                    correlationId,
                    data: { deltaLength: delta?.length, deltaIndex }
                  });
                  const csmSegmentsForBucket = contentSegmentManager.getSegments(correlationId);
                  const csmContentForBucket = csmSegmentsForBucket
                    ?.filter((s: any) => s.type === 'text' && s.content)
                    .map((s: any) => s.content)
                    .join('') || '';
                  const bucketAutoCreatedMsg = {
                    id: correlationId,
                    role: 'assistant',
                    content: csmContentForBucket || (delta || ''),
                    status: 'streaming',
                    isStreaming: true,
                    timestamp: Date.now(),
                    segments: csmSegmentsForBucket ? csmSegmentsForBucket.map((s: any) => ({ ...s })) : [],
                  };
                  getPerThreadSessionStore().setHasUnreadUpdate(sessionId, true);
                  useThreadStore.getState().markUnreadActivity(sessionId, true);
                  return { messages: [bucketAutoCreatedMsg], _threadId: sessionId, isLoading: true };
                }
                return state;
            }

            const newMessages = [...state.messages];
            const targetMsg = { ...newMessages[messageIndex], isStreaming: true };

            // [[DIAG]] Trace content length at each chunk
            const oldContent = targetMsg.content || '';
            targetMsg.content = oldContent + delta;
            if (oldContent.length + delta.length !== targetMsg.content.length) {
              console.warn('[StoreMapper] ⚠️ Content length mismatch after append:', {
                correlationId, oldLen: oldContent.length, deltaLen: delta.length, newLen: targetMsg.content.length,
              });
            }

            // 🔥 FIX v1.0.0: 同时更新 segments（从 ContentSegmentManager 获取最新状态）
            // 这样避免了 chat:segment:updated 事件触发第二次 setState
            const csmSegments = contentSegmentManager.getSegments(correlationId);
            if (csmSegments && csmSegments.length > 0) {
                // 深拷贝 segments 以确保 React 检测到变化
                targetMsg.segments = csmSegments.map((s: any) => ({ ...s }));
            }

            newMessages[messageIndex] = targetMsg;

            return { messages: newMessages, isLoading: true };
        });
    });

    // 5. 映射流式结束 → 完成、清理、同步
    chatEventBus.on('chat:stream:finished', (payload: any) => {
        const { correlationId, totalTokens, sessionId } = payload;
        if (!correlationId) return;

        // 🔥 序号校验：清理序号追踪器
        streamIndexTracker.delete(correlationId);

        // 🏆 Phase 4: 清理 streamingIds（先于 CSM finish 和 decrement，确保清理在最前）
        const streamTid = sessionId || useChatStore.getState().currentThreadId;
        getPerThreadSessionStore().removeStreamingId(streamTid, correlationId);

        // A. 通知 ContentSegmentManager
        contentSegmentManager.onStreamFinish(correlationId);

        // 🏆 声明式递减计数器：per-thread 递减（先于 setState，确保 isLoading 推导准确）
        getPerThreadSessionStore().decrementStreamCount(sessionId || useChatStore.getState().currentThreadId);

        // 🏆 Phase 4: 设置 per-thread 流摘要数据（跨线程保留，供 PulseBanner 恢复显示）
        {
          const tid = sessionId || useChatStore.getState().currentThreadId;
          const msgs = (useChatStore.getState() as any)._messagesByThread?.[tid] || [];
          const allChars = msgs.reduce((sum: number, m: any) => {
            const c = typeof m.content === 'string' ? m.content : '';
            return sum + c.length;
          }, 0);
          const assistantChars = msgs.filter((m: any) => m.role === 'assistant').reduce((sum: number, m: any) => {
            const c = typeof m.content === 'string' ? m.content : '';
            return sum + c.length;
          }, 0);
          getPerThreadSessionStore().setStreamSummary(tid, {
            inputTokens: Math.round(allChars / 4),
            outputTokens: Math.round(assistantChars / 4),
          });
        }

        // B. 物理标记流完成 & 清除续播锁
        finishedStreams.add(correlationId);
        continuationInProgress[correlationId] = false;

        // 延迟清理 finishedStreams 标记，防止内存泄漏
        setTimeout(() => {
          finishedStreams.delete(correlationId);
        }, 10000);

        // C. 重置 UI 加载状态（由 per-thread decrementStreamCount 声明式推导，消除时间耦合）
        useChatStore.setState((state: any) => {
            const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
            if (messageIndex === -1) {
                // 跨线程 finished：消息不在当前 store，保留 state 不变
                // 务必返回 state 而非设置 isLoading:false，避免杀死当前线程加载态
                return state;
            }
            return {
                messages: state.messages.map((m: any) =>
                    m.id === correlationId ? {
                        ...m,
                        isStreaming: false,
                        status: 'completed',
                        // 🏆 从 pending toolCalls 声明式推导 approvalMeta
                        approvalMeta: (() => {
                            const pendingCalls = m.toolCalls?.filter((tc: any) => tc.status === 'pending');
                            if (!pendingCalls?.length) return undefined;
                            const firstPending = pendingCalls[0];
                            return {
                                title: `${pendingCalls.length} 个操作待确认`,
                                summary: pendingCalls.map((tc: any) => tc.tool).join(', '),
                                risk: pendingCalls.some((tc: any) => tc.tool === 'bash' || tc.tool === 'execute_command') ? 'high'
                                    : pendingCalls.some((tc: any) => tc.tool === 'write_file' || tc.tool === 'create_file' || tc.tool === 'delete_file') ? 'medium'
                                    : 'low',
                                files: pendingCalls
                                    .filter((tc: any) => tc.args?.path)
                                    .map((tc: any) => ({
                                        path: tc.args.path,
                                        change: tc.tool,
                                        risk: tc.tool === 'bash' ? 'high' : tc.tool === 'write_file' || tc.tool === 'create_file' || tc.tool === 'delete_file' ? 'medium' : 'low',
                                    })),
                                // ApprovalCard 数据驱动按钮所需的字段
                                toolName: firstPending?.tool || '',
                                argsPreview: firstPending?.args?.path
                                    || firstPending?.args?.command
                                    || firstPending?.args?.rel_path
                                    || '',
                            };
                        })(),
                    } : m
                ),
            };
        }) as any;

        // E. 🔥 跨线程恢复：消息存在于 _messagesByThread[sessionId] 时，使用
        // ContentSegmentManager 获取完整内容覆盖。移除 currentThreadId 检查：
        // 用户可能在 stream 结束前切回原始线程，此时 Part E 也必须触发，
        // 否则场景 A→B→A 切换会导致 content 截断（~140 chars vs 117 frames ~35KB）。
        if (sessionId) {
          const _state = useChatStore.getState();
          if (_state._messagesByThread?.[sessionId]) {
            const targetMsgs = _state._messagesByThread[sessionId];
            const tIdx = targetMsgs.findIndex((m: any) => m.id === correlationId);
            if (tIdx !== -1) {
              const segments = contentSegmentManager.getSegments(correlationId);
              const segmentsText = segments
                ?.filter((s: any) => s.type === 'text' && s.content)
                .map((s: any) => s.content)
                .join('') || '';
              // 只有 CSM 内容长于现有 content 时才恢复（避免短覆盖长）
              const targetContentLen = (targetMsgs[tIdx].content || '').length;
              const fullContent = segmentsText.length > targetContentLen ? segmentsText : (targetMsgs[tIdx].content || '');
              console.log('[StoreMapper] 🔀 Cross-thread FINISHED recovery:', {
                correlationId, sessionId,
                segmentsCount: segments?.length ?? -1,
                segmentsTextLen: segmentsText.length,
                targetContentLen,
                finalContentLen: fullContent.length,
              });
              debugLog({ category: 'layer3:recovery', level: 'warn', message: `Part E recovery: segments(${segmentsText.length}) > content(${targetContentLen})`, threadId: sessionId, correlationId, data: { segmentsCount: segments?.length, segmentsTextLen: segmentsText.length, targetContentLen, finalContentLen: fullContent.length } });

              const newTargetMsgs = targetMsgs.map((m: any) =>
                m.id === correlationId ? {
                  ...m,
                  content: fullContent,
                  isStreaming: false,
                  status: 'completed',
                } : m
              );

              useChatStore.setState({ messages: newTargetMsgs, _threadId: sessionId } as any);
              console.log('[StoreMapper] 🔀 Cross-thread stream finished:', {
                correlationId, sessionId, contentLength: fullContent.length,
              });

              // 🏆 Phase 3: 标记目标线程有未读更新（仅在非当前线程时标记）
              const currentTid = useChatStore.getState().currentThreadId;
              if (sessionId !== currentTid) {
                getPerThreadSessionStore().setHasUnreadUpdate(sessionId, true);
                useThreadStore.getState().markUnreadActivity(sessionId, true);
              }
            }
          }
        }

        // D. 终极同步：确保 segments 中缺失的内容补齐到 content
        // 🔥 FIX: 不仅处理 content 为空，当 segments 比 content 更长时也补齐
        // 这修复了线程切换后 content 部分丢失的场景：
        //   - 线程切换前积累的 content（partial） + 切换后丢失的 chunks = 不完整
        //   - segments 始终包含完整内容（ContentSegmentManager 全局累积）
        //   - segmentsContent.length > currentContent.length 时说明有丢失
        setTimeout(() => {
          const state = useChatStore.getState();

          // 先查当前线程 messages，再查原始线程 _messagesByThread
          let messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
          let baseMessages: any[];
          let targetThreadId: string | undefined;

          if (messageIndex !== -1) {
            baseMessages = state.messages;
            targetThreadId = undefined; // 当前线程，不用 _threadId
          } else if (sessionId && state._messagesByThread?.[sessionId]) {
            const tMsgs = state._messagesByThread[sessionId];
            const tIdx = tMsgs.findIndex((m: any) => m.id === correlationId);
            if (tIdx === -1) return;
            messageIndex = tIdx;
            baseMessages = tMsgs;
            targetThreadId = sessionId;
          } else {
            return;
          }

          const newMessages = [...baseMessages];
          const targetMsg = { ...newMessages[messageIndex] };
          const currentContent = targetMsg.content || '';

          if (targetMsg.segments && targetMsg.segments.length > 0) {
            const segmentsContent = targetMsg.segments
              .filter((s: any) => s.type === 'text' && s.content)
              .map((s: any) => s.content)
              .join('');

            // 当 segments 有更多内容时补齐（兼容 content 为空或部分丢失）
            if (segmentsContent.length > currentContent.length) {
              console.log('[StoreMapper] 🔧 Recovering content from segments:', {
                correlationId,
                currentContentLength: currentContent.length,
                fullContentLength: segmentsContent.length,
                crossThread: !!targetThreadId,
              });
              targetMsg.content = segmentsContent;
              newMessages[messageIndex] = targetMsg;

              const setStatePayload: any = { messages: newMessages };
              if (targetThreadId) {
                setStatePayload._threadId = targetThreadId;
                setStatePayload.isLoading = false;
              }
              useChatStore.setState(setStatePayload as any);
            }
          } else {
            // 🛡️ 防御兜底：message.segments 为空（跨线程 chunk 被全部丢弃），
            // 直接从 ContentSegmentManager 获取完整内容
            const csmSegments = contentSegmentManager.getSegments(correlationId);
            if (csmSegments && csmSegments.length > 0) {
              const csmText = csmSegments
                .filter((s: any) => s.type === 'text' && s.content)
                .map((s: any) => s.content)
                .join('');
              if (csmText.length > currentContent.length) {
                console.log('[StoreMapper] 🛡️ CSM fallback recovery:', {
                  correlationId,
                  currentContentLength: currentContent.length,
                  csmContentLength: csmText.length,
                  crossThread: !!targetThreadId,
                });
                debugLog({ category: 'layer3:recovery', level: 'error', message: `CSM fallback recovery: segments empty, direct CSM read`, threadId: targetThreadId, correlationId, data: { currentContentLength: currentContent.length, csmContentLength: csmText.length, crossThread: !!targetThreadId } });
                targetMsg.content = csmText;
                newMessages[messageIndex] = targetMsg;
                const setStatePayload: any = { messages: newMessages };
                if (targetThreadId) {
                  setStatePayload._threadId = targetThreadId;
                  setStatePayload.isLoading = false;
                }
                useChatStore.setState(setStatePayload as any);
              }
            }
          }
        }, 100);

        // 🏆 Phase 4: stream:finished → persistEvent + 惰性检查快照
        const finishTid = sessionId || useChatStore.getState().currentThreadId;
        if (finishTid) {
          import('../../services/sessionPersistence/SessionPersistenceService').then(
            ({ getSessionPersistenceService }) => {
              try {
                const sps = getSessionPersistenceService();
                sps.persistEvent(finishTid, 'stream:finished', { correlationId, totalTokens });
                sps.flush();
              } catch (e) {
                console.warn('[StoreMapper] ⚠️ stream:finished persistence failed:', e);
              }
            },
          );
        }
    });

    // ============================================
    // 🏆 新增：监听 segment 事件 → 更新 Store
    // ============================================

    // 监听 segment 创建/更新
    chatEventBus.on('chat:segment:created', (payload: any) => {
        const { correlationId, segment } = payload;
        console.log('[StoreMapper] ✅ Segment created, updating store:', {
            correlationId,
            segmentType: segment.type,
            segmentOrder: segment.order
        });

        // 🔥 FIX v0.3.3: 跳过 tool segments（已在 chat:tool:call 中处理）
        // 避免重复 setState 导致渲染不同步
        if (segment.type === 'tool') {
            console.log('[StoreMapper] ⏭️ Skipping tool segment (already handled by chat:tool:call)');
            return;
        }

        const updater = (state: any) => {
            const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
            if (messageIndex === -1) return state;

            const newMessages = [...state.messages];
            const targetMsg = { ...newMessages[messageIndex] };

            // 更新 segments 数组
            if (!targetMsg.segments) {
                targetMsg.segments = [];
            }

            // 添加新 segment（确保不重复）
            const exists = targetMsg.segments.some((s: any) => s.order === segment.order);
            if (!exists) {
                targetMsg.segments = [...targetMsg.segments, segment];
            }

            newMessages[messageIndex] = targetMsg;

            return { messages: newMessages };
        };

        useChatStore.setState(updater as any);
    });

    chatEventBus.on('chat:segment:updated', (payload: any) => {
        const { correlationId, segmentId, delta } = payload;
        const updater = (state: any) => {
            const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
            if (messageIndex === -1) return state;

            const newMessages = [...state.messages];
            const targetMsg = { ...newMessages[messageIndex] };

            // 🚀 OPTIMIZATION: 标记续播有内容了
            if (continuationContentTracker[correlationId]) {
                continuationContentTracker[correlationId].hasContent = true;
            }
            // 找到对应的 segment 并更新
            if (targetMsg.segments) {
                const segmentIndex = targetMsg.segments.findIndex((s: any) => {
                    const sid = `segment-${s.order}`;
                    return sid === segmentId;
                });

                if (segmentIndex !== -1) {
                    // 🏆 FIX: 物理替换数组和对象引用，确保 React 监听到深层变化
                    // 🔥 CRITICAL FIX: 不在这里追加 delta！ContentSegmentManager.onContentChunk
                    // 已经将 delta 追加到 segment.content 中。这里只需要触发 React re-render。
                    // 如果在这里也追加，会导致 segment content 双重追加（每个字符重复）。
                    const newSegments = [...targetMsg.segments];
                    const updatedSegment = { ...newSegments[segmentIndex] };
                    // 🔥 FIX: 从 ContentSegmentManager 同步最新 content（而非自己追加 delta）
                    const csmSegments = contentSegmentManager.getSegments(correlationId);
                    const csmSeg = csmSegments.find((s: any) => `segment-${s.order}` === segmentId);
                    if (csmSeg) {
                        updatedSegment.content = csmSeg.content;
                    }
                    newSegments[segmentIndex] = updatedSegment;
                    targetMsg.segments = newSegments;
                    
                    // 🏆 同步标记消息正在生成，确保 UI 能够实时响应
                    targetMsg.isStreaming = true;
                }
            }

            newMessages[messageIndex] = targetMsg;

            return { messages: newMessages };
        };

        useChatStore.setState(updater as any);
    });

    // ============================================
    // 现有逻辑：用户消息发送
    // ============================================

    // 1. 映射用户消息发送
    console.log('[StoreMapper] 🔍 Registering chat:message:sent listener, EventBus instance:', (chatEventBus as any).constructor.name);
    chatEventBus.on('chat:message:sent', (payload) => {
      const payloadData = payload as any;
      const { messageId, content, correlationId, isAssistantOnly, isWorkflowMessage } = payloadData;

      // 🔴🟢 高保真日志点2：EventBus → StoreMapper
      const multiModalContent = payloadData.multiModalContent;
      console.log('[StoreMapper] 🔴🟢 POINT-2: Received chat:message:sent event');
      console.log('[StoreMapper] ========================================');
      console.log('[StoreMapper] 📨 Event payload details:', {
          messageId,
          correlationId,
          hasMultiModalContent: !!multiModalContent,
          multiModalContentType: typeof multiModalContent,
          multiModalContentConstructor: multiModalContent?.constructor?.name,
          isArray: Array.isArray(multiModalContent),
          itemCount: Array.isArray(multiModalContent) ? multiModalContent.length : 0,
          // 🔥 详细记录 multiModalContent 结构
          multiModalContentStructure: Array.isArray(multiModalContent)
              ? multiModalContent.map((part: any, idx: number) => ({
                    index: idx,
                    type: part.type,
                    hasImageUrl: !!part.image_url,
                    hasText: !!part.text,
                    imageUrlPreview: part.image_url?.url?.substring(0, 50) + '...',
                    textPreview: part.text?.substring(0, 50) + '...',
                }))
              : null,
          // 🔥 JSON 序列化测试
          jsonSerialized: JSON.stringify(multiModalContent),
      });
      console.log('[StoreMapper] ========================================');

      // ✅ 元编程：追踪 multiModalContent 字段
      if (MULTI_MODAL_LOGGING_ENABLED && payloadData.multiModalContent) {
        console.log('[StoreMapper] 📸 multiModalContent received:', {
          messageId,
          hasMultiModal: true,
          itemCount: payloadData.multiModalContent.length,
          types: payloadData.multiModalContent.map((c: any) => c.type)
        });
      }
      const assistantId = correlationId;

      console.log('[StoreMapper] 📨 chat:message:sent received:', {
        messageId,
        correlationId,
        assistantId,
        content: content?.substring(0, 50),
        isAssistantOnly,
        isWorkflowMessage  // 🔥 检查是否是工作流消息
      });

      // 🔥 FIX: 工作流消息 → 创建用户消息 + 带 phaseData 的助手进度消息
      if (isWorkflowMessage) {
        console.log('[StoreMapper] 🔥 Workflow message — creating user + assistant progress message');

        const wfId = (payloadData as any).workflowId as string | undefined;
        const wfType = (payloadData as any).workflowType as string | undefined;

        // 🔥 生成 PhaseData（与 WorkflowIntentHandler 的 plannedNodes 一致）
        const plannedNodes = wfType === 'exploration'
          ? [{ id: 'explore', label: '探索项目' }]
          : wfType === 'test'
          ? [{ id: 'test', label: '生成测试' }]
          : [{ id: 'task', label: '执行任务' }];

        const phaseData: PhaseData[] = plannedNodes.map((node) => ({
          nodeId: node.id,
          mode: 'sequential' as const,
          intent: node.label,
          progress: 0,
          status: 'pending' as const,
        }));

        console.log('[StoreMapper] 📋 Workflow progress message with phaseData:', {
          workflowId: wfId, workflowType: wfType, phaseCount: phaseData.length,
        });

        // 🏆 线程感知路由：先确定消息应写入哪个线程的 bucket
        const payloadSessionId = payloadData.sessionId as string | undefined;
        const { currentThreadId } = useChatStore.getState();
        const isCrossThread = payloadSessionId
          && currentThreadId
          && payloadSessionId !== currentThreadId
          && !!useThreadStore.getState().getThread(payloadSessionId);

        const updater = (state: any) => {
          if (!state || !state.messages) return state;

          const filtered = state.messages.filter((m: any) => m.id !== messageId);

          // 🔥 FIX: 对工作流消息也应用单调递增计数器，确保 user.timestamp < assistant.timestamp
          // 避免从 IndexedDB 重载时相同时间戳导致不稳定排序
          const now = Date.now();
          const sequenceCounter = typeof window !== 'undefined' ? ++(window as any).__MESSAGE_SEQUENCE_COUNTER__ : 0;
          const userTimestamp = now + sequenceCounter * 100;
          const assistantTimestamp = userTimestamp + 1;

          // 如果已存在此 workflowId 的助手消息（由 workflow:started 提前创建），更新 phaseData + 修正 timestamp
          const existingIdx = filtered.findIndex(
            (m: any) => m.role === 'assistant' && m.metadata?.workflowId === wfId
          );

          if (existingIdx !== -1) {
            // 🔥 FIX: 将 user 消息插入到 assistant 消息之前（而非追加到末尾）
            const newMsgs = [...filtered];
            const userMessage = {
              id: messageId, role: 'user' as const, content, timestamp: userTimestamp,
              segments: [{ id: `seg-user-${messageId}`, type: 'text' as const, phase: 'pre-tool' as const, content, order: 1, timestamp: userTimestamp }],
              workflowRelated: true,
            };
            newMsgs.splice(existingIdx, 0, userMessage);
            newMsgs[existingIdx + 1] = {
              ...newMsgs[existingIdx + 1],
              timestamp: assistantTimestamp,
              metadata: {
                ...newMsgs[existingIdx + 1].metadata,
                phaseData: newMsgs[existingIdx + 1].metadata?.phaseData || phaseData,
              },
            };
            return {
              messages: newMsgs,
              isLoading: false,
            };
          }

          // 创建用户消息 + 助手进度消息（带 phaseData），使用单调递增时间戳
          return {
            messages: [
              ...filtered,
              {
                id: messageId, role: 'user', content, timestamp: userTimestamp,
                segments: [{ id: `seg-user-${messageId}`, type: 'text' as const, phase: 'pre-tool' as const, content, order: 1, timestamp: userTimestamp }],
                workflowRelated: true,
              },
              {
                id: assistantId || `wf-progress-${wfId}`,
                role: 'assistant',
                content: '',
                timestamp: assistantTimestamp,
                metadata: { workflowId: wfId, phaseData },
              },
            ],
            isLoading: false,
          };
        };

        if (isCrossThread && payloadSessionId) {
          // 🏆 跨线程场景：消息属于后台线程，直接写入 _messagesByThread[sessionId]
          // 不通过 updater 写当前线程的 state.messages
          console.log('[StoreMapper] 🔀 Cross-thread workflow message: routing to thread',
            payloadSessionId.substring(0, 8), `(current: ${currentThreadId?.substring(0, 8)})`);
          const existingByThread = useChatStore.getState()._messagesByThread || {};
          const targetBucket = existingByThread[payloadSessionId] || [];
          const result = updater({ messages: targetBucket, _messagesByThread: existingByThread, currentThreadId });
          if (result !== targetBucket && 'messages' in result) {
            useChatStore.setState({
              messages: (result as any).messages,
              _threadId: payloadSessionId,
              isLoading: (result as any).isLoading,
            } as any);
          }
        } else {
          useChatStore.setState(updater as any);
        }
        console.log('[StoreMapper] ✅ Workflow progress message created with phaseData');

        return;  // 🔥 提前返回，不执行后续逻辑
      }

      // ═════════════════════════════════════════════════════════════
      // 🔥 线程感知路由：消息写入创建时的线程，而非当前活跃线程
      // 参照 codex TUI store.active + ifainew TUI request_thread_id 模式
      // 元编程原则：路由检查与消息构建分离 — 构建逻辑由纯函数负责，此处仅做路由决策
      //
      // 防御性设计：仅当 sessionId 对应的线程在 threadStore 中真实存在时，
      // 才判定为跨线程路由。避免测试环境的合成 sessionId 触发误判。
      // ═════════════════════════════════════════════════════════════
      const payloadSessionId = payloadData.sessionId as string | undefined;
      if (payloadSessionId) {
        const { currentThreadId } = useChatStore.getState();
        if (currentThreadId && payloadSessionId !== currentThreadId) {
          // 验证目标线程真实存在于 threadStore 中（排除测试环境的合成 sessionId）
          const targetThread = useThreadStore.getState().getThread(payloadSessionId);
          if (targetThread) {
            console.log('[StoreMapper] 🔀 Cross-thread message: routing to thread',
              payloadSessionId.substring(0, 8), `(current: ${currentThreadId.substring(0, 8)})`);

            if (!isAssistantOnly) {
              const timestamps = createMessageTimestamps();
              const { userMessage, assistantMessage } = createInitialMessagePair(
                messageId, assistantId, content, payloadData.multiModalContent, timestamps,
              );

              // 直接持久化到正确线程的 IndexedDB
              persistInitialMessagesToThread(
                payloadSessionId, userMessage, assistantMessage, messageId, assistantId,
              );

              // 🔥 CRITICAL: 同时写入 _messagesByThread[sessionId]（不更新当前 messages 视图），
              // 确保 Part E (chat:stream:finished CSM 恢复) 能找到消息对象。
              // 否则 _messagesByThread 为空 → Part E 跳过 → 切回原线程时内容/骨架屏异常。
              // 🏆 Phase 4: 增强 _messagesByThread 存在性验证 + bucket 惰性初始化
              useChatStore.setState((storeState: any) => {
                const targetBucket = storeState._messagesByThread?.[payloadSessionId];
                if (!targetBucket) {
                  debugLog({
                    category: 'cross-thread',
                    level: 'warn',
                    message: `_messagesByThread bucket not found for ${payloadSessionId}, creating on the fly`,
                    threadId: payloadSessionId,
                    correlationId: messageId,
                  });
                }
                const existingBucket = targetBucket || [];
                const filtered = existingBucket.filter(
                  (m: any) => m.id !== messageId && m.id !== assistantId,
                );
                return {
                  _messagesByThread: {
                    ...storeState._messagesByThread,
                    [payloadSessionId]: [...filtered, userMessage, assistantMessage],
                  },
                };
              });
            }
            return;
          }
          // targetThread 不存在 → 非真实跨线程场景（可能是默认值或测试数据）→ 按同线程处理
        }
      }

      // 🏆 FIX: 清理旧的 chunk 标记，防止内存泄漏
      if (processedChunks[correlationId]) {
        delete processedChunks[correlationId];
      }

      // 🏆 FIX: 清理旧的 finishedStreams 标记，防止跨消息污染
      if (finishedStreams.has(correlationId)) {
        finishedStreams.delete(correlationId);
        console.log('[StoreMapper] 🧹 Cleaned up old finished stream marker for new message:', correlationId);
      }

      const updater = (state: any) => {
        // 🏆 物理隔离：如果是 AI 续播占位，严禁添加 User 消息
        if (isAssistantOnly) {
            const filtered = state.messages.filter((m: any) => m.id !== assistantId);
            console.log('[StoreMapper] 🤖 Assistant-only mode, creating assistant message:', assistantId);
            return {
                messages: [
                    ...filtered,
                    { id: assistantId, role: 'assistant', content: '', status: 'streaming', timestamp: Date.now() }
                ],
                isLoading: true
            };
        }

        // 正常 User + Assistant 模式
        const filtered = state.messages.filter((m: any) => m.id !== messageId && m.id !== assistantId);
        console.log('[StoreMapper] 👤 User + Assistant mode, creating both messages');

        const timestamps = createMessageTimestamps();
        const { userMessage, assistantMessage } = createInitialMessagePair(
          messageId, assistantId, content, payloadData.multiModalContent, timestamps,
        );

        // 🔴🟢 高保真日志点3：StoreMapper → Message Storage
        console.log('[StoreMapper] 🔴🟢 POINT-3: Creating user message with multiModalContent');
        console.log('[StoreMapper] ========================================');
        console.log('[StoreMapper] 💾 User message details:', {
            id: userMessage.id,
            role: userMessage.role,
            contentLength: userMessage.content?.length || 0,
            contentPreview: typeof userMessage.content === 'string' ? userMessage.content.substring(0, 100) : '[multimodal]',
            hasMultiModalContent: !!userMessage.multiModalContent,
            multiModalContent: userMessage.multiModalContent
                ? userMessage.multiModalContent.map((part: any, idx: number) => ({
                      index: idx,
                      type: part.type,
                      hasImageUrl: !!part.image_url,
                      hasText: !!part.text,
                      imageUrlPreview: part.image_url?.url?.substring(0, 50) + '...',
                      textPreview: part.text?.substring(0, 50) + '...',
                  }))
                : null,
            timestamp: userMessage.timestamp,
            segmentCount: userMessage.segments.length,
        });
        console.log('[StoreMapper] ========================================');

        const result = {
            messages: [...filtered, userMessage, assistantMessage],
            isLoading: true
        };

        console.log('[StoreMapper] ✅ Messages after creation:', result.messages.map(m => ({ id: m.id, role: m.role, timestamp: m.timestamp })));
        return result;
      };
      useChatStore.setState(updater as any);

      // 持久化到 IndexedDB（resolveTargetThreadId 统一处理线程 ID 解析）
      setTimeout(() => {
        const state = useChatStore.getState();
        const currentThreadId = resolveTargetThreadId(state);
        if (currentThreadId) {
          import('../persistence/threadPersistence').then(({ threadPersistence }) => {
            threadPersistence.saveThreadMessages(currentThreadId, state.messages as any).then(() => {
              console.log('[StoreMapper] ✅ Messages auto-saved to IndexedDB after chat:message:sent');
            }).catch(err => {
              console.error('[StoreMapper] ❌ Failed to auto-save messages:', err);
            });
          });
        } else {
          console.warn('[StoreMapper] ⚠️ No threadId available, skipping persistence');
        }
      }, 100);
    });

    // P3: 映射工作流启动 — 创建 assistant 进度消息 + 初始化 PhaseData
    chatEventBus.on('workflow:started', (payload) => {
      const { workflowId, nodes, correlationId, workflowType, sessionId } = payload as any;

      if (!workflowId || !nodes || !Array.isArray(nodes) || nodes.length === 0) {
        return;
      }

      // 将 PlannedNode[] 转为 PhaseData[]
      const phaseData: PhaseData[] = nodes.map((node: any) => ({
        nodeId: node.id || '',
        mode: 'sequential' as const,
        intent: node.label || node.id || '',
        progress: 0,
        status: 'pending' as const,
      }));

      console.log('[StoreMapper] 📋 workflow:started — initializing phaseData:', {
        workflowId,
        sessionId,
        phaseCount: phaseData.length,
        phases: phaseData.map((p: PhaseData) => `${p.nodeId}:${p.intent}`),
      });

      // 初始化 WorkflowData（TUI 列表格式）
      const workflowData = deriveUpdatedWorkflowData(
        undefined, workflowId, 'workflow:started', undefined, undefined, undefined, nodes,
      );

      // 🏆 线程感知路由：检查是否属于跨线程工作流
      const { currentThreadId } = useChatStore.getState();
      const isCrossThreadWorkflow = sessionId
        && currentThreadId
        && sessionId !== currentThreadId
        && !!useThreadStore.getState().getThread(sessionId);

      if (isCrossThreadWorkflow && sessionId) {
        // 跨线程场景：消息属于后台线程，在 _messagesByThread[sessionId] 中操作
        console.log('[StoreMapper] 🔀 Cross-thread workflow:started: routing to thread',
          sessionId.substring(0, 8), `(current: ${currentThreadId?.substring(0, 8)})`);

        const existingByThread = useChatStore.getState()._messagesByThread || {};
        const targetBucket = existingByThread[sessionId] || [];

        // 优先按 correlationId 匹配，再按 workflowId 回退
        const existingIdx = targetBucket.findIndex(
          (m: any) => m.role === 'assistant' && (
            (correlationId && m.id === correlationId) ||
            m.metadata?.workflowId === workflowId
          )
        );

        if (existingIdx !== -1) {
          const newBucket = [...targetBucket];
          newBucket[existingIdx] = {
            ...newBucket[existingIdx],
            metadata: { ...newBucket[existingIdx].metadata, workflowType, phaseData, workflowData },
          };
          useChatStore.setState({
            messages: newBucket,
            _threadId: sessionId,
          } as any);
          console.log('[StoreMapper] ✅ Cross-thread workflow:started — updated existing assistant message metadata');
        } else {
          // chat:message:sent 的 Fix 1 通常已创建 assistant 消息，此处作为兜底
          useChatStore.setState({
            messages: [
              ...targetBucket,
              {
                id: correlationId || `wf-progress-${workflowId}`,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                metadata: { workflowId, workflowType, phaseData, workflowData },
              },
            ],
            _threadId: sessionId,
          } as any);
          console.log('[StoreMapper] ✅ Cross-thread workflow:started — created new assistant progress message in target bucket');
        }
        return;
      }

      const updater = (state: any) => {
        if (!state || !state.messages) return state;

        // 如果已存在此 workflowId 的 assistant 消息，更新 phaseData + workflowData
        const existingIdx = state.messages.findIndex(
          (m: any) => m.role === 'assistant' && m.metadata?.workflowId === workflowId
        );

        if (existingIdx !== -1) {
          const newMsgs = [...state.messages];
          newMsgs[existingIdx] = {
            ...newMsgs[existingIdx],
            metadata: { ...newMsgs[existingIdx].metadata, workflowType, phaseData, workflowData },
          };
          return { messages: newMsgs };
        }

        // 创建新的 assistant 进度占位消息（包含 phaseData + workflowData）
        return {
          messages: [
            ...state.messages,
            {
              id: correlationId || `wf-progress-${workflowId}`,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              metadata: { workflowId, workflowType, phaseData, workflowData },
            },
          ],
        };
      };

      useChatStore.setState(updater as any);
    });

    // P4: 映射工作流响应
    // 🔥 FIX: 工作流完成后才创建 assistant 消息
    // 参考 claw-code：工作流执行期间不显示空白气泡，完成后一次性显示总结

    /** 声明式纯函数：从消息列表中查找指定工作流的 toolCalls（workflow:progress 期间累积） */
    function findToolCallsForWorkflow(messages: any[], wfId: string): any[] {
      const progress = messages.find(
        (m: any) => m.role === 'assistant' && m.metadata?.workflowId === wfId && m.toolCalls?.length > 0
      );
      return progress?.toolCalls || [];
    }

    // normalizeInteractionData 是模块级导出函数，供测试访问
    // 见文件顶部的 export function normalizeInteractionData

    chatEventBus.on('workflow:response', (payload) => {
      const { correlationId, response, workflowId, workflowType } = payload as any;

      console.log('[StoreMapper] 🔧 workflow:response received:', {
        correlationId,
        workflowId,
        workflowType,
        response: response?.substring(0, 50),
      });

      const updater = (state: any) => {
        // 🔥 DEBUG: 检查 state 状态
        console.log('[StoreMapper] 🔍 workflow:response updater called, state:', {
          hasState: !!state,
          hasMessages: !!state?.messages,
          messagesCount: state?.messages?.length || 0,
          correlationId,
        });

        // 🔥 FIX: 异常 state 时返回当前 state，保持不变
        // 注意：zustand v5 中 return null 会导致整个 state 被替换为 null！
        if (!state || !state.messages) {
          console.warn('[StoreMapper] ⚠️ State is null in workflow:response, preserving current state');
          return state;
        }

        // 🎯 声明式：toolCalls 是进度消息的属性，响应消息继承之
        const carriedToolCalls = findToolCallsForWorkflow(state.messages, workflowId);

        // 🔥 FIX: 检查是否已存在 assistant 消息
        // 优先按 correlationId 匹配；若不存在（如进度占位消息用 wf-progress-xxx ID），
        // 再按 workflowId 回退查找
        const assistantIndex = state.messages.findIndex((m: any) =>
          m.role === 'assistant' && (m.id === correlationId || m.metadata?.workflowId === workflowId)
        );

        console.log('[StoreMapper] 🔍 assistantIndex:', assistantIndex, 'carriedToolCalls:', carriedToolCalls.length);

        if (assistantIndex === -1) {
          // 🔥 跨线程场景：state.messages 已切换为其他线程，workflow 消息在 _messagesByThread 中
          const byThread = state._messagesByThread || {};
          let foundThreadId: string | null = null;
          let foundBucketIdx = -1;

          for (const tid of Object.keys(byThread)) {
            const bucket = byThread[tid] || [];
            foundBucketIdx = bucket.findIndex((m: any) =>
              m.role === 'assistant' && m.metadata?.workflowId === workflowId
            );
            if (foundBucketIdx !== -1) { foundThreadId = tid; break; }
          }

          if (foundThreadId && foundBucketIdx !== -1) {
            console.log('[StoreMapper] 🔄 Found workflow message in _messagesByThread[' + foundThreadId + '], routing cross-thread for response');
            const bucket = byThread[foundThreadId];
            // 从正确的线程 bucket 中查找 toolCalls
            const carriedToolCallsFromBucket = findToolCallsForWorkflow(bucket, workflowId);

            const newBucket = [...bucket];
            newBucket[foundBucketIdx] = {
              ...newBucket[foundBucketIdx],
              content: response,
              status: 'completed',
              timestamp: newBucket[foundBucketIdx].timestamp || Date.now(),
              toolCalls: [...(newBucket[foundBucketIdx].toolCalls || []), ...carriedToolCallsFromBucket],
              segments: [{
                id: `seg-workflow-${workflowId}`,
                type: 'text' as const,
                phase: 'pre-tool' as const,
                content: response,
                order: 1,
                timestamp: Date.now(),
              }],
              metadata: {
                ...newBucket[foundBucketIdx].metadata,
                workflowId,
                workflowType,
                correlationId,
              }
            };

            // 🔥 CRITICAL FIX: 检查是否有已缓存的工作流完成结果
            const cachedCompletion = workflowCompletionCache.get(workflowId);
            if (cachedCompletion) {
              console.log('[StoreMapper] 📦 Found cached completion result, applying immediately (cross-thread):', workflowId);
              const existingContent = response || '';
              const hasCompletionMarker = existingContent.includes('## ✅ 工作流执行完成');
              if (!hasCompletionMarker) {
                const finalContent = `${existingContent}\n\n${cachedCompletion.responseContent}`;
                newBucket[foundBucketIdx] = {
                  ...newBucket[foundBucketIdx],
                  content: finalContent,
                  segments: [
                    ...(newBucket[foundBucketIdx].segments || []),
                    {
                      id: `seg-workflow-completed-${workflowId}`,
                      type: 'text' as const,
                      phase: 'pre-tool' as const,
                      content: cachedCompletion.responseContent,
                      order: (newBucket[foundBucketIdx].segments?.length || 0) + 1,
                      timestamp: Date.now(),
                    }
                  ],
                  metadata: {
                    ...newBucket[foundBucketIdx].metadata,
                    completed: true,
                    completedAt: cachedCompletion.completed_at,
                  }
                };
              }
              workflowCompletionCache.delete(workflowId);
            }

            return { messages: newBucket, _threadId: foundThreadId, isLoading: false };
          }

          // 真找不到 → 创建 assistant 消息（原逻辑）
          console.log('[StoreMapper] ✅ Creating new assistant message for workflow response (no existing message found)');
          const assistantMessage = {
            id: correlationId,
            role: 'assistant',
            content: response,
            status: 'completed',
            timestamp: Date.now(),
            toolCalls: carriedToolCalls, // 声明式继承进度消息的 toolCalls
            segments: [{
              id: `seg-workflow-${workflowId}`,
              type: 'text' as const,
              phase: 'pre-tool' as const,
              content: response,
              order: 1,
              timestamp: Date.now(),
            }],
            metadata: {
              workflowId,
              workflowType,
              correlationId,
            }
          };

          return {
            messages: [...state.messages, assistantMessage],
            isLoading: false,
          };
        }

        // 🔥 备用流程：更新现有的 assistant 消息（如果已存在）
        // 这种情况可能发生在某些边缘情况或未来逻辑变更时
        const newMessages = [...state.messages];
        const originalTimestamp = newMessages[assistantIndex].timestamp;

        // 声明式：spread 保留所有已有属性（含 toolCalls），只覆盖需变更的字段
        newMessages[assistantIndex] = {
          ...newMessages[assistantIndex],
          content: response,
          status: 'completed',
          // 🔥 FIX: 保留原始时间戳，避免消息乱序
          timestamp: originalTimestamp || Date.now(),
          segments: [{
            id: `seg-workflow-${workflowId}`,
            type: 'text' as const,
            phase: 'pre-tool' as const,
            content: response,
            order: 1,
            timestamp: Date.now(),
          }],
          metadata: {
            ...newMessages[assistantIndex].metadata,
            workflowId,
            workflowType,
            correlationId,
          }
        };

        // 🔥 CRITICAL FIX: 检查是否有已缓存的工作流完成结果
        // 解决 workflow:completed 早于 workflow:response 的问题
        const cachedCompletion = workflowCompletionCache.get(workflowId);
        if (cachedCompletion) {
          console.log('[StoreMapper] 📦 Found cached completion result, applying immediately:', workflowId);

          // 应用缓存的完成结果
          const existingContent = response || '';
          const hasCompletionMarker = existingContent.includes('## ✅ 工作流执行完成');

          if (!hasCompletionMarker) {
            const finalContent = `${existingContent}\n\n${cachedCompletion.responseContent}`;

            newMessages[assistantIndex] = {
              ...newMessages[assistantIndex],
              content: finalContent,
              segments: [
                ...(newMessages[assistantIndex].segments || []),
                {
                  id: `seg-workflow-completed-${workflowId}`,
                  type: 'text' as const,
                  phase: 'pre-tool' as const,
                  content: cachedCompletion.responseContent,
                  order: (newMessages[assistantIndex].segments?.length || 0) + 1,
                  timestamp: Date.now(),
                }
              ],
              metadata: {
                ...newMessages[assistantIndex].metadata,
                completed: true,
                completedAt: cachedCompletion.completed_at,
              }
            };
          }

          // 清除缓存
          workflowCompletionCache.delete(workflowId);
          console.log('[StoreMapper] 🗑️ Cleared workflow completion cache for:', workflowId);
        }

        console.log('[StoreMapper] ✅ Updated assistant message with workflow response');

        return {
          messages: newMessages,
          isLoading: false,
        };
      };

      useChatStore.setState(updater as any);

      // 持久化到 IndexedDB + 触发 zustand persist（resolveTargetThreadId 统一处理线程 ID 解析）
      import('../persistence/threadPersistence').then(({ threadPersistence }) => {
        const state = useChatStore.getState();
        const currentThreadId = resolveTargetThreadId(state);
        if (!currentThreadId) {
          console.warn('[StoreMapper] ⚠️ No threadId available, skipping persistence');
          return;
        }

        const messages = state.messages;
        console.log('[StoreMapper] 💾 Triggering IMMEDIATE persistence after workflow response for thread:', currentThreadId);

        // 1. 保存到 IndexedDB
        threadPersistence.saveThreadMessages(currentThreadId, messages as any).then(() => {
          console.log('[StoreMapper] ✅ Messages saved to IndexedDB after workflow response');
        }).catch(err => {
          console.error('[StoreMapper] ❌ Failed to save messages to IndexedDB:', err);
        });

        // 2. 触发 zustand persist 的立即保存
        const currentState = useChatStore.getState();
        useChatStore.setState({
          ...currentState,
          _persistTrigger: Date.now(),
        } as any);

        console.log('[StoreMapper] ✅ Triggered zustand persist update after workflow response');
      }).catch(err => {
        console.error('[StoreMapper] ❌ Failed to trigger persistence after workflow response:', err);
      });
    });

    // P3.5: 映射工作流实时进度（流式显示进度 + PhaseCard sub items 更新）
    chatEventBus.on('workflow:progress', (payload) => {
      const { workflowId, event_type, node_id, message, tool_details, completion_stats } = payload as any;

      console.log('[StoreMapper] 📊 workflow:progress received:', {
        workflowId,
        event_type,
        node_id,
        message,
        hasToolDetails: !!tool_details,
        hasCompletionStats: !!completion_stats,
      });

      // 🔥 ask_user 或 request_user_input 工具调用：注入 interaction card
      const isAskUser = event_type === 'ask_user' || (event_type === 'tool_call' && tool_details?.tool_name === 'request_user_input');
      if (isAskUser && tool_details) {
        try {
          const toolInput = typeof tool_details.tool_input === 'string'
            ? JSON.parse(tool_details.tool_input)
            : (tool_details.tool_input || {});
          const interactionData = normalizeInteractionData(toolInput);
          // 从 tool_output 中提取 _feedback_req_id
          let feedbackRequestId: string | undefined;
          try {
            const toolOutput = typeof tool_details.tool_output === 'string'
              ? JSON.parse(tool_details.tool_output)
              : tool_details.tool_output;
            feedbackRequestId = toolOutput?._feedback_req_id;
          } catch { /* ignore parse errors */ }
          if (interactionData) {
            const interactionMsg = {
              id: `interaction-${workflowId}-${Date.now()}`,
              role: 'assistant' as const,
              content: '',
              timestamp: Date.now(),
              metadata: {
                workflowId,
                feedbackRequestId,
                interactionData,
              },
            };
            useChatStore.setState((state: any) => {
              if (!state?.messages) return state;
              // 🔥 FIX: 插入到 workflow 对应 assistant 消息之前（而非追加到末尾）
              // 确保 LLM 后续续播内容出现在 card 下方
              const assistantIndex = state.messages.findIndex((m: any) =>
                m.role === 'assistant' && m.metadata?.workflowId === workflowId
              );
              if (assistantIndex !== -1) {
                const before = state.messages.slice(0, assistantIndex);
                const after = state.messages.slice(assistantIndex);
                return { messages: [...before, interactionMsg, ...after] };
              }
              return { messages: [...state.messages, interactionMsg] };
            });
            console.log('[StoreMapper] 💬 Injected interaction card:', { workflowId, feedbackRequestId, questions: interactionData.questions.length });
          }
        } catch (err) {
          console.warn('[StoreMapper] ⚠️ Failed to process ask_user event:', err);
        }
        return; // ask_user 不执行后续进度更新逻辑
      }

      // 更新工作流消息，显示实时进度

      /** 声明式纯函数：计算 workflow progress 更新内容（同线程/跨线程通用） */
      function buildWorkflowProgressUpdate(
        existingMessage: any,
        event_type: string,
        message: string,
        node_id: string,
        tool_details: any,
        completion_stats: any,
      ) {
        const hasCustomContent = existingMessage.content &&
          (existingMessage.content.includes('总结') ||
           existingMessage.content.includes('进行中') ||
           existingMessage.content.includes('代码探索完成') ||
           existingMessage.content.includes('项目结构') ||
           existingMessage.content.includes('## ✅ 工作流执行完成'));

        let newContent = existingMessage.content;
        if (!hasCustomContent && event_type === 'node_started') {
          const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
          newContent = existingMessage.content + `\n\n#### 🔄 执行中... ( ${timestamp} )\n\n` + (message ? `${message}\n` : '');
        } else if (!hasCustomContent && message && event_type !== 'tool_call') {
          newContent = existingMessage.content + `${message}\n`;
        }

        const updatedPhaseData = deriveUpdatedPhaseData(
          existingMessage.metadata?.phaseData, event_type, node_id, tool_details,
        );

        const updatedWorkflowData = deriveUpdatedWorkflowData(
          existingMessage.metadata?.workflowData, workflowId, event_type, node_id, tool_details, completion_stats,
        );

        let updatedToolCalls = existingMessage.toolCalls ? [...existingMessage.toolCalls] : [];
        if (event_type === 'tool_call' && tool_details?.tool_name) {
          const toolName = tool_details.tool_name;
          const rawInput = tool_details.tool_input || '{}';
          const toolInputStr = typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput);
          let parsedArgs: any = toolInputStr;
          try { parsedArgs = JSON.parse(toolInputStr); } catch { /* 保留字符串 */ }

          updatedToolCalls.push({
            id: `wf-${workflowId}-${toolName}-${Date.now()}`,
            type: 'function',
            function: { name: toolName, arguments: toolInputStr },
            tool: toolName,
            args: parsedArgs,
            status: 'completed',
            result: tool_details.tool_output || '',
            isPartial: false,
          });
        }

        return { hasCustomContent, newContent, updatedPhaseData, updatedWorkflowData, updatedToolCalls };
      }

      const updater = (state: any) => {
        if (!state || !state.messages) {
          console.warn('[StoreMapper] ⚠️ State is invalid in workflow:progress handler, preserving current state');
          return state;
        }

        // 查找包含此 workflowId 的助手消息
        const assistantIndex = state.messages.findIndex((m: any) =>
          m.role === 'assistant' &&
          m.metadata?.workflowId === workflowId
        );

        if (assistantIndex === -1) {
          // 🔥 跨线程场景：state.messages 已切换为其他线程，workflow 消息在 _messagesByThread 中
          const byThread = state._messagesByThread || {};
          let foundThreadId: string | null = null;
          let foundBucketIdx = -1;

          for (const tid of Object.keys(byThread)) {
            const bucket = byThread[tid] || [];
            foundBucketIdx = bucket.findIndex((m: any) =>
              m.role === 'assistant' && m.metadata?.workflowId === workflowId
            );
            if (foundBucketIdx !== -1) {
              foundThreadId = tid;
              break;
            }
          }

          if (foundThreadId && foundBucketIdx !== -1) {
            console.log('[StoreMapper] 🔄 Found workflow message in _messagesByThread[' + foundThreadId + '], routing cross-thread');
            const bucket = byThread[foundThreadId];
            const existingMessage = bucket[foundBucketIdx];
            const update = buildWorkflowProgressUpdate(existingMessage, event_type, message, node_id, tool_details, completion_stats);

            const newBucket = [...bucket];
            newBucket[foundBucketIdx] = {
              ...existingMessage,
              content: update.newContent,
              timestamp: existingMessage.timestamp || Date.now(),
              toolCalls: update.updatedToolCalls,
              metadata: {
                ...existingMessage.metadata,
                phaseData: update.updatedPhaseData,
                workflowData: update.updatedWorkflowData,
                lastProgressUpdate: Date.now(),
              },
            };

            return { messages: newBucket, _threadId: foundThreadId };
          }

          console.warn('[StoreMapper] ⚠️ Workflow message not found for progress:', workflowId);
          return state;
        }

        const existingMessage = state.messages[assistantIndex];
        const update = buildWorkflowProgressUpdate(existingMessage, event_type, message, node_id, tool_details, completion_stats);

        const newMessages = [...state.messages];
        newMessages[assistantIndex] = {
          ...existingMessage,
          content: update.newContent,
          // 🔥 FIX: 保留原始消息时间戳，不随每次进度事件更新
          // 避免 content area 中消息排序跳动导致乱序
          timestamp: existingMessage.timestamp || Date.now(),
          toolCalls: update.updatedToolCalls,
          metadata: {
            ...existingMessage.metadata,
            phaseData: update.updatedPhaseData,
            workflowData: update.updatedWorkflowData,
            lastProgressUpdate: Date.now(),
          },
        };

        return { messages: newMessages };
      };

      useChatStore.setState(updater as any);
    });

    // 🏆 workflow:feedback — 用户反馈回传（InteractionCard ➔ Tauri command）
    chatEventBus.on('workflow:feedback', (payload: any) => {
      const { workflowId, questionAnswers, action, feedbackRequestId: directFeedbackReqId } = payload;

      console.log('[StoreMapper] 📤 workflow:feedback received:', { workflowId, questionAnswers, action });

      // 从 store 中查找 feedbackRequestId
      let feedbackRequestId = directFeedbackReqId;
      if (!feedbackRequestId) {
        const currentState = useChatStore.getState();
        if (currentState?.messages && workflowId) {
          const interactionMsg = currentState.messages.find(
            (m: any) => m.metadata?.workflowId === workflowId && m.metadata?.feedbackRequestId
          );
          feedbackRequestId = (interactionMsg as any)?.metadata?.feedbackRequestId;
        }
      }

      if (!feedbackRequestId) {
        console.warn('[StoreMapper] ⚠️ workflow:feedback: no feedbackRequestId found');
        return;
      }

      // 调用 Tauri command 回传反馈
      invoke('submit_user_feedback', {
        feedbackRequestId: feedbackRequestId,
        feedback: { questionAnswers, action },
      }).then(() => {
        console.log('[StoreMapper] ✅ Feedback submitted:', workflowId);
      }).catch((err: any) => {
        console.error('[StoreMapper] ❌ Feedback submission failed:', err);
      });

      // 更新对应 interaction 消息的状态为 answered
      useChatStore.setState((state: any) => {
        if (!state?.messages) return state;
        const updated = state.messages.map((m: any) => {
          if (m.metadata?.interactionData) {
            if (workflowId && m.metadata?.workflowId === workflowId) {
              return { ...m, status: 'answered' as const };
            }
            if (feedbackRequestId && m.metadata?.feedbackRequestId === feedbackRequestId) {
              return { ...m, status: 'answered' as const };
            }
          }
          return m;
        });
        return { messages: updated };
      });
    });

    /** 根据 event_type 推导 PhaseData 的 status 和 progress */
    function derivePhaseStatus(event_type: string): { status: PhaseData['status']; progress: number } {
      switch (event_type) {
        case 'node_started':
          return { status: 'running', progress: 0 };
        case 'node_progress':
          return { status: 'running', progress: 50 };
        case 'node_completed':
          return { status: 'done', progress: 100 };
        default:
          return { status: 'running', progress: 0 };
      }
    }

    /**
     * 更新 phaseData 中匹配 nodeId 的状态和 sub items
     *
     * 声明式策略：根据 event_type 推导 status/progress，
     * 根据 tool_details 推导 sub items（PhaseCard FileTree 数据源）。
     * 参考 design.md §6.4 数据消费规则
     */
    function deriveUpdatedPhaseData(
      phaseData: PhaseData[] | undefined,
      event_type: string,
      node_id: string | undefined,
      tool_details?: any,
    ): PhaseData[] | undefined {
      if (!phaseData || !node_id) return phaseData;
      const update = derivePhaseStatus(event_type);
      let phaseMatched = false;
      const updated = phaseData.map((p: PhaseData) => {
        if (p.nodeId !== node_id) return p;
        phaseMatched = true;
        const base = { ...p, status: update.status, progress: update.progress };
        // 🔥 从 tool_details 提取 sub items（PhaseCard FileTree 的数据源）
        if (tool_details) {
          const toolName = tool_details.tool_name || '';
          const toolInput = tool_details.tool_input || '';
          // 解析工具输入中的文件路径
          const parsedSub = parseToolDetailsToSubItems(toolName, toolInput, tool_details, event_type);
          if (parsedSub.length > 0) {
            // 合并到现有 sub（去重）
            const existingSub = base.sub || [];
            const merged = mergeSubItems(existingSub, parsedSub);
            base.sub = merged;
          }
        }
        // node_completed → 标记所有 sub items 为 done
        if (event_type === 'node_completed' && base.sub) {
          base.sub = base.sub.map(s => ({ ...s, status: 'done' as const }));
        }
        return base;
      });
      // 如果没有 phase 匹配 node_id，且 event 不是 pending 初始态，则新建一个 phase
      if (!phaseMatched && event_type !== 'workflow:started') {
        const newSub: import('../../types/workflow').SubItem[] = [];
        if (tool_details) {
          const toolName = tool_details.tool_name || '';
          const toolInput = tool_details.tool_input || '';
          const parsedSub = parseToolDetailsToSubItems(toolName, toolInput, tool_details, event_type);
          newSub.push(...parsedSub);
        }
        updated.push({
          nodeId: node_id,
          mode: 'sequential',
          intent: node_id.replace(/[_-]/g, ' '),
          progress: update.progress,
          status: update.status,
          sub: newSub.length > 0 ? newSub : undefined,
        });
      }
      return updated;
    }

    /** 从 tool_details 解析 SubItem[]（声明式映射表驱动） */
    function parseToolDetailsToSubItems(toolName: string, toolInput: string, details: any, event_type: string): import('../../types/workflow').SubItem[] {
      const status: PhaseData['status'] = event_type === 'node_completed' ? 'done' : 'running';
      const items: import('../../types/workflow').SubItem[] = [];

      // 尝试从 toolInput 解析 JSON
      let parsed: any = null;
      try {
        parsed = typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput;
      } catch { /* not JSON, skip */ }

      // agent_read_file / agent_scan_project → 提取文件路径
      if (toolName === 'agent_read_file' || toolName === 'read_file') {
        const path = parsed?.rel_path || parsed?.path || details.tool_output || '';
        if (path) {
          items.push({ name: typeof path === 'string' ? path : String(path), status });
        }
      } else if (toolName === 'agent_scan_project' || toolName === 'scan_project') {
        const path = parsed?.path || parsed?.target_path || '.';
        items.push({ name: `scan ${typeof path === 'string' ? path : '.'}`, status });
      } else if (parsed?.rel_path) {
        items.push({ name: parsed.rel_path, status });
      } else if (parsed?.path) {
        items.push({ name: parsed.path, status });
      }

      return items;
    }

    /** 合并 sub items（去重：同名 item 取最新 status） */
    function mergeSubItems(existing: import('../../types/workflow').SubItem[], incoming: import('../../types/workflow').SubItem[]): import('../../types/workflow').SubItem[] {
      const map = new Map<string, import('../../types/workflow').SubItem>();
      for (const item of existing) {
        map.set(item.name, item);
      }
      for (const item of incoming) {
        map.set(item.name, item); // 覆盖旧状态
      }
      return Array.from(map.values());
    }

    /**
     * 从 ProgressEvent 构建/更新 WorkflowData（TUI 列表格式）
     *
     * 声明式策略：根据 event_type 推导节点/工具状态变更，
     * 增量更新 workflowData 而非全量重建。
     * 参考 design.md §4.4
     */
    function deriveUpdatedWorkflowData(
      existing: WorkflowData | undefined,
      workflowId: string,
      event_type: string,
      node_id: string | undefined,
      tool_details?: any,
      completion_stats?: any,
      plannedNodes?: any[],
    ): WorkflowData | undefined {
      // 首次初始化必须由 workflow:started 触发
      if (!existing && event_type !== 'workflow:started') return existing;

      let data: WorkflowData;

      if (!existing) {
        // workflow:started → 创建初始结构
        const nodes: NodeData[] = (plannedNodes || []).map((n: any) => ({
          nodeId: n.id || n.nodeId || '',
          agentType: n.agent_type || n.agentType || '',
          intent: n.label || n.intent || '',
          status: 'pending' as const,
          tools: [],
          elapsedSecs: 0,
          totalTokens: 0,
        }));
        data = {
          workflowId,
          intent: nodes[0]?.intent || '',
          nodes,
          totalElapsedSecs: 0,
          totalTokens: 0,
          totalTools: 0,
          status: 'running',
        };
        return data;
      }

      // 深拷贝避免引用共享
      data = JSON.parse(JSON.stringify(existing));
      if (!node_id) return data;

      const nodeIdx = data.nodes.findIndex((n: NodeData) => n.nodeId === node_id);
      if (nodeIdx === -1) return data;

      const node: NodeData = { ...data.nodes[nodeIdx] };

      switch (event_type) {
        case 'node_started':
          node.status = 'running';
          break;

        case 'tool_call':
          if (tool_details) {
            const toolName = tool_details.tool_name || '';
            // 跳过空工具名
            if (!toolName) break;
            const rawInput = typeof tool_details.tool_input === 'string' ? tool_details.tool_input : '';
            // 尝试从 JSON tool_input 提取文件路径作为 target
            let target: string | undefined;
            if (rawInput) {
              try {
                const parsed = JSON.parse(rawInput);
                target = parsed.rel_path || parsed.path || rawInput.substring(0, 80);
              } catch {
                target = rawInput.substring(0, 80);
              }
            }
            // 去重：同名工具 + 同 target 时跳过（tool loop 多轮迭代可能重复执行同一工具）
            const isDuplicate = target && node.tools.some(
              (t: ToolItem) => t.toolName === toolName && t.target === target,
            );
            if (!isDuplicate) {
              node.tools = [...node.tools, {
                toolName,
                status: 'done' as const,
                elapsedSecs: tool_details.execution_time_ms
                  ? tool_details.execution_time_ms / 1000
                  : 0,
                target,
                tokenCount: tool_details.output_length || 0,
              }];
            }
            node.totalTokens = node.tools.reduce((s: number, t: ToolItem) => s + (t.tokenCount || 0), 0);
          }
          break;

        case 'node_completed':
          node.status = 'done';
          if (completion_stats) {
            node.elapsedSecs = (completion_stats.duration_ms || 0) / 1000;
            node.totalTokens = completion_stats.token_count || node.totalTokens;
          }
          break;
      }

      data.nodes[nodeIdx] = node;

      // 更新工作流汇总
      data.totalElapsedSecs = data.nodes.reduce(
        (max: number, n: NodeData) => Math.max(max, n.elapsedSecs), 0,
      );
      data.totalTools = data.nodes.reduce(
        (sum: number, n: NodeData) => sum + n.tools.length, 0,
      );
      data.totalTokens = data.nodes.reduce(
        (sum: number, n: NodeData) => sum + (n.totalTokens || 0), 0,
      );

      return data;
    }

    // 🔥 工作流完成结果缓存（解决 workflow:completed 早于消息创建的问题）
    const workflowCompletionCache = new Map<string, {
      responseContent: string;
      completed_at: number;
      status: string;
      node_results: any;
    }>();

    // P4: 映射工作流执行完成（显示详细执行结果）
    // 🔥 FIX: 由于 chat:message:sent 不再创建空的 assistant 消息，这里可能会找不到消息
    // 如果找不到消息，会将结果缓存起来，等待 workflow:response 或后续逻辑处理
    chatEventBus.on('workflow:completed', (payload) => {
      const { workflow_id, status, node_results, started_at, completed_at } = payload as any;

      console.log('[StoreMapper] ✅ workflow:completed received:', {
        workflow_id,
        status,
        nodes_count: Object.keys(node_results || {}).length,
        node_results_keys: Object.keys(node_results || {}),
      });

      // 🔥 详细打印每个节点的结果
      if (node_results) {
        for (const [nodeId, nodeResult] of Object.entries(node_results)) {
          const result = nodeResult as any;
          console.log(`[StoreMapper] 🔍 Node ${nodeId}:`, {
            status: result.status,
            has_output: !!result.output,
            output_length: result.output?.length || 0,
            output_preview: result.output?.substring(0, 100),
            has_error: !!result.error,
          });
        }
      }

      // 🔥 生成详细的执行结果响应
      let responseContent = `## ✅ 工作流执行完成\n\n`;
      responseContent += `**工作流 ID**: \`${workflow_id}\`\n`;
      responseContent += `**状态**: ${status}\n`;

      if (started_at && completed_at) {
        const duration = ((completed_at - started_at) / 1000).toFixed(2);
        responseContent += `**执行时长**: ${duration} 秒\n`;
      }

      responseContent += `\n### 📊 节点执行结果\n\n`;

      const results = node_results || {};
      const nodeIds = Object.keys(results);

      if (nodeIds.length === 0) {
        responseContent += `⚠️ 没有节点执行结果\n`;
      } else {
        for (const nodeId of nodeIds) {
          const nodeResult = results[nodeId];
          // 🔥 修复：后端序列化后是小写（completed, failed, skipped）
          const statusIcon = nodeResult.status === 'completed' ? '✅' :
                            nodeResult.status === 'failed' ? '❌' :
                            nodeResult.status === 'skipped' ? '⏭️' : '⏳';

          responseContent += `#### ${statusIcon} **${nodeId}**\n\n`;
          responseContent += `**状态**: ${nodeResult.status}\n`;

          if (nodeResult.output) {
            responseContent += `**输出**:\n\`\`\`\n${nodeResult.output}\n\`\`\`\n\n`;
          }

          if (nodeResult.error) {
            responseContent += `**错误**: ${nodeResult.error}\n\n`;
          }
        }
      }

      // 🔥 CRITICAL FIX: 在更新 state 之前，先将结果缓存起来
      // 这样即使 state 为 null 或消息不存在，结果也不会丢失
      console.log('[StoreMapper] 💾 Caching workflow completion result before state update:', workflow_id);
      workflowCompletionCache.set(workflow_id, {
        responseContent,
        completed_at,
        status,
        node_results
      });

      // 查找并更新对应的工作流消息
      // 我们需要通过 workflow_id 找到相关消息
      const updater = (state: any) => {
        // 🔥 FIX: 异常 state 时返回当前 state，保持不变
        // 注意：zustand v5 中 return null 会导致整个 state 被替换为 null！
        if (!state || !state.messages) {
          console.warn('[StoreMapper] ⚠️ State is invalid in workflow:completed handler, preserving current state');
          return state;
        }

        // 查找包含此 workflowId 的助手消息
        const assistantIndex = state.messages.findIndex((m: any) =>
          m.role === 'assistant' &&
          m.metadata?.workflowId === workflow_id
        );

        if (assistantIndex === -1) {
          // 🔥 跨线程场景：state.messages 已切换为其他线程，workflow 消息在 _messagesByThread 中
          const byThread = state._messagesByThread || {};
          let foundThreadId: string | null = null;
          let foundBucketIdx = -1;

          for (const tid of Object.keys(byThread)) {
            const bucket = byThread[tid] || [];
            foundBucketIdx = bucket.findIndex((m: any) =>
              m.role === 'assistant' && m.metadata?.workflowId === workflow_id
            );
            if (foundBucketIdx !== -1) { foundThreadId = tid; break; }
          }

          if (foundThreadId && foundBucketIdx !== -1) {
            console.log('[StoreMapper] 🔄 Found workflow message in _messagesByThread[' + foundThreadId + '], routing cross-thread for completion');
            const bucket = byThread[foundThreadId];
            const existingMessage = bucket[foundBucketIdx];
            const existingContent = existingMessage.content || '';

            // 检查是否已有工作流完成标记
            const hasCompletionMarker = existingContent.includes('## ✅ 工作流执行完成');

            // 追加工作流完成结果
            const finalContent = hasCompletionMarker
              ? existingContent
              : `${existingContent}\n\n${responseContent}`;

            // 终态化 phaseData
            const currentPhaseData: PhaseData[] = existingMessage.metadata?.phaseData || [];
            const finalizedPhaseData = currentPhaseData.length > 0
              ? currentPhaseData.map((p: PhaseData) =>
                  p.status !== 'done' ? { ...p, status: 'done' as const, progress: 100 } : p
                )
              : currentPhaseData;

            // 终态化 workflowData
            const currentWorkflowData: WorkflowData | undefined = existingMessage.metadata?.workflowData;
            const finalizedWorkflowData: WorkflowData | undefined = currentWorkflowData
              ? { ...currentWorkflowData, status: 'done' as const }
              : currentWorkflowData;

            const newBucket = [...bucket];
            newBucket[foundBucketIdx] = {
              ...existingMessage,
              content: finalContent,
              status: 'completed',
              timestamp: existingMessage.timestamp || Date.now(),
              segments: hasCompletionMarker ? existingMessage.segments : [
                ...(existingMessage.segments || []),
                {
                  id: `seg-workflow-completed-${workflow_id}`,
                  type: 'text' as const,
                  phase: 'pre-tool' as const,
                  content: responseContent,
                  order: (existingMessage.segments?.length || 0) + 1,
                  timestamp: Date.now(),
                }
              ],
              metadata: {
                ...existingMessage.metadata,
                phaseData: finalizedPhaseData,
                workflowData: finalizedWorkflowData,
                completed: true,
                completedAt: completed_at,
              }
            };

            return { messages: newBucket, _threadId: foundThreadId, isLoading: false };
          }

          // 🔥 FIX: 找不到消息时，创建新的 assistant 消息
          // 这发生在 workflow:response 没有触发的情况下
          console.log('[StoreMapper] ✅ Creating new assistant message for workflow completion (no existing message found)');

          // 查找最近的用户消息来获取 correlationId
          const userMessage = state.messages.findLast((m: any) => m.role === 'user' && m.workflowRelated);
          const correlationId = userMessage?.id || `assistant-${Date.now()}`;

          const assistantMessage = {
            id: correlationId,
            role: 'assistant',
            content: responseContent,
            status: 'completed',
            timestamp: Date.now(),
            segments: [{
              id: `seg-workflow-${workflow_id}`,
              type: 'text' as const,
              phase: 'pre-tool' as const,
              content: responseContent,
              order: 1,
              timestamp: Date.now(),
            }],
            metadata: {
              workflowId: workflow_id,
              correlationId,
              completed: true,
              completedAt: completed_at,
            }
          };

          return {
            messages: [...state.messages, assistantMessage],
            isLoading: false,
          };
        }

        console.log('[StoreMapper] ✅ Found workflow message at index:', assistantIndex);

        // 更新现有消息
        const newMessages = [...state.messages];
        const existingMessage = newMessages[assistantIndex];

        // 🔥 FIX: 工作流完成后，将详细结果追加到消息内容中
        // 这样即使监控器被移除，用户也能在历史消息中看到完整的工作流结果
        const existingContent = existingMessage.content || '';

        // 检查是否已有工作流完成标记（避免重复追加）
        const hasCompletionMarker = existingContent.includes('## ✅ 工作流执行完成');

        // 追加工作流完成结果到现有内容
        const finalContent = hasCompletionMarker
          ? existingContent  // 已有完成标记，不重复追加
          : `${existingContent}\n\n${responseContent}`;  // 追加完成结果

        // 工作流完成 → 将所有非 done 的 phase 标记为 done
        const currentPhaseData: PhaseData[] = existingMessage.metadata?.phaseData || [];
        const finalizedPhaseData = currentPhaseData.length > 0
          ? currentPhaseData.map((p: PhaseData) =>
              p.status !== 'done' ? { ...p, status: 'done' as const, progress: 100 } : p
            )
          : currentPhaseData;

        // 工作流完成 → 终态 workflowData
        const currentWorkflowData: WorkflowData | undefined = existingMessage.metadata?.workflowData;
        const finalizedWorkflowData: WorkflowData | undefined = currentWorkflowData
          ? { ...currentWorkflowData, status: 'done' as const }
          : currentWorkflowData;

        newMessages[assistantIndex] = {
          ...existingMessage,
          // 🔥 CRITICAL: 追加工作流完成结果到现有内容
          content: finalContent,
          status: 'completed',
          // 🔥 FIX: 保留原始时间戳，避免消息乱序
          timestamp: existingMessage.timestamp || Date.now(),
          segments: hasCompletionMarker ? existingMessage.segments : [
            ...(existingMessage.segments || []),
            {
              id: `seg-workflow-completed-${workflow_id}`,
              type: 'text' as const,
              phase: 'pre-tool' as const,
              content: responseContent,
              order: (existingMessage.segments?.length || 0) + 1,
              timestamp: Date.now(),
            }
          ],
          metadata: {
            ...existingMessage.metadata,
            phaseData: finalizedPhaseData,
            workflowData: finalizedWorkflowData,
            completed: true,
            completedAt: completed_at,
          }
        };

        console.log('[StoreMapper] ✅ Updated message with workflow completion results', {
          contentPreview: existingMessage.content?.substring(0, 50)
        });

        return {
          messages: newMessages,
          isLoading: false,
        };
      };

      const updateResult = useChatStore.setState(updater as any);
      if (updateResult === null) {
        console.warn('[StoreMapper] ⚠️ No update applied for workflow completion');
      } else {
        // 🔥 CRITICAL FIX: 立即触发持久化保存，确保工作流完成结果不会因为用户快速刷新而丢失
        // 问题：消息被保存到 IndexedDB，但是刷新后不会自动恢复到 useChatStore
        // 解决：同时保存到两个地方
        // 1. IndexedDB（通过 saveThreadMessages）- 用于跨线程持久化
        // 2. 触发 zustand persist 的立即保存 - 用于刷新后恢复
        import('../persistence/threadPersistence').then(({ threadPersistence }) => {
          const state = useChatStore.getState();
          let currentThreadId = state.currentThreadId;

          // 🔥 FIX: 获取 threadStore 中的 activeThreadId
          // 因为 currentThreadId 可能不准确，应该使用 activeThreadId
          import('@/stores/threadStore').then(({ useThreadStore }) => {
            const threadState = useThreadStore.getState();
            const activeThreadId = threadState.activeThreadId;

            // 如果 activeThreadId 存在且不是 currentThreadId，使用 activeThreadId
            if (activeThreadId && activeThreadId !== currentThreadId) {
              console.warn('[StoreMapper] ⚠️ currentThreadId != activeThreadId, using activeThreadId:', {
                currentThreadId,
                activeThreadId
              });
              currentThreadId = activeThreadId;

              // 🔥 CRITICAL: 立即更新 currentThreadId，确保后续操作使用正确的 threadId
              useChatStore.setState({ currentThreadId: activeThreadId } as any);
            }

            // 🔥 FIX: 如果 currentThreadId 是 undefined 或无效，使用 activeThreadId
            // ⚠️ 'default-thread' 是合法的初始线程 ID，不应被覆盖
            if (!currentThreadId || currentThreadId === 'undefined') {
              if (activeThreadId) {
                console.warn('[StoreMapper] ⚠️ currentThreadId is invalid, using activeThreadId:', activeThreadId);
                currentThreadId = activeThreadId;

                // 🔥 CRITICAL: 立即更新 currentThreadId
                useChatStore.setState({ currentThreadId: activeThreadId } as any);
              } else {
                console.warn('[StoreMapper] ⚠️ No activeThreadId, will create new thread if needed');
              }
            }

            const messages = state.messages;
            console.log('[StoreMapper] 💾 Triggering IMMEDIATE persistence after workflow completion for thread:', currentThreadId);

            // 1. 保存到 IndexedDB
            threadPersistence.saveThreadMessages(currentThreadId, messages as any).then(() => {
              console.log('[StoreMapper] ✅ Messages saved to IndexedDB after workflow completion');
            }).catch(err => {
              console.error('[StoreMapper] ❌ Failed to save messages to IndexedDB:', err);
            });

            // 2. 🔥 CRITICAL: 触发 zustand persist 的立即保存
            // zustand 的 persist 中间件会监听 state 变化并自动保存，但保存是异步的
            // 我们需要确保状态变化被 persist 捕获
            // 通过再次 setState 一个新对象，确保 persist 触发保存
            const currentState = useChatStore.getState();
            useChatStore.setState({
              ...currentState,
              _persistTrigger: Date.now() // 添加一个变化字段，确保 persist 捕获到更新
            } as any);

            console.log('[StoreMapper] ✅ Triggered zustand persist update after workflow completion');
          });
        }).catch(err => {
          console.error('[StoreMapper] ❌ Failed to trigger persistence after workflow completion:', err);
        });
      }
    });

    // 🔥 P4.5: 映射工作流取消
    chatEventBus.on('workflow:cancelled', (payload) => {
      const { workflowId } = payload as any;

      console.log('[StoreMapper] ⚠️ workflow:cancelled received:', {
        workflowId,
      });

      // 更新全局工作流状态
      import('@/components/workflow/WorkflowInlineMonitor').then(({ updateGlobalWorkflowState }) => {
        updateGlobalWorkflowState(workflowId, {
          status: 'cancelled' as const,
          endTime: Date.now(),
        });
      }).catch(err => {
        console.error('[StoreMapper] ❌ Failed to update global workflow state on cancelled:', err);
      });

      const updater = (state: any) => {
        if (!state || !state.messages) {
          console.warn('[StoreMapper] ⚠️ State is invalid in workflow:cancelled handler, preserving current state');
          return state;
        }

        // 查找包含此 workflowId 的助手消息
        const assistantIndex = state.messages.findIndex((m: any) =>
          m.role === 'assistant' &&
          m.metadata?.workflowId === workflowId
        );

        if (assistantIndex === -1) {
          // 🔥 跨线程场景：搜索 _messagesByThread
          const byThread = state._messagesByThread || {};
          let foundThreadId: string | null = null;
          let foundBucketIdx = -1;

          for (const tid of Object.keys(byThread)) {
            const bucket = byThread[tid] || [];
            foundBucketIdx = bucket.findIndex((m: any) =>
              m.role === 'assistant' && m.metadata?.workflowId === workflowId
            );
            if (foundBucketIdx !== -1) { foundThreadId = tid; break; }
          }

          if (foundThreadId && foundBucketIdx !== -1) {
            console.log('[StoreMapper] 🔄 Found workflow message in _messagesByThread[' + foundThreadId + '], routing cross-thread for cancellation');
            const bucket = byThread[foundThreadId];
            const existingMessage = bucket[foundBucketIdx];
            const existingContent = existingMessage.content || '';
            const cancelledContent = `${existingContent}\n\n## ⚠️ 工作流已取消\n\n执行被用户中断。`;

            const newBucket = [...bucket];
            newBucket[foundBucketIdx] = {
              ...existingMessage,
              content: cancelledContent,
              status: 'completed',
              timestamp: existingMessage.timestamp || Date.now(),
              segments: [
                ...(existingMessage.segments || []),
                {
                  id: `seg-workflow-cancelled-${workflowId}`,
                  type: 'text' as const,
                  phase: 'pre-tool' as const,
                  content: '\n\n## ⚠️ 工作流已取消\n\n执行被用户中断。',
                  order: (existingMessage.segments?.length || 0) + 1,
                  timestamp: Date.now(),
                }
              ],
              metadata: {
                ...existingMessage.metadata,
                completed: true,
                completedAt: Date.now(),
                cancelled: true,
              }
            };

            return { messages: newBucket, _threadId: foundThreadId };
          }

          console.warn('[StoreMapper] ⚠️ Assistant message not found anywhere for cancelled workflow:', workflowId);
          return state;
        }

        const existingMessage = state.messages[assistantIndex];
        const existingContent = existingMessage.content || '';

        // 构建取消消息内容
        const cancelledContent = `${existingContent}\n\n## ⚠️ 工作流已取消\n\n执行被用户中断。`;

        const newMessages = [...state.messages];
        newMessages[assistantIndex] = {
          ...existingMessage,
          content: cancelledContent,
          status: 'completed',
          // 🔥 FIX: 保留原始时间戳，避免消息乱序
          timestamp: existingMessage.timestamp || Date.now(),
          segments: [
            ...(existingMessage.segments || []),
            {
              id: `seg-workflow-cancelled-${workflowId}`,
              type: 'text' as const,
              phase: 'pre-tool' as const,
              content: '\n\n## ⚠️ 工作流已取消\n\n执行被用户中断。',
              order: (existingMessage.segments?.length || 0) + 1,
              timestamp: Date.now(),
            }
          ],
          metadata: {
            ...existingMessage.metadata,
            completed: true,
            completedAt: Date.now(),
            cancelled: true,
          }
        };

        console.log('[StoreMapper] ✅ Updated message with workflow cancellation');

        return {
          messages: newMessages,
          isLoading: false,
        };
      };

      useChatStore.setState(updater as any);
    });

    // P4: 映射工作流错误
    chatEventBus.on('workflow:error', (payload) => {
      const { correlationId, error } = payload as any;
      const assistantId = correlationId;

      console.log('[StoreMapper] ❌ workflow:error received:', {
        correlationId,
        error,
      });

      const errorMessage = `❌ 工作流执行失败\n\n${error}`;

      const updater = (state: any) => {
        const filtered = state.messages.filter((m: any) => m.id !== assistantId);
        const assistantMessage = {
          id: assistantId,
          role: 'assistant',
          content: errorMessage,
          status: 'completed',
          timestamp: Date.now(),
          segments: [{
            id: `seg-workflow-error-${assistantId}`,
            type: 'text' as const,
            phase: 'pre-tool' as const,
            content: errorMessage,
            order: 1,
            timestamp: Date.now(),
          }],
        };

        return {
          messages: [...filtered, assistantMessage],
          isLoading: false,
        };
      };

      useChatStore.setState(updater as any);
    });

    // 2. 映射流式 Chunk (🏆 已注销：内容更新现由 contentSegmentManager 统一管理)
    // chatEventBus.on('chat:stream:chunk', (payload) => { ... });

    // 3. 映射工具调用请求 (气泡渲染 + 覆盖保护)
    chatEventBus.on('chat:tool:call', (payload) => {
      const { correlationId, toolId, name, arguments: args, sessionId } = payload;

      // 🔥 DIAG: 检查 TOOL_PERMISSIONS 门控
      const toolPerm = TOOL_PERMISSIONS[name] || TOOL_PERMISSIONS[name.toLowerCase()];
      const skipAutoApprove = toolPerm !== undefined && toolPerm !== 'ReadOnly';

      // 🏆 NEW: 物理合并 - 通知 ContentSegmentManager
      contentSegmentManager.onToolCall({
          id: toolId,
          type: 'function',
          function: {
              name,
              arguments: args
          }
      }, correlationId);

      // 🏆 FIX: 在 updater 外部保存 existingToolIndex，用于后续自动审批逻辑
      let existingToolIndex = -1;

      const updater = (state: any) => {
        const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
        if (messageIndex === -1) return state;

        const newMessages = [...state.messages];
        const targetMsg = { ...newMessages[messageIndex] };

        if (!targetMsg.toolCalls) targetMsg.toolCalls = [];
        existingToolIndex = targetMsg.toolCalls.findIndex((tc: any) => tc.id === toolId);

        // 🏆 FIX: 解析 JSON 参数为对象，兼容 UI 组件
        let parsedArgs: any = {};
        
        // 🏆 内部辅助：尝试从不完整的 JSON 字符串中提取关键字段
        const extractPartialJSON = (jsonStr: string) => {
          const result: any = { _raw: jsonStr };
          
          // 提取 rel_path
          const relPathMatch = jsonStr.match(/"rel_path"\s*:\s*"([^"]*)"?/);
          if (relPathMatch) result.rel_path = relPathMatch[1];
          
          // 提取 content (处理转义字符和多行)
          // 这是一个近似提取，直到找到下一个可能的键或字符串结尾
          const contentMatch = jsonStr.match(/"content"\s*:\s*"([\s\S]*)$/);
          if (contentMatch) {
            let content = contentMatch[1];
            // 移除末尾可能的未闭合引号或结束括号
            content = content.replace(/"\s*\}?$/, '').replace(/"$/, '');
            // 处理基本的换行转义和引号转义
            result.content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
          }
          
          return result;
        };

        try {
          // 尝试解析 JSON 字符串
          if (args && typeof args === 'string') {
            console.log('[StoreMapper] 🔧 Parsing JSON args:', args.substring(0, 50));
            // 尝试直接解析（完整的 JSON）
            try {
              parsedArgs = JSON.parse(args);
              console.log('[StoreMapper] ✅ Parsed args successfully');
            } catch (e) {
              // 🏆 流式传输中，尝试部分提取
              parsedArgs = extractPartialJSON(args);
            }
          } else if (args && typeof args === 'object') {
            parsedArgs = args;
          }
        } catch (e) {
          console.warn('[StoreMapper] ⚠️ Unexpected error in args processing:', e);
          parsedArgs = { _raw: args || '' };
        }

        // 🏆 FIX: 创建兼容 UI 组件和私有库的双格式结构
        // UI 组件期望: { tool: 'name', args: {...} }  args 必须是对象
        // 私有库使用: { function: { name, arguments } }  arguments 是字符串
        if (existingToolIndex === -1) {
            // 🏆 NEW: 分配 batchId 以支持工具折叠显示
            const lowerToolName = name.toLowerCase();
            let batchId: string | undefined = undefined;

            if (toolApprovalRegistry.isAggregatable(name)) {
                const lastToolCall = targetMsg.toolCalls.length > 0 ? targetMsg.toolCalls[targetMsg.toolCalls.length - 1] : null;

                // 🏆 FIX: 简化batchId复用逻辑
                if (lastToolCall && (lastToolCall as any).batchId) {
                    batchId = (lastToolCall as any).batchId;
                } else {
                    const currentEditorMode = (window as any).__IFAI_EDITOR_MODE__ || 'standard';
                    if (currentEditorMode === 'vibe' || currentEditorMode === 'spec') {
                        batchId = `batch_${crypto.randomUUID().slice(0, 8)}`;
                    }
                }
            }

            // 🔥 FIX: 使用扩展运算符创建新数组，确保 React.memo 能检测到 toolCalls 变化
            // 不能用 push()，因为 push 修改原数组引用，React.memo 的引用比较无法检测到变化
            const newToolCall = {
                id: toolId,
                type: 'function',
                // 🔥 UI 组件兼容字段（args 必须是对象）
                tool: name,
                args: parsedArgs,
                // 🔥 私有库兼容字段（arguments 保持字符串）
                function: { name, arguments: args || '' },
                // 🔥 FIX: 设置初始状态为 pending
                status: 'pending',
                // streamExtract 工具标记 isPartial: true（StreamingCodeCard 显示条件）
                // 非 streamExtract 工具保持 false
                isPartial: toolApprovalRegistry.isStreamExtractTool(name),
                // 🏆 NEW: 添加 batchId 支持工具折叠
                batchId
            };
            targetMsg.toolCalls = [...targetMsg.toolCalls, newToolCall];
            console.log('[StoreMapper] 🔧 Added new tool call:', name, 'status: pending, isPartial: false');
        } else {
            // 🔥 FIX: 创建新的 toolCalls 数组，确保 React.memo 能检测到变化
            const updatedToolCalls = [...targetMsg.toolCalls];
            const existingTC = { ...updatedToolCalls[existingToolIndex] };

            if (name !== 'Unknown Tool') {
                existingTC.tool = name;
                existingTC.function.name = name;
            }
            // 🔥 合并参数对象而不是字符串拼接
            const existingArgs = existingTC.args || {};
            if ((parsedArgs as any)._raw) {
              // 如果是新参数是原始字符串，更新 function.arguments
              existingTC.function.arguments = args || ''; // args 已经是累积的

              // 尝试重新解析完整的 arguments
              try {
                const fullArgsStr = existingTC.function.arguments;
                try {
                  existingTC.args = JSON.parse(fullArgsStr);
                } catch (e) {
                  // 🏆 FIX: 使用部分提取逻辑，恢复流式渲染
                  existingTC.args = extractPartialJSON(fullArgsStr);
                }
              } catch (e) {
                // 极端错误处理
                existingTC.args = { _raw: existingTC.function.arguments };
              }
            } else {
              // 如果是新参数是对象，合并到现有参数
              existingTC.args = {
                ...existingArgs,
                ...parsedArgs
              };
            }

            // streamExtract 工具在参数更新阶段保持 isPartial: true（等待审批）
            // 非 streamExtract 工具保持 false
            if (!toolApprovalRegistry.isStreamExtractTool(existingTC.tool || existingTC.function?.name)) {
                existingTC.isPartial = false;
            }

            updatedToolCalls[existingToolIndex] = existingTC;
            targetMsg.toolCalls = updatedToolCalls;
            console.log('[StoreMapper] 🔧 Updated existing tool call:', name);
        }

        // 🔥 FIX v0.3.3: 同步更新 segments，确保 segments 和 toolCalls 在同一个 setState 中更新
        // 这样可以避免 MessageItem 渲染时 segments 有值但 toolCalls 还没更新的问题
        const csmSegments = contentSegmentManager.getSegments(correlationId);
        if (csmSegments && csmSegments.length > 0) {
            // 深拷贝 segments 以确保 React 检测到变化
            targetMsg.segments = csmSegments.map((s: any) => ({ ...s }));
            console.log('[StoreMapper] 🔧 Synced segments with toolCalls:', {
                segmentCount: targetMsg.segments.length,
                toolCallCount: targetMsg.toolCalls.length
            });
        }

        newMessages[messageIndex] = targetMsg;
        console.log('[StoreMapper] 🔧 Target message after:', {
            id: targetMsg.id,
            toolCalls: targetMsg.toolCalls.map((tc: any) => ({
                id: tc.id,
                tool: tc.tool,
                argsType: typeof tc.args,
                functionName: tc.function?.name
            }))
        });

        return { messages: newMessages };
      };
      threadSafeUpdate(sessionId, correlationId, updater as any);

      // 🏆 FIX: 自动审批逻辑（仅在工具首次创建时触发，避免重复批准）
      // 只有当是新创建的工具时才执行自动批准
      if (existingToolIndex === -1) {
        // 🔥 Schema-Driven 门控：非 ReadOnly 工具由后端审批
        // 后端 requires_approval(ReadOnly, tool) 会判断是否需要用户审批
        // 前端自动审批只应对 ReadOnly（后端 autoApprove=true）的工具生效
        // 否则前端 100ms 自动审批会与后端 tool_approval_required 竞态
        const toolPermission = TOOL_PERMISSIONS[name] || TOOL_PERMISSIONS[name.toLowerCase()];
        const needsBackendApproval = toolPermission !== undefined && toolPermission !== 'ReadOnly';

        if (needsBackendApproval) {
          console.log(`[StoreMapper] 🔐 Tool "${name}" requires backend approval (permission=${toolPermission}), checking permission store...`);

          // 🏆 FIX: 异步检查 PermissionStore 白名单（来自"始终允许"）
          // 即使是非 ReadOnly 工具，如果用户在 PermissionStore 中添加了 allow 规则，
          // 也应自动审批，避免下次调用仍需手动确认。
          setTimeout(async () => {
            try {
              const { shouldAutoApproveAsync } = await import('../../utils/approvalPolicy');
              const settings = useSettingsStore.getState();
              const editorMode = (window as any).__IFAI_EDITOR_MODE__ || 'standard';

              const shouldAutoApprove = await shouldAutoApproveAsync({
                settings,
                editorMode: editorMode as any,
                isSessionTrusted: false,
                toolName: name,
                userMessageHasAutoApprove: false,
              });

              if (shouldAutoApprove) {
                console.log(`[StoreMapper] 🚀 Permission store hit, auto-approving tool:`, name);

                if ((window as any).__EXECUTED_TOOLS__ && (window as any).__EXECUTED_TOOLS__.has(toolId)) {
                  console.log('[StoreMapper] ⚠️ Tool already executed, skipping:', toolId);
                  return;
                }
                if (!(window as any).__EXECUTED_TOOLS__) {
                  (window as any).__EXECUTED_TOOLS__ = new Set();
                }
                (window as any).__EXECUTED_TOOLS__.add(toolId);

                const chatStore = useChatStore.getState();
                await chatStore.approveToolCall(correlationId, toolId);
              }
            } catch (error) {
              console.error('[StoreMapper] ❌ Permission store check failed:', error);
            }
          }, 100);
        } else {
          // 延迟执行以确保 UI 先渲染
          setTimeout(async () => {
          try {
            const settings = useSettingsStore.getState();
            const editorMode = (window as any).__IFAI_EDITOR_MODE__ || 'standard';

            // 检查是否应该自动审批
            const shouldAutoApprove = checkAutoApprove({
              settings,
              editorMode: editorMode as any,
              isSessionTrusted: false,  // TODO: 实现会话信任逻辑
              toolName: name,
              userMessageHasAutoApprove: false
            });

          console.log('[StoreMapper] 🤖 Auto-approve check:', {
            toolName: name,
            shouldAutoApprove,
            agentAutoApprove: settings.agentAutoApprove
          });

          if (shouldAutoApprove) {
            console.log('[StoreMapper] 🚀 Triggering auto-approve for tool:', name);

            // 🏆 FIX: 检查是否已被执行，防止 ToolCallManager 与 StoreMapper 的竞态
            if ((window as any).__EXECUTED_TOOLS__ && (window as any).__EXECUTED_TOOLS__.has(toolId)) {
              console.log('[StoreMapper] ⚠️ Tool already executed, skipping:', toolId);
              return;
            }

            // 🏆 FIX: 标记工具已执行，防止 ToolCallManager 重复执行
            if (!(window as any).__EXECUTED_TOOLS__) {
              (window as any).__EXECUTED_TOOLS__ = new Set();
            }
            (window as any).__EXECUTED_TOOLS__.add(toolId);

            const chatStore = useChatStore.getState();
            await chatStore.approveToolCall(correlationId, toolId);
          }
        } catch (error) {
          console.error('[StoreMapper] ❌ Auto-approve failed:', error);
        }
        }, 100);
        } // end else: non-backend-approval tools
      }
    });

    // 3.5 🔐 后端审批请求处理：确保 toolCall 状态为 pending
    // 当后端发送 tool_approval_required 时，确保对应 toolCall 状态正确
    // 注意：在重置为 pending 前会检查 PermissionStore 白名单，命中则自动审批
    chatEventBus.on('chat:tool:approval-required' as any, async (payload: any) => {
      const { toolId, toolName } = payload;

      // 🏆 FIX: 先检查 PermissionStore 白名单（来自"始终允许"）
      // 如果白名单命中则自动审批，跳过 pending 重置，避免审批弹窗
      try {
        const { shouldAutoApproveAsync } = await import('../../utils/approvalPolicy');
        const settings = useSettingsStore.getState();
        const editorMode = (window as any).__IFAI_EDITOR_MODE__ || 'standard';

        const shouldAutoApprove = await shouldAutoApproveAsync({
          settings,
          editorMode: editorMode as any,
          isSessionTrusted: false,
          toolName: toolName,
          userMessageHasAutoApprove: false,
        });

        if (shouldAutoApprove) {
          console.log(`[StoreMapper] 🚀 Permission store hit (approval-required handler), auto-approving tool:`, toolName);
          // 找到含此 toolCall 的 message 并自动审批，跳过 pending 重置
          const state = useChatStore.getState();
          for (const msg of state.messages) {
            if (msg.toolCalls?.some((tc: any) => tc.id === toolId)) {
              await state.approveToolCall(msg.id, toolId);
              return; // 跳过下方的 pending 重置
            }
          }
        }
      } catch (error) {
        console.error('[StoreMapper] ❌ Permission store check in approval-required failed:', error);
      }

      // 原逻辑：确保 toolCall 状态为 pending（覆盖前端自动审批的竞态）
      const updater = (state: any) => {
        const updatedMessages = state.messages.map((msg: any) => {
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            const updatedToolCalls = msg.toolCalls.map((tc: any) => {
              if (tc.id === toolId && tc.status !== 'pending') {
                console.log(`[StoreMapper] 🔧 Resetting toolCall status: ${tc.status} → pending (tool=${toolName})`);
                // streamExtract 工具保持 isPartial: true（StreamingCodeCard 显示条件）
                return {
                  ...tc,
                  status: 'pending',
                  isPartial: toolApprovalRegistry.isStreamExtractTool(toolName),
                };
              }
              return tc;
            });
            return { ...msg, toolCalls: updatedToolCalls };
          }
          return msg;
        });
        return { messages: updatedMessages };
      };
      useChatStore.setState(updater as any);
    });

    // 4. 映射工具执行结果
    chatEventBus.on('chat:tool:completed', (payload) => {
      const { toolId, result, error, correlationId, shouldContinue, sessionId } = payload;

      // 🔥 request_user_input: 检测并注入 interaction card（商用 GUI 路径）
      let isRequestUserInput = false;
      if (result && typeof result === 'string') {
        try {
          const parsedResult = JSON.parse(result);
          if (parsedResult._feedback_req_id && parsedResult.questions) {
            isRequestUserInput = true;
            const interactionData = normalizeInteractionData(parsedResult);
            if (interactionData) {
              // 🔥 跨线程保护：interaction card 当前线程专属，跨线程时跳过
              const curTid = useChatStore.getState().currentThreadId;
              if (!sessionId || !curTid || sessionId === curTid) {
                useChatStore.setState((state: any) => {
                  if (!state?.messages) return state;
                  const interactionMsg = {
                    id: `interaction-${toolId}-${Date.now()}`,
                    role: 'assistant',
                    content: '',
                    timestamp: Date.now(),
                    metadata: {
                      feedbackRequestId: parsedResult._feedback_req_id,
                      interactionData,
                    },
                  };
                  // 🔥 FIX: 插入到 correlationId 对应消息之前（而非追加到末尾）
                  // 确保 LLM 后续续播内容出现在 card 下方
                  const assistantIndex = state.messages.findIndex((m: any) => m.id === correlationId);
                  if (assistantIndex !== -1) {
                    const before = state.messages.slice(0, assistantIndex);
                    const after = state.messages.slice(assistantIndex);
                    return { messages: [...before, interactionMsg, ...after] };
                  }
                  return { messages: [...state.messages, interactionMsg] };
                });
                console.log('[StoreMapper] 💬 Injected interaction card (GUI path):', { toolId, questions: interactionData.questions.length });
              }
            }
          }
        } catch { /* ignore parse errors */ }
      }

      const updater = (state: any) => {
        // 🏆 注意：保持原始结果格式（JSON 对象或字符串），由 UI 层的 toolResultFormatter 负责格式化
        const content = error || (typeof result === 'string' ? result : JSON.stringify(result));

        // 🔥 CRITICAL: threadSafeUpdate 依赖「返回 state（同引用）」来判断未找到消息。
        // state.messages.map() 总是创建新数组，导致 threadSafeUpdate 跳过跨线程回退。
        // 显式检查：若当前线程无此 toolCall，返回 state 让线程路由层决定是否回退。
        const hasToolCall = state.messages.some((m: any) =>
          m.toolCalls?.some((tc: any) => tc.id === toolId)
        );
        if (!hasToolCall) return state;

        // 🏆 FIX: 更新工具调用状态为 completed
        const updatedMessages = state.messages.map((msg: any) => {
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            const updatedToolCalls = msg.toolCalls.map((tc: any) => {
              if (tc.id === toolId) {
                return {
                  ...tc,
                  status: 'completed',
                  result: content,
                  isPartial: false  // 确保清除 isPartial 标志，避免阻塞 _finish 检测
                };
              }
              return tc;
            });
            return { ...msg, toolCalls: updatedToolCalls };
          }
          return msg;
        });

        // 🔥 request_user_input: 跳过 tool 结果消息（interaction card 已替代）
        if (isRequestUserInput) {
          return { messages: updatedMessages };
        }

        // 检查是否已存在工具结果消息
        const hasToolResult = state.messages.some((m: any) => m.id === `res-${toolId}`);

        return {
          messages: hasToolResult ? updatedMessages : [
            ...updatedMessages,
            {
              id: `res-${toolId}`,
              role: 'tool',
              content: content,
              tool_call_id: toolId,
              timestamp: Date.now()
            }
          ],
          // 🔥 FIX: 不再强制 isLoading=true，因为后端 continuation loop 已禁用前端续播
          // _finish 事件会通过 emitFinished 正确设置 isLoading=false
        };
      };
      threadSafeUpdate(sessionId, correlationId, updater as any);

      // 🔥 FIX: 安全网 — 所有工具完成后检查 isLoading 是否卡住
      // 问题链：StreamingResponseController 的 _finish 在 pending 工具时跳过 emitFinished →
      // per-thread activeStreamCount 不递减 → ToolCallManager 又设 isLoading=true → 无后续流重置 → 卡死
      // 延迟 2s 检查：若此时所有工具已完成但 isLoading 仍为 true，强制清理
      setTimeout(() => {
        const currentState = useChatStore.getState();
        const msg = currentState.messages.find((m: any) => m.id === correlationId);
        if (!msg?.toolCalls) return;

        const allToolsDone = msg.toolCalls.every((tc: any) => tc.status === 'completed');
        if (!allToolsDone) return;

        // 所有工具已完成，但 isLoading 仍为 true → 强制清理
        if (currentState.isLoading) {
          const safeTid = currentState.currentThreadId;
          const safeSession = getPerThreadSessionStore().getSession(safeTid);
          debugLog({ category: 'error', level: 'error', message: `isLoading stuck after all tools completed`, threadId: safeTid, correlationId, data: { activeStreamCount: safeSession?.activeStreamCount ?? 0, toolId } });
          console.warn('[StoreMapper] ⚠️ All tools completed but isLoading still true, forcing cleanup', {
            correlationId,
            activeStreamCount: safeSession?.activeStreamCount ?? 0,
          });
          // 重置 per-thread 状态
          if (safeSession) {
            safeSession.activeStreamCount = 0;
          }
          getPerThreadSessionStore().setLoading(safeTid, false);

          // 通知 ContentSegmentManager 清理
          contentSegmentManager.onStreamFinish(correlationId);
        }
      }, 2000);

      // 🔥 CRITICAL FIX: 禁用前端续播（后端已在内部 loop 中处理 continuation）
      // 后端的 harness_ai_service.rs 已有完整的 continuation loop 机制
      // 前端续播会导致双重流并发，造成 delta_index 冲突和内容混乱
      // 如果后端 continuation 失败，流会自然结束，用户可以手动重新发送
      if (false && shouldContinue) {
        // 🏆 防抖处理：清除之前的定时器，确保多个并行工具完成后只触发一次续播
        if (continuationTimers[correlationId]) {
          clearTimeout(continuationTimers[correlationId]);
        }

        continuationTimers[correlationId] = setTimeout(async () => {
          delete continuationTimers[correlationId];
          
          const currentState = useChatStore.getState();

          // 🏆 FIX: 检查是否已经有续播在进行中
          if (continuationInProgress[correlationId]) {
            return;
          }

          // 🔥 FIX: 如果需要续播，清除 finishedStreams 标记
          // 当 LLM 发送工具调用后空 content 导致流被标记为完成时，需要清除标记允许续播
          if (finishedStreams.has(correlationId)) {
            finishedStreams.delete(correlationId);
          }

          // 🏆 FIX: 检查流是否已经完成，如果完成则不触发续播
          // （这个检查现在应该不会触发，因为上面已经清除了标记）
          if (finishedStreams.has(correlationId)) {
            // 流已完成，确保 isLoading 为 false
            if (currentState.isLoading) {
              useChatStore.setState({ isLoading: false } as any);
            }
            return;
          }

          // 🏆 检查是否还有未完成的工具
          const hasPendingTools = currentState.messages.some((msg: any) =>
            msg.toolCalls && msg.toolCalls.some((tc: any) => tc.status === 'pending' || tc.status === 'executing')
          );

          if (hasPendingTools) {
            console.log('[StoreMapper] ⏳ Waiting for other tools to complete...');
            return;
          }

          // 🏆 标记续播开始
          continuationInProgress[correlationId] = true;
          console.log('[StoreMapper] 🔄 Setting continuationInProgress for:', correlationId);
          console.log('[StoreMapper] 🔄 Current timestamp:', Date.now());

          // 🚀 OPTIMIZATION: 初始化续播内容跟踪
          continuationContentTracker[correlationId] = {
            hasContent: false,
            startTime: Date.now()
          };

          const { useSettingsStore } = await import('../settingsStore');
          const settings = useSettingsStore.getState();
          const providerId = settings.currentProviderId || 'openai';
          const modelId = settings.currentModel || 'gpt-4o';

          console.log('[StoreMapper] 🔄 All tools completed, triggering AI continuation');
          console.log('[StoreMapper] 🔄 Message count for continuation:', currentState.messages.length);
          console.log('[StoreMapper] 🔄 CorrelationId for continuation:', correlationId);
          console.log('[StoreMapper] 🔄 generateResponse function exists:', typeof currentState.generateResponse);
          console.log('[StoreMapper] 🔄 About to call generateResponse...');

          const targetMsg = currentState.messages.find((m: any) => m.id === correlationId);
          console.log('[StoreMapper] 🔄 Found target message:', targetMsg ? { id: targetMsg.id, role: targetMsg.role } : 'NOT FOUND');

          // 🏆 FIX: 回滚 commit 41dac32 的过短超时，修复真实 LLM 续播失败问题
          // 1. 快速检测：5秒内如果没有新内容，结束续播（给慢速 LLM 充足时间）
          // 2. 安全超时：15秒后强制结束（从2秒恢复到15秒）
          const quickCheckTimer = setTimeout(() => {
            const tracker = continuationContentTracker[correlationId];
            if (tracker && !tracker.hasContent) {
              console.log('[StoreMapper] ⚡ Quick finish: No content received in 5s, ending continuation');
              useChatStore.setState({ isLoading: false } as any);
              continuationInProgress[correlationId] = false;
              delete continuationContentTracker[correlationId];
            }
          }, 5000); // ✅ 从 1000ms 改为 5000ms

          const safetyTimer = setTimeout(() => {
            if (useChatStore.getState().isLoading) {
              console.warn('[StoreMapper] ⏰ Tool continuation safety timeout (15s). Resetting isLoading.');
              useChatStore.setState({ isLoading: false } as any);
            }
            continuationInProgress[correlationId] = false;
            delete continuationContentTracker[correlationId];
          }, 15000); // ✅ 从 2000ms 改为 15000ms (回滚 commit 41dac32)

          try {
            const beforeMsgCount = currentState.messages.length;
            await currentState.generateResponse(
              currentState.messages,
              providerId,
              modelId,
              correlationId  // 复用原始 assistant 消息 ID
            );
            // 检查续播后消息是否更新
            const afterState = useChatStore.getState();
            const afterMsgCount = afterState.messages.length;
            console.log('[StoreMapper] 🔄 Continuation completed. Messages before:', beforeMsgCount, 'after:', afterMsgCount);
          } finally {
            clearTimeout(quickCheckTimer);
            clearTimeout(safetyTimer);
            // 🏆 FIX: 续播完成后立即重置标记，允许后续产生的工具调用立即触发新的续播
            continuationInProgress[correlationId] = false;
            delete continuationContentTracker[correlationId];
          }
        }, 1000); // 增加防抖延迟到 1s，确保状态彻底稳定
      }
    });

    // 6. 映射错误
    chatEventBus.on('chat:error', (payload: any) => {
      const { correlationId, error, code, message: payloadMessage, sessionId } = payload;

      // 🔥 FIX: ToolCallManager 对需要审批的工具发出 chat:error（code=APPROVAL_REQUIRED），
      // 这不是真正的错误，跳过错误处理，避免将消息状态设为 error
      if (code === 'APPROVAL_REQUIRED') {
        console.log('[StoreMapper] ⏭️ Skipping APPROVAL_REQUIRED error (tool needs manual approval)');
        return;
      }

      console.error('[StoreMapper] ❌ Chat error received:', { correlationId, error });

      // 提取错误消息（优先从 error 字段，其次从 payload.message）
      let errorMessage: string;
      if (typeof error === 'object' && error !== null && error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (typeof payloadMessage === 'string' && payloadMessage.length > 0) {
        errorMessage = payloadMessage;
      } else {
        errorMessage = error != null ? JSON.stringify(error) : 'Unknown error';
      }

      // 🔥 FIX: 尝试提取内层的 error.message（对于智谱等 API 返回的 JSON 字符串）
      // 支持格式：
      // 1. "API 请求失败: {\"error\":{\"code\":\"1210\",\"message\":\"API 调用参数有误，请检查文档。\"}}"
      // 2. "{\"error\":{\"code\":\"1210\",\"message\":\"API 调用参数有误，请检查文档。\"}}"
      const extractInnerErrorMessage = (msg: string): string => {
        // 尝试去除 "API 请求失败: " 前缀
        let cleanedMsg = msg;
        if (msg.startsWith('API 请求失败: ')) {
          cleanedMsg = msg.substring('API 请求失败: '.length);
        }

        // 尝试解析 JSON
        if (cleanedMsg.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(cleanedMsg);
            if (parsed.error && parsed.error.message) {
              return parsed.error.message;
            }
          } catch {
            // JSON 解析失败，返回原始消息
          }
        }

        return msg;
      };

      errorMessage = extractInnerErrorMessage(errorMessage || 'Unknown error');

      // 🔥 FIX: 显示 toast 错误提示（只显示内层 error.message）
      toast.error(errorMessage);

      const updater = (state: any) => {
        const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);
        if (messageIndex === -1) return { isLoading: false };

        const newMessages = [...state.messages];
        const targetMsg = { ...newMessages[messageIndex] };

        // 如果内容为空，添加错误提示（只显示内层 error.message）
        if (!targetMsg.content || targetMsg.content.length < 10) {
          targetMsg.content = (targetMsg.content || '') + `\n\n❌ **AI 响应错误**: ${errorMessage}`;
        }

        targetMsg.status = 'error';
        newMessages[messageIndex] = targetMsg;

        return { messages: newMessages, isLoading: false };
      };

      threadSafeUpdate(sessionId, correlationId, updater as any);
    });

    // 7. 🏆 FIX: 监听工具审批事件，更新工具状态
    chatEventBus.on('chat:tool:approved', (payload) => {
      const { correlationId, toolId, sessionId } = payload as any;

      console.log('[StoreMapper] ✅ Tool approved event received:', { correlationId, toolId });

      const updater = (state: any) => {
        const messageIndex = state.messages.findIndex((m: any) => m.id === correlationId);

        if (messageIndex === -1) {
            console.warn('[StoreMapper] ⚠️ Message not found for tool approval:', correlationId);
            return state;
        }

        const newMessages = [...state.messages];
        const targetMsg = { ...newMessages[messageIndex] };

        if (!targetMsg.toolCalls) {
            console.warn('[StoreMapper] ⚠️ No toolCalls found in message');
            return state;
        }

        // 更新工具状态为 executing
        const toolIndex = targetMsg.toolCalls.findIndex((tc: any) => tc.id === toolId);
        if (toolIndex !== -1) {
            targetMsg.toolCalls[toolIndex] = {
              ...targetMsg.toolCalls[toolIndex],
              status: 'executing',
              isPartial: false,
            };
            console.log('[StoreMapper] ✅ Updated tool status to executing:', toolId);
        }

        newMessages[messageIndex] = targetMsg;
        return { messages: newMessages };
      };
      threadSafeUpdate(sessionId, correlationId, updater as any);
    });

    // 🏆 Phase 4: Periodic snapshot — 每 5 分钟检查所有活跃线程，超过 50 事件则创建快照
    const PERSISTENCE_INTERVAL_MS = 5 * 60 * 1000;
    setInterval(async () => {
      try {
        const { getSessionPersistenceService } = await import('../../services/sessionPersistence/SessionPersistenceService');
        const sps = getSessionPersistenceService();
        const state = useChatStore.getState();
        const currentThreadId = state.currentThreadId;
        const allThreadIds = currentThreadId
          ? Object.keys(state._messagesByThread || {}).concat(currentThreadId)
          : Object.keys(state._messagesByThread || {});
        const uniqueThreadIds = [...new Set(allThreadIds)].filter(Boolean);

        for (const tid of uniqueThreadIds) {
          try {
            if (await sps.shouldCreateSnapshot(tid)) {
              const messages = state._messagesByThread?.[tid]
                || (tid === currentThreadId ? state.messages : []);
              if (messages.length === 0) continue;
              const pss = getPerThreadSessionStore().getSession(tid);
              await sps.createSnapshot(tid, {
                messages,
                isLoading: pss?.isLoading ?? false,
                scrollPosition: pss?.scrollPosition ?? 0,
                inputContent: pss?.inputContent ?? '',
                lastSequence: 0,
              });
              debugLog({
                category: 'storage',
                level: 'info',
                message: `Periodic snapshot created for ${tid.substring(0, 8)} (${messages.length} msgs)`,
                threadId: tid,
              });
            }
          } catch (e) {
            // individual thread failure should not block other threads
          }
        }
      } catch (e) {
        // periodic snapshot failure is non-critical
      }
    }, PERSISTENCE_INTERVAL_MS);
};
