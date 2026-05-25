/**
 * StreamingResponseController - 流式响应控制器 (Phase 4)
 *
 * 负责与 Tauri 后端通信，监听流式 SSE 事件并转化为 EventBus 信号。
 * 解决底层通信与 UI 状态的耦合问题。
 *
 * @version v1.0.0
 */

// 🔥 FIX: 移除静态导入，改为动态导入以避免 Tauri bridge 未初始化问题
// import { listen } from '@tauri-apps/api/event';
import { chatEventBus, BasePayload } from '../eventBus/ChatEventBus';
import { useSettingsStore } from '../../settingsStore';
import { useThreadStore } from '../../threadStore';
// 🔥 FIX: 使用全局 Tauri API 而不是模块导入，修复 E2E 环境中的模块解析问题
// import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ApprovalPipeline } from '../../../utils/approvalPipeline';
import { useChatStore } from '../../useChatStore';
import {
  evaluateStreamEvent,
  STREAM_RULES,
  PHASE_LOADING,
  PHASE_TRANSITIONS,
  type StreamPhase,
} from '@/core/stream-schema-generated';
import { createLogger } from '../../../utils/logger';

// 🔥 Logger instance for StreamingController
const logger = createLogger('StreamingController');

// 🔥 FIX: 动态获取 listen 函数，支持 E2E 测试环境和真实 Tauri 环境
async function getTauriListen() {
  // 优先尝试从全局 Tauri 对象获取（E2E 环境和真实 Tauri 都支持）
  const w = window as any;
  if (w.__TAURI__?.event?.listen) {
    return w.__TAURI__.event.listen;
  }

  // 如果全局对象不存在，尝试动态导入模块
  try {
    const eventModule = await import('@tauri-apps/api/event');
    return eventModule.listen;
  } catch (e) {
    logger.error('Failed to get Tauri listen function:', e);
    throw new Error('Tauri event listen function not available');
  }
}

interface StreamSession {
  correlationId: string;
  sessionId: string;
  threadId: string;
  lastHeartbeat: number;
  startTime: number;
  hasReceivedChunk: boolean;
  isFinished: boolean;
  messageId?: string;
  /** Schema-Driven: 当前流阶段，默认 STREAMING */
  currentPhase: StreamPhase;
}

export class StreamingResponseController {
  private static instance: StreamingResponseController;
  private activeListeners: Map<string, Function[]> = new Map();
  private activeSessions: Map<string, StreamSession> = new Map();
  private toolCallBuffer: Map<string, { name: string, arguments: string, hasName: boolean, hasArgs: boolean, toolId: string }> = new Map();
  private indexToBufferKey: Map<string, string> = new Map();
  private heartbeatTimer: any = null;

  /**
   * 🔥 FIX v0.3.12: 幂等性保护 - 防止 finish 事件被多次触发
   * 商业版后端可能发送多个 _finish 事件，但每个 correlationId 只应处理一次
   */
  private emittedFinish: Set<string> = new Set();

  /**
   * PIVO Bridge 监听器清理函数
   * 用于 E2E 测试环境中的事件注入
   */
  private pivoBridgeUnlisteners: Map<string, () => void> = new Map();

  /**
   * 🏆 FIX: 工具完成后的超时定时器
   * 用于检测工具完成后是否需要自动结束流
   */
  private toolCompletionTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.initializePIVOBridge();
    this.startHeartbeatMonitor();
    this.initializeToolCompletionListener();

    // 🏆 为 E2E 测试暴露实例
    if (typeof window !== 'undefined') {
      (window as any).__StreamingResponseController = this;
    }
  }

  /**
   * 🏆 FIX: 监听工具完成事件，更新 session 心跳
   * 防止工具执行期间误判流停滞
   */
  private initializeToolCompletionListener() {
    chatEventBus.on('chat:tool:completed', (payload: any) => {
      const correlationId = payload.correlationId;
      const session = this.activeSessions.get(correlationId);

      if (session && !session.isFinished) {
        session.lastHeartbeat = Date.now();
      }
    });
  }

  /**
   * 获取单例实例（向后兼容旧版 API）
   */
  static getInstance(): StreamingResponseController {
    if (!StreamingResponseController.instance) {
      StreamingResponseController.instance = new StreamingResponseController();
    }
    return StreamingResponseController.instance;
  }

  /**
   * 🐛 FIX: 查询指定流的会话信息
   * 供 CrossThreadPersistenceService 判断 chunk 归属使用。
   */
  getSession(correlationId: string): StreamSession | undefined {
    return this.activeSessions.get(correlationId);
  }

  /**
   * 🐛 FIX: 中止指定流（用于删除正在流式的线程时主动清理）
   * 发出 finished 事件 → 停止监听 → 清理 session
   */
  abortStream(correlationId: string): void {
    this.emitFinished({ correlationId, sessionId: '', timestamp: Date.now() });
    this.stopListening(correlationId);
    this.activeSessions.delete(correlationId);
    this.emittedFinish.delete(correlationId);
  }

  /**
   * 🏆 PIVO 3.0: 物理级自愈心跳监测器
   * 每 5 秒检测一次流停滞，15 秒无心跳则触发自愈
   */
  private startHeartbeatMonitor() {
    if (typeof window === 'undefined') return;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      if (this.activeSessions.size === 0) return;

      this.activeSessions.forEach((session, correlationId) => {
        if (!session.isFinished) {
          // 🔥 FIX: 降低超时阈值到 30 秒，适用于慢速 LLM 响应
          // 同时检测是否有任何内容或工具调用，如果有则认为流在进行中
          const chatStore = useChatStore.getState();
          const msg = chatStore.messages.find(m => m.id === correlationId);
          const hasContent = msg && msg.content && msg.content.length > 0;
          const hasToolCalls = msg && msg.toolCalls && msg.toolCalls.length > 0;
          const hasPendingTools = msg?.toolCalls?.some((tc: any) =>
            tc.status === 'pending' || tc.status === 'approved' || tc.status === 'executing' || tc.isPartial
          );
          // 🔥 CRITICAL FIX: 检查是否有已完成的工具（continuation 场景）
          // 如果有 completed 状态的工具，说明后端正在准备续播，不应该触发 Fast finish
          const hasCompletedTools = msg?.toolCalls?.some((tc: any) => tc.status === 'completed');

          // 🚀 OPTIMIZATION: 更激进的超时策略
          // 如果有内容但没有待处理工具，5秒超时后强制完成（从30秒缩短到5秒）
          // 🏆 FIX: 增加 session.hasReceivedChunk 判断，确保不会在续播刚开始、首包还没到时就触发快杀
          // 🏆 FIX: 增加 session.startTime 保护期判断，前 15 秒内绝对禁止快杀，给续播/思考留出充足时间
          // 🔥 CRITICAL FIX: 如果有已完成的工具，不触发 Fast finish（continuation 场景）
          // 因为后端会在 continuation loop 中发送新的数据，Fast finish 会误杀续播

          // 🔥 DIAGNOSTIC: 每次心跳检查都打印状态（临时调试）
          console.log(`[SC] 💓 Heartbeat check: correlationId=${correlationId}, hasContent=${hasContent}, hasToolCalls=${hasToolCalls}, hasPendingTools=${hasPendingTools}, hasCompletedTools=${hasCompletedTools}, timeSinceLastHeartbeat=${now - session.lastHeartbeat}ms, timeSinceStart=${now - session.startTime}ms`);

          // 检查 Fast finish 条件
          const fastFinishCondition = session.hasReceivedChunk && hasContent && !hasToolCalls && !hasPendingTools && (now - session.lastHeartbeat > 5000) && (now - session.startTime > 15000);
          const sentinelStallCondition = (now - session.lastHeartbeat > 15000 && now - session.startTime > 15000);

          console.log(`[SC] 💓 Heartbeat conditions: fastFinish=${fastFinishCondition}, sentinelStall=${sentinelStallCondition}, hasReceivedChunk=${session.hasReceivedChunk}`);

          // 🔥 CRITICAL FIX: 完全禁用心跳监测器的自动 finish 逻辑
          // 只保留诊断日志，不调用 emitFinished 或 triggerPhysicalSelfHealing
          // 只有后端明确发送 finish 事件时才结束流
          if (fastFinishCondition) {
            console.warn(`[SC] ⚠️ Fast finish condition met but NOT triggering finish (disabled): correlationId=${correlationId}, hasContent=${hasContent}, hasToolCalls=${hasToolCalls}, hasPendingTools=${hasPendingTools}, timeSinceLastHeartbeat=${now - session.lastHeartbeat}ms`);
            // 不调用 emitFinished，只重置心跳
            session.lastHeartbeat = Date.now();
            return;
          }

          // 15 秒超时阈值（原有逻辑）
          // 🔥 CRITICAL FIX: 同样禁用 Sentinel stall 的自动处理
          if (sentinelStallCondition) {
            console.warn(`[SC] ⚠️ Sentinel stall detected but NOT triggering self-healing (disabled): ${correlationId}, timeSinceLastHeartbeat=${now - session.lastHeartbeat}ms`);
            // 不调用 triggerPhysicalSelfHealing，只重置心跳
            session.lastHeartbeat = Date.now();
          }
        }
      });
    }, 5000); // 5秒检测间隔
  }

  /**
   * 🏆 用于跟踪每个 correlationId 是否已经发送过 chat:stream:finished 事件
   * 防止重复发送导致循环
   */
  private finishedEventEmitted: Set<string> = new Set();

  /**
   * 🏆 PIVO 3.0: 物理级自愈决策引擎
   */
  private async triggerPhysicalSelfHealing(correlationId: string) {
    const chatStore = useChatStore.getState();
    const msg = chatStore.messages.find(m => m.id === correlationId);
    if (!msg || !msg.isStreaming) return;

    // 🔥 DIAGNOSTIC: 打印自愈触发信息
    console.log(`[SC] 🔧 Physical Self-Healing triggered: correlationId=${correlationId}`);

    // PIVO 信号存根用于测试
    if (typeof window !== 'undefined') {
      if (!(window as any).__PIVO_SIGNALS__) (window as any).__PIVO_SIGNALS__ = {};
      (window as any).__PIVO_SIGNALS__['ifainev:self-healing-triggered'] = {
        correlationId,
        timestamp: Date.now()
      };
    }

    const hasUnclosedTool = msg.toolCalls?.some(tc => tc.isPartial);
    const hasContent = !!msg.content && String(msg.content).trim().length > 0;
    const hasAnyTool = msg.toolCalls && msg.toolCalls.length > 0;
    const hasPendingTools = msg?.toolCalls?.some((tc: any) =>
      tc.status === 'pending' || tc.status === 'approved' || tc.status === 'executing' || tc.isPartial
    );

    // 🔥 DIAGNOSTIC: 打印状态
    console.log(`[SC] 🔧 Self-Healing state: hasUnclosedTool=${hasUnclosedTool}, hasContent=${hasContent}, hasAnyTool=${hasAnyTool}, hasPendingTools=${hasPendingTools}`);

    if (hasUnclosedTool || (!hasContent && !hasAnyTool)) {
      const reason = hasUnclosedTool ? "Unclosed tool" : "Startup stall";
      console.log(`[SC] Physical Auto-Continue (${reason}): ${correlationId}`);

      // 重置心跳防止死循环
      const session = this.activeSessions.get(correlationId);
      if (session) session.lastHeartbeat = Date.now();

      const settings = useSettingsStore.getState();
      const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
      if (providerConfig) {
        (chatStore as any).generateResponse(chatStore.messages, providerConfig);
      }
    } else {
      // 🔥 CRITICAL FIX: 如果有内容，不调用 emitFinished
      // 因为后端可能正在准备 continuation（工具调用参数累积中）
      // 只有在没有内容和工具的情况下，才认为是真正的流结束
      if (hasContent) {
        console.log(`[SC] ⚠️ Self-Healing: has content, NOT finishing (possible continuation in progress)`);
        // 重置心跳，给后端更多时间
        const session = this.activeSessions.get(correlationId);
        if (session) session.lastHeartbeat = Date.now();
        return;
      }

      console.log(`[SC] Physical Finalize: ${correlationId}`);
      this.emitFinished({ correlationId, sessionId: '', timestamp: Date.now() });
    }
  }

  /**
   * 🏆 PIVO 3.0: 哨兵权威判定接口
   */
  isStreamStuck(correlationId: string): boolean {
    const session = this.activeSessions.get(correlationId);
    if (!session) return false;
    // 8秒宽限期
    return (Date.now() - session.lastHeartbeat) > 8000;
  }

  /**
   * 🔧 初始化 PIVO Bridge（E2E 测试支持）
   * 允许测试直接注入流式数据而不依赖真实 LLM
   */
  private initializePIVOBridge() {
    if (typeof window === 'undefined') return;

    // 创建全局 PIVO Bridge 对象
    if (!(window as any).__PIVO_BRIDGE__) {
      (window as any).__PIVO_BRIDGE__ = {
        push: (id: string, payload: any) => {
          window.dispatchEvent(new CustomEvent(`pivo:direct-chunk:${id}`, { detail: payload }));
        },
        finalize: (id: string) => {
          window.dispatchEvent(new CustomEvent(`pivo:direct-finish:${id}`));
        }
      };
    }
  }

  /**
   * 🔧 注册 PIVO Bridge 监听器（E2E 测试支持）
   */
  private registerPIVOBridgeListener(correlationId: string, payload: BasePayload) {
    if (typeof window === 'undefined') return;

    // 监听直接注入的 chunk
    const chunkHandler = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.handleBackendEvent(customEvent.detail, payload);
    };

    // 监听直接注入的 finish
    const finishHandler = () => {
      this.emitFinished(payload);
    };

    window.addEventListener(`pivo:direct-chunk:${correlationId}`, chunkHandler);
    window.addEventListener(`pivo:direct-finish:${correlationId}`, finishHandler);

    // 存储清理函数
    const unlisten = () => {
      window.removeEventListener(`pivo:direct-chunk:${correlationId}`, chunkHandler);
      window.removeEventListener(`pivo:direct-finish:${correlationId}`, finishHandler);
    };

    this.pivoBridgeUnlisteners.set(correlationId, unlisten);
  }

  /**
   * 启动针对特定消息的流式监听
   */
  async startListening(messageId: string, payload: BasePayload) {
    logger.info(`Stream start: ${messageId} (correlation: ${payload.correlationId})`);

    const threadId = useThreadStore.getState().activeThreadId || payload.sessionId || 'default';

    // 🏆 新增：触发 chat:stream:start 事件，初始化 ContentSegmentManager
    chatEventBus.emit('chat:stream:start', {
      messageId: messageId,
      correlationId: payload.correlationId,
      sessionId: threadId,
      timestamp: payload.timestamp || Date.now()
    });

    // 🏆 关键修复：支持续播 (Continuation)
    // 检测续播场景：1) payload 显式标记，或 2) 已有活跃会话，或 3) 已发送过 finish 事件
    const isContinuation = (payload as any).isContinuation ||
                           this.activeSessions.has(payload.correlationId) ||
                           this.emittedFinish.has(payload.correlationId);

    // 如果该 ID 已经在 emittedFinish 中，说明这是新的续播片段，物理重置
    if (this.emittedFinish.has(payload.correlationId)) {
      this.emittedFinish.delete(payload.correlationId);
    }

    // 🏆 物理隔离：仅在彻底新建会话时清理旧监听器
    if (!isContinuation && this.activeListeners.has(payload.correlationId)) {
      this.stopListening(payload.correlationId);
    }

    // 🔥 FIX v0.3.13: 续播场景下清理旧监听器 (必须在创建新 session 之前)
    if (isContinuation && this.activeListeners.has(payload.correlationId)) {
      this.stopListening(payload.correlationId);
    }

    // 🏆 创建会话跟踪（在清理之后，确保不会被误删）
    const session: StreamSession = {
      correlationId: payload.correlationId,
      sessionId: payload.sessionId || threadId,
      threadId,
      lastHeartbeat: Date.now(),
      startTime: Date.now(),
      hasReceivedChunk: false,
      isFinished: false,
      currentPhase: 'STREAMING',
      messageId
    };
    this.activeSessions.set(payload.correlationId, session);

    // 🏆 物理对齐：使用 correlationId 构建 eventId，确保与 Rust 后端（lib.rs）完全一致
    // 注意：后端发射格式始终为 "chat_${correlationId}"
    const eventId = `chat_${payload.correlationId}`;

    if (messageId !== payload.correlationId) {
      console.warn(`[SC] MESSAGE ID MISMATCH: messageId="${messageId}" vs correlationId="${payload.correlationId}"`);
    }

    // 🔧 注册 PIVO Bridge 监听器（E2E 测试支持）
    this.registerPIVOBridgeListener(payload.correlationId, payload);

    // 🏆 物理兼容性：如果不在真实 Tauri 环境，使用仿真监听器
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
        console.warn('[SC] Non-Tauri environment, using simulated listeners.');
        this.activeListeners.set(payload.correlationId, [() => {}]);
        return;
    }

    try {
        // 🔥 FIX: 使用动态获取的 listen 函数，修复 E2E 环境中的模块解析问题
        const listen = await getTauriListen();

        // 1. 监听状态更新 (Status)
        const unlistenStatus = await listen(`${eventId}_status`, (event: any) => {
          session.lastHeartbeat = Date.now();
          chatEventBus.emit('chat:session:sync', {
            ...payload,
            state: { status: event.payload }
          });
        });

        // 2. 监听核心内容流 (Stream)
        let unlistenStream;
        let eventReceived = false;

        // 🔥 FIX v0.3.14: 根据场景使用不同的超时时间
        // - 首次请求: 60秒超时（支持长历史消息处理）
        // - 续播请求: 30秒超时（工具调用后 LLM 需要更长时间）
        // 这是一个诊断超时，不会中断实际的流处理
        const timeoutMs = isContinuation ? 30000 : 60000;
        const eventTimeoutCheck = setTimeout(() => {
          if (!eventReceived) {
            console.warn(`[SC] Event timeout (${timeoutMs}ms) for ${eventId}${isContinuation ? ' (continuation)' : ''}`);
          }
        }, timeoutMs);

        try {
            unlistenStream = await listen(eventId, (event: any) => {
                if (!eventReceived) {
                  eventReceived = true;
                  clearTimeout(eventTimeoutCheck);
                }
                session.lastHeartbeat = Date.now();

                this.handleBackendEvent(event.payload, payload);
            });
        } catch (e) {
            clearTimeout(eventTimeoutCheck);
            console.error(`[SC] Failed to listen to ${eventId}:`, e);
            throw e;
        }

        // 3. 🔥 FIX: 监听 finish 事件（商业版 ifainew_core 发送）
        // 🔥 CRITICAL FIX: 在 continuation 场景下，后端会发送 _finish 事件但不应该结束流
        // 我们需要在 emitFinished 之前检查是否有真正的结束条件
        const unlistenFinish = await listen(`${eventId}_finish`, (event: any) => {
          // 🔥 DIAGNOSTIC: 打印 _finish 事件接收信息
          console.log(`[SC] 🏁 _finish event received: correlationId=${payload.correlationId}`);

          // 检查是否有待处理的工具调用
          const chatStore = useChatStore.getState();
          const msg = chatStore.messages.find(m => m.id === payload.correlationId);
          const hasPendingTools = msg?.toolCalls?.some((tc: any) =>
            tc.status === 'pending' || tc.status === 'approved' || tc.status === 'executing' || tc.isPartial
          );

          console.log(`[SC] _finish event: hasPendingTools=${hasPendingTools}, msg.toolCalls.length=${msg?.toolCalls?.length || 0}`);

          // 🔥 FIX: 如果有待处理的工具，不结束流（continuation 场景）
          if (hasPendingTools) {
            console.log(`[SC] _finish event received but has pending tools, continuing stream`);
            return;
          }

          // 只有在没有待处理工具时才真正结束
          console.log(`[SC] _finish event received with no pending tools, calling emitFinished`);
          this.emitFinished(payload);
        });

        // 4. 🔥 FIX: 监听 error 事件（后端 API 错误或致命错误时发送）
        const unlistenError = await listen(`${eventId}_error`, (event: any) => {
          console.error(`[SC] Error event for ${payload.correlationId}:`, event.payload);
          // 发送错误事件到 EventBus
          chatEventBus.emit('chat:error', {
            correlationId: payload.correlationId,
            error: event.payload
          });
          // 结束流并设置 isLoading = false
          this.emitFinished(payload);
        });

        // 5. 监听系统提示词元数据事件 (AI Transparency)
        const unlistenPromptMeta = await listen('ai:system_prompt_meta', (event: any) => {
          // 只处理当前会话的事件
          if (event.payload?.event_id === eventId) {
            import('../../transparencyStore').then(({ useTransparencyStore }) => {
              useTransparencyStore.getState().setPromptMeta(event.payload);
            });
          }
        });

        // 6. 记录监听器以便后续清理
        this.activeListeners.set(payload.correlationId, [unlistenStatus, unlistenStream, unlistenFinish, unlistenError, unlistenPromptMeta]);
    } catch (e) {
        console.error('[SC] Failed to setup Tauri listeners:', e);
    }
  }

  /**
   * 处理后端返回的原始事件
   */
  private handleBackendEvent(raw: any, payload: BasePayload) {
    // 🏆 FIX: 只要收到数据，立即刷新心跳并标记已接收数据
    const session = this.activeSessions.get(payload.correlationId);
    if (session && raw) {
      session.hasReceivedChunk = true;
      session.lastHeartbeat = Date.now();
    }

    // 🏆 FIX: 如果 raw 是空或已经结束，检测是否需要触发 finish
    if (!raw) {
      // 🔥 DIAGNOSTIC: 打印 Event Fallback 触发信息
      console.log(`[SC] ⚠️ Event Fallback: raw is falsy (raw=${raw}), correlationId=${payload.correlationId}`);

      // 检查是否有待处理的工具或内容
      const chatStore = useChatStore.getState();
      const msg = chatStore.messages.find(m => m.id === payload.correlationId);
      const hasPendingTools = msg?.toolCalls?.some((tc: any) =>
        tc.status === 'pending' || tc.status === 'approved' || tc.status === 'executing' || tc.isPartial
      );

      console.log(`[SC] Event Fallback: hasPendingTools=${hasPendingTools}, msg.toolCalls.length=${msg?.toolCalls?.length || 0}`);

      if (!hasPendingTools) {
        console.log(`[SC] Event Fallback: triggering emitFinished`);
        this.emitFinished(payload);
      } else {
        console.log(`[SC] Event Fallback: has pending tools, NOT triggering emitFinished`);
      }
      return;
    }

    // 🏆 物理保险丝：如果 raw 为空或 undefined，可能意味着流已结束
    if (!raw) {
      this.emitFinished(payload);
      return;
    }

    try {
      let data = raw;
      if (typeof raw === 'string') {
        try {
          data = JSON.parse(raw);
        } catch (e) {
          // 🏆 文本片段处理
          // 🔥 FIX: 检查是否是 JSON 控制数据（防止错误地将流式控制数据作为文本发送）
          if (raw.includes('"choices":') && raw.includes('"delta":') && raw.includes('"content":')) {
            console.warn('[SC] Detected JSON control data that failed to parse:', raw.substring(0, 100));
            return; // 丢弃无法解析的 JSON 控制数据
          }
          this.emitChunk(raw, false, payload);
          return;
        }
      }

      // 🆕 P2: 兼容 OpenAI/DeepSeek 格式（没有 type 字段）
      // 检查是否有 choices.delta.content（文本内容）
      const isOpenAIFormat = !data.type && data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content !== undefined;

      if (isOpenAIFormat) {
        const content = data.choices[0].delta.content;

        // 🔥 FIX: 确保内容是字符串类型，防止 JSON 对象被当作内容发送
        let contentStr = '';
        if (typeof content === 'string') {
          contentStr = content;

          // 🔥 FIX P0: 检查 content 是否包含 JSON 控制数据
          // 防止后端错误地将 JSON 控制数据作为内容发送
          if (contentStr.includes('"choices":') && contentStr.includes('"delta":') && contentStr.includes('"content":')) {
            console.warn('[SC] ⚠️ JSON control data detected in content field, skipping:', contentStr.substring(0, 100));
            return;
          }

          // 🔥 FIX P0: 检查 content 是否以 { 开头且包含大量 JSON 特征（可能是被错误包装的 JSON）
          const trimmed = contentStr.trim();
          if (trimmed.startsWith('{') && contentStr.length > 50 &&
              (contentStr.includes('"index":') || contentStr.includes('"content_block_index"'))) {
            console.warn('[SC] ⚠️ Suspicious JSON-like content detected, skipping:', contentStr.substring(0, 100));
            return;
          }
        } else if (content !== null && content !== undefined) {
          // 如果 content 不是字符串（比如是对象或数组），转换为 JSON 字符串
          // 但这种情况不应该发生，记录警告
          console.warn('[SC] Non-string content detected:', content);
          contentStr = String(content);
        }

        // 🔥 序号校验：提取 delta_index
        const index = data.choices[0]?.index;
        const deltaIndex = index?.delta_index ?? -1;

        this.emitChunk(contentStr || '', false, payload, deltaIndex);
      }
      // 情况 A: 文本内容
      else if (data.type === 'content') {
        // 🏆 FIX: 检测空内容作为备用 finish 信号
        // 某些后端（如本地模型）可能不发送标准 finish 事件
        const isEmpty = !data.content || data.content === '';

        if (isEmpty) {
          const hasCompleteToolCalls = Array.from(this.toolCallBuffer.entries())
            .some(([key, buffered]) => buffered.hasName && buffered.arguments.length > 0);

          // 🔥 FIX: 有工具调用时，不要立即触发 finish
          // 等待工具调用完成后，由真正的 _finish 事件来结束流
          // 空的 content chunk 只是 LLM 表示"我暂时没有更多文本"，不应该结束整个流
          if (hasCompleteToolCalls) {
            return;
          }
        }

        this.emitChunk(data.content || '', false, payload);
      }

      // 情况 B: 工具调用 (深度提取支持)
      else if (data.type === 'tool_call' || data.type === 'toolCall' || data.tool_calls) {
        // 🏆 兼容私有库的数据结构：优先使用 tool_call 字段（私有库使用的格式）
        const tc = data.tool_call || data.toolCall || data.tool_calls?.[0];

        if (tc) {
            // 🏆 FIX: 增量累积 tool call data（处理流式传输）
            // 提取关键字段
            const toolName = tc.function?.name || tc.name || tc.tool || '';
            const toolArgs = tc.function?.arguments || tc.arguments || '';
            const originalId = tc.id;
            const indexKey = `idx-${tc.index}`;

            // 🏆 关键修复：使用 index 映射处理流式传输
            // 后续 chunks 的 id 为 null，但可以通过 index 找到对应的 buffer key
            let bufferKey: string;

            if (originalId) {
              // 第一个 chunk 有 id，建立映射
              bufferKey = `id-${originalId}`;
              this.indexToBufferKey.set(indexKey, bufferKey);
            } else {
              // 后续 chunks 没有 id，尝试通过 index 找到对应的 buffer key
              bufferKey = this.indexToBufferKey.get(indexKey) || indexKey;
            }

            // 跳过既没有 name 也没有 arguments 的无效 chunk
            if (!toolName && !toolArgs) {
              console.warn('[SC] Empty tool chunk (no name, no args), skipping');
              return;
            }

            // 获取或初始化累积 buffer
            let buffered = this.toolCallBuffer.get(bufferKey);
            if (!buffered) {
              buffered = { name: '', arguments: '', hasName: false, hasArgs: false, toolId: originalId || `tc-${Date.now()}` };
              this.toolCallBuffer.set(bufferKey, buffered);
            }

            // 🏆 累积 name（通常在第一个 chunk）
            if (toolName && !buffered.hasName) {
              buffered.name = toolName;
              buffered.hasName = true;
            }

            // 🏆 累积 arguments（可能流式到达）
            if (toolArgs) {
              buffered.arguments += toolArgs;
              buffered.hasArgs = buffered.arguments.length > 0;
            }

            // 🏆 当有 name 且有完整的 arguments 时，emit 工具调用
            if (buffered.hasName && buffered.hasArgs) {
              // 尝试解析 JSON 检查完整性
              let isComplete = false;
              try {
                JSON.parse(buffered.arguments);
                isComplete = true;
              } catch (e) {
                // JSON 不完整，继续等待更多 chunks
              }

              if (isComplete) {
                chatEventBus.emit('chat:tool:call', {
                  ...payload,
                  toolId: buffered.toolId,
                  name: buffered.name,
                  arguments: buffered.arguments
                });

                // 清理 buffer
                this.toolCallBuffer.delete(bufferKey);
              }
            }
        } else {
            console.warn('[SC] Tool call data structure not recognized:', data);
        }
      }

      // 🆕 P2: 工具完成事件（从 DeepSeek/OpenAI 流式响应中累积的参数）
      else if (data.type === 'tool_done') {
        const toolCallId = data.tool_call_id || data.toolCallId;
        const result = data.result || data.arguments || '{}';
        const toolName = data.tool || '';

        if (toolCallId) {
          // 🔥 FIX: 检查 data.todos（直接从事件数据中获取，不需要从 result 解析）
          if (data.todos && Array.isArray(data.todos)) {
            import('../../todoWriteStore').then(({ useTodoWriteStore }) => {
              useTodoWriteStore.getState().syncFromToolCall(data.todos);
            }).catch(err => {
              console.error('[SC] Failed to sync TodoWrite:', err);
            });
          } else {
            // 🆕 P3: 对于非 TodoWrite 工具，发送工具完成事件
            if (toolName && toolName !== 'TodoWrite') {
              chatEventBus.emit('chat:tool:completed', {
                ...payload,
                toolId: toolCallId,  // 🔧 FIX: StoreMapper 期待的是 toolId
                result,
                timestamp: Date.now(),
                shouldContinue: true  // 🔥 FIX: 触发续播，让 AI 继续生成回复
              } as any);
            }
          }
        } else {
          // no toolCallId, skipping
        }
      }

      // 🔥 CRITICAL FIX: 处理警告事件（如 finish_reason=length 时的输出截断警告）
      else if (data.type === 'warning') {
        console.warn(`[SC] ⚠️ Warning event received: code=${data.code}, message=${data.message}`, payload.correlationId);
        // 将警告事件发送到 EventBus，UI 层可以显示给用户
        chatEventBus.emit('chat:warning', {
          ...payload,
          warningCode: data.code,
          warningMessage: data.message,
          finishReason: data.finish_reason
        } as any);
      }

      // 🆕 Schema-Driven: stream_phase 事件处理（后端 continuation loop 发射）
      else if (data.type === 'stream_phase' && data.phase) {
        const newPhase = data.phase as StreamPhase;
        if (session) {
          const oldPhase = session.currentPhase;

          // 🔥 Schema-Driven: 验证 phase 转换合法性
          const allowedTransitions = PHASE_TRANSITIONS[oldPhase] || [];
          if (!allowedTransitions.includes(newPhase)) {
            console.warn(`[SC] ⛔ Invalid phase transition: ${oldPhase} → ${newPhase} (allowed: ${allowedTransitions.join(', ')}), ignoring`);
            return;
          }

          session.currentPhase = newPhase;
          console.log(`[SC] 🔄 Stream phase transition: ${oldPhase} → ${newPhase}, correlationId=${payload.correlationId}`);

          // 🔥 Schema-Driven: 根据 PHASE_LOADING 更新 isLoading 状态
          const shouldLoad = PHASE_LOADING[newPhase];
          const chatStore = useChatStore.getState();
          if (chatStore.isLoading !== shouldLoad) {
            chatStore.setLoading(shouldLoad);
          }

          // 转发 phase 事件给 EventBus，UI 层可用于显示状态
          chatEventBus.emit('chat:stream:phase', {
            ...payload,
            phase: newPhase,
            previousPhase: oldPhase,
            toolCallId: data.tool_call_id || null,
          } as any);
        }
      }

      // 🔐 后端工具审批请求：非 safe 工具需要用户审批后后端才执行
      else if (data.type === 'tool_approval_required') {
        const toolCallId = data.tool_call_id || data.toolCallId;
        const toolName = data.tool_name || data.toolName || '';

        // 发送事件通知 UI 层显示审批状态
        chatEventBus.emit('chat:tool:approval-required', {
          ...payload,
          toolId: toolCallId,
          toolName,
          arguments: data.arguments,
          correlationId: data.correlation_id || payload.correlationId,
        } as any);
      }

      // 情况 C: 结束标志 (高度兼容模式：finish, finish_reason, done, OpenAI 格式)
      else if (
        data.type === 'finish' ||
        data.finish_reason ||
        data.finish ||
        data.done === true ||
        // 🆕 P2: 兼容 OpenAI/DeepSeek 格式的 finish_reason
        (data.choices && data.choices[0] && data.choices[0].finish_reason)
      ) {
        const finishReason = data.finish || data.finish_reason || (data.choices && data.choices[0] && data.choices[0].finish_reason);

        // 🔥 DIAGNOSTIC: 打印 finish 事件详情
        const currentPhase = session?.currentPhase || 'STREAMING';
        console.log(`[SC] 🏁 Finish event received: finishReason=${finishReason}, phase=${currentPhase}, correlationId=${payload.correlationId}`);

        // 🔥 Schema-Driven: 使用 evaluateStreamEvent 决定是否处理 finish 事件
        // 当 phase 为 AWAITING_APPROVAL 或 CONTINUING 时，emitFinished 被 suppress
        if (!evaluateStreamEvent(currentPhase, 'emitFinished')) {
          console.log(`[SC] ⛔ emitFinished suppressed by STREAM_RULES (phase=${currentPhase}), continuation in progress`);

          // 仍然 flush tool buffer（工具调用数据需要传递给 UI）
          if (finishReason === 'tool_calls' || finishReason === 'tool') {
            for (const [bufferKey, buffered] of this.toolCallBuffer.entries()) {
              if (buffered.hasName && buffered.arguments.length > 0) {
                chatEventBus.emit('chat:tool:call', {
                  ...payload,
                  toolId: buffered.toolId,
                  name: buffered.name,
                  arguments: buffered.arguments,
                });
              }
            }
            this.toolCallBuffer.clear();
            this.indexToBufferKey.clear();
          }
          return;
        }

        // finish_reason: "tool_calls" 在 STREAMING phase 下的处理
        //（正常流程：后端 continuation loop 还会继续发送事件）
        if (finishReason === 'tool_calls' || finishReason === 'tool') {
          console.log(`[SC] finish_reason=${finishReason}: flushing tool buffer (phase=${currentPhase})`);

          // Flush 任何仍在缓冲中的工具调用
          for (const [bufferKey, buffered] of this.toolCallBuffer.entries()) {
            if (buffered.hasName && buffered.arguments.length > 0) {
              chatEventBus.emit('chat:tool:call', {
                ...payload,
                toolId: buffered.toolId,
                name: buffered.name,
                arguments: buffered.arguments,
              });
            }
          }
          this.toolCallBuffer.clear();
          this.indexToBufferKey.clear();

          // 如果 phase 仍是 STREAMING，说明后端没有 continuation loop（无工具调用）
          // 这种情况下需要结束流
          if (currentPhase === 'STREAMING') {
            this.emitFinished(payload, data.usage?.total_tokens);
          }
          return;
        }

        console.log(`[SC] End of stream detected: ${finishReason || 'type:finish'}, calling emitFinished`);
        this.emitFinished(payload, data.usage?.total_tokens);
      }

      // 🏆 FIX: 检测空内容 chunk 作为备用 finish 信号
      // 某些后端（如本地模型）可能不发送标准 finish 事件
      // 如果收到空内容的 content chunk 且 buffer 中有完整的 tool call，视为流结束
      else if (data.type === 'content' && (!data.content || data.content === '')) {
        const hasCompleteToolCalls = Array.from(this.toolCallBuffer.entries())
          .some(([key, buffered]) => buffered.hasName && buffered.hasArgs);

        if (hasCompleteToolCalls) {
          this.emitFinished(payload);
        } else {
          // 正常的空 content chunk，继续等待
          this.emitChunk('', false, payload);
        }
      }
    } catch (error) {
      console.error('[SC] Parse error:', error);
      console.error('[SC] Failed raw data:', raw);

      // 🔥 FIX P0: 检查 raw 是否包含 JSON 控制数据后再发送
      if (typeof raw === 'string') {
        // 检查是否是 JSON 控制数据
        if (raw.includes('"choices":') && raw.includes('"delta":') && raw.includes('"content":')) {
          console.warn('[SC] ⚠️ JSON control data detected in parse error handler, discarding:', raw.substring(0, 100));
          return;
        }

        // 检查是否以 { 开头的可疑 JSON
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') && raw.length > 50 &&
            (raw.includes('"index":') || raw.includes('"content_block_index"'))) {
          console.warn('[SC] ⚠️ Suspicious JSON-like data in parse error handler, discarding:', raw.substring(0, 100));
          return;
        }

        // 🔥 DEBUG: 打印即将发送的原始数据
        console.log('[SC] 📤 Sending raw string as delta (parse fallback):', raw.substring(0, 50));
        this.emitChunk(raw, false, payload);
      }
    }
  }

  private emitChunk(delta: string, isFinal: boolean, payload: BasePayload, deltaIndex: number = -1) {
    // 🔥 FIX P0: 在发送前检查 delta 是否包含 JSON 控制数据
    if (delta && delta.length > 0) {
      // 检查是否包含完整的 JSON 控制数据格式
      if (delta.includes('"choices":') && delta.includes('"delta":') && delta.includes('"content":')) {
        console.error('[SC] 🚨 CRITICAL: JSON control data detected in emitChunk!');
        console.error('[SC] 🚨 delta:', delta.substring(0, 200));
        console.error('[SC] 🚨 correlationId:', payload.correlationId);
        console.error('[SC] 🚨 deltaIndex:', deltaIndex);
        console.error('[SC] 🚨 Stack trace:', new Error().stack);
        // 丢弃这个包含 JSON 控制数据的 delta
        return;
      }

      // 检查是否以 { 开头的可疑 JSON
      const trimmed = delta.trim();
      if (trimmed.startsWith('{') && delta.length > 30 &&
          (delta.includes('"index":') || delta.includes('"content_block_index"'))) {
        console.error('[SC] 🚨 CRITICAL: Suspicious JSON-like data detected in emitChunk!');
        console.error('[SC] 🚨 delta:', delta.substring(0, 200));
        console.error('[SC] 🚨 correlationId:', payload.correlationId);
        console.error('[SC] 🚨 deltaIndex:', deltaIndex);
        console.error('[SC] 🚨 Stack trace:', new Error().stack);
        // 丢弃这个可疑的 delta
        return;
      }
    }

    // 🔥 DEBUG: 仅在异常时打印（大片段）- 使用 logger 节流
    if (delta.length > 100) {
      logger.debug(`emitChunk: deltaIndex=${deltaIndex}, deltaLength=${delta.length}, preview="${delta.slice(0, 30)}"`);
    }

    chatEventBus.emit('chat:stream:chunk', {
      ...payload,
      delta,
      deltaIndex,  // 🔥 序号校验：添加序号
      fullContent: '',
      isFinal
    });
  }

  private emitFinished(payload: BasePayload, tokens?: number) {
    // 🔥 FIX v0.3.12: 幂等性保护 - 防止同一个 correlationId 多次触发 finish
    const correlationId = payload.correlationId;

    // 🔥 DIAGNOSTIC: 打印堆栈跟踪，追踪是哪个路径触发了 emitFinished - 使用 logger
    logger.debug(`emitFinished called: correlationId=${correlationId}`);
    logger.debug(`Call stack:`, new Error().stack?.split('\n').slice(1, 6).join('\n'));

    if (this.emittedFinish.has(correlationId)) {
      logger.warn(`Duplicate finish suppressed: ${correlationId}`);

      // 🏆 FIX: 强制清理可能残留的 session（续播场景可能导致 session 泄漏）
      const session = this.activeSessions.get(correlationId);
      if (session) {
        console.warn(`[SC] Stale session cleanup: ${correlationId}`);
        session.isFinished = true;
        this.stopListening(correlationId);
      }

      // 🏆 CRITICAL FIX: 确保输入框被启用，但避免重复发送事件导致循环
      const chatStore = useChatStore.getState();
      if (chatStore.isLoading) {
        chatStore.setLoading(false);
      }

      return;
    }

    // 🏆 第一次 finish：正常处理
    this.emittedFinish.add(correlationId);
    this.finishedEventEmitted.add(correlationId); // 记录已发送 finished 事件
    console.log(`[SC] Stream finished: ${correlationId}`);

    // 🏆 FIX: Emit 任何缓冲中的 tool calls（即使 JSON 不完整）
    if (this.toolCallBuffer.size > 0) {
      for (const [bufferKey, buffered] of this.toolCallBuffer.entries()) {
        if (buffered.hasName && buffered.arguments.length > 0) {
          chatEventBus.emit('chat:tool:call', {
            ...payload,
            toolId: buffered.toolId,
            name: buffered.name,
            arguments: buffered.arguments
          });
        }
      }

      this.toolCallBuffer.clear();
      this.indexToBufferKey.clear(); // 🏆 清理 index 映射
    }

    // 🏆 PIVO 3.0: 物理闭环信号
    // 用于 E2E 自动化测试的权威信号存根
    if (typeof window !== 'undefined') {
      if (!(window as any).__PIVO_SIGNALS__) (window as any).__PIVO_SIGNALS__ = {};
      (window as any).__PIVO_SIGNALS__['ifainew:stream-finished'] = {
        correlationId,
        timestamp: Date.now()
      };
    }

    // 🏆 发送全局窗口事件
    window.dispatchEvent(new CustomEvent('ifainew:stream-finished', { detail: { correlationId } }));
    window.dispatchEvent(new CustomEvent(`${correlationId}_finish`, { detail: { payload: 'done' } }));

    // 🏆 FIX: 检测空响应并提示
    const chatStore = useChatStore.getState();
    const targetMsg = chatStore.messages.find(m => m.id === correlationId);
    if (targetMsg && (!targetMsg.content || targetMsg.content.length < 5) && (!targetMsg.toolCalls || targetMsg.toolCalls.length === 0)) {
        console.warn(`[SC] Empty response detected: ${correlationId}`);
        chatEventBus.emit('chat:error', {
            correlationId,
            error: "AI returned an empty response. This might be due to a safety filter or model limitation. Please try again with a different prompt."
        });
    }

    // 🐛 FIX: 先 emit 事件再 cleanup，确保事件处理器（如 CrossThreadPersistenceService）
    // 在触发时仍能访问 session 信息（如 threadId）
    const session = this.activeSessions.get(correlationId);
    if (session) {
      session.isFinished = true;
    }

    chatEventBus.emit('chat:stream:finished', {
      ...payload,
      totalTokens: tokens,
      // 🏆 元编程：将 threadId 注入事件数据，使消费者（如 CPS）从 payload 声明式读取
      // 而不是在 async handler 中查询即将被 stopListening 删除的 session
      threadId: session?.threadId,
    });

    // 事件发出后清理 session 和监听器
    this.stopListening(payload.correlationId);

    // 🏆 FIX: 如果没有活跃会话了，物理停止心跳监测
    if (this.activeSessions.size === 0 && this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 停止并注销所有监听器 (防泄漏)
   */
  stopListening(correlationId: string) {
    const listeners = this.activeListeners.get(correlationId);
    if (listeners) {
      listeners.forEach(unlisten => unlisten());
      this.activeListeners.delete(correlationId);
    }

    // 🔧 清理 PIVO Bridge 监听器
    const pivoUnlisten = this.pivoBridgeUnlisteners.get(correlationId);
    if (pivoUnlisten) {
      pivoUnlisten();
      this.pivoBridgeUnlisteners.delete(correlationId);
    }

    // 🏆 FIX: 先标记会话为已完成，防止心跳监测器误判
    const session = this.activeSessions.get(correlationId);
    if (session) {
      session.isFinished = true;
    }

    // 🏆 清理会话
    this.activeSessions.delete(correlationId);

    // 🔥 FIX v0.3.12: 清理 finish 状态（延迟清理，防止已排队的 _finish 事件触发）
    // 注意：不立即清理 emittedFinish，因为已排队的 _finish 事件可能还需要检查幂等性
    // finish 状态会在下次 startListening 时被清理
  }

  /**
   * 🏆 PIVO 3.0: 鲁棒性正则提取器
   * 支持未闭合 JSON 的部分参数提取
   */
  private extractPartialArgs(argsStr: string): any {
    let parsed: any = {};
    try {
      parsed = JSON.parse(argsStr);
    } catch (e) {
      // 🏆 PIVO 3.0: 鲁棒性正则提取 (支持未闭合 JSON)
      const contentMatch = argsStr.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)/s);
      if (contentMatch) {
        parsed.content = contentMatch[1].replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
      }

      // 🏆 PIVO 3.0: 物理级路径捕获 - 采用非约束性匹配以支持流式内容
      const pathMatch = argsStr.match(/"(?:rel_)?path"\s*:\s*"(.*)/s);
      if (pathMatch) {
        let val = pathMatch[1];
        // 如果 argsStr 中在 val 之后确实存在符合 JSON 结构的闭合引号，则进行截断
        const structClosingMatch = val.match(/"\s*[,}\n]/);
        if (structClosingMatch) {
          val = val.substring(0, structClosingMatch.index);
        }
        parsed.rel_path = val;
        parsed.path = val;
      }

      // 🏆 v0.5.0: 增强型命令提取 - 支持 cmd 和 command，使用 /s 模式以匹配多行内容
      const commandMatch = argsStr.match(/"(?:command|cmd)"\s*:\s*"((?:[^"\\]|\\.)*)/s);
      if (commandMatch) {
        parsed.command = commandMatch[1].replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
        parsed.cmd = parsed.command; // 双向兼容
      }
    }
    return parsed;
  }

  /**
   * 🏆 PIVO 3.0: 处理工具调用更新
   * 支持碎片化名字拼接和部分参数累积
   */
  private processToolCallUpdate(
    correlationId: string,
    sessionId: string,
    update: any,
    existingCalls: any[] = []
  ): any[] {
    const deltaName = update.function?.name || update.tool || '';
    const newArgs = update.function?.arguments || '';
    let cid = update.id;

    // 使用 toolCallDeduplicator 规范化 ID
    if (update.id && typeof window !== 'undefined' && (window as any).toolCallDeduplicator) {
      cid = (window as any).toolCallDeduplicator.getCanonicalId(update.id) || update.id;
    }

    const idx = existingCalls.findIndex(tc =>
      (cid && tc.id === cid) ||
      (update.index !== undefined && (tc as any).index === update.index)
    );

    const isPartial = update.isPartial ?? true;

    if (idx !== -1) {
      // 更新现有工具调用
      const tc = existingCalls[idx];
      // 🏆 PIVO 3.0: 支持碎片化名字拼接 (DeepSeek 风格)
      const toolName = (tc.tool || '') + deltaName;
      const argsStr = ((tc as any).function?.arguments || '') + newArgs;
      const parsed = this.extractPartialArgs(argsStr);

      const updated = [...existingCalls];
      updated[idx] = {
        ...tc,
        tool: toolName,
        args: parsed,
        function: { name: toolName, arguments: argsStr },
        isPartial: isPartial
      } as any;

      // 触发自动审批（如果工具完成）
      if (isPartial === false) {
        const msg = { id: correlationId, toolCalls: updated, autoApproveTools: false };
        ApprovalPipeline.processAutoApproval(
          {
            settings: useSettingsStore.getState(),
            editorMode: (window as any).__IFAI_EDITOR_MODE__ || "standard",
            isSessionTrusted: false,
            toolName: toolName,
            userMessageHasAutoApprove: (msg as any).autoApproveTools || false
          },
          () => {
            const chatStore = useChatStore.getState();
            (chatStore as any).approveToolCall(correlationId, updated[idx].id, { skipContinue: true });
          }
        );
      }

      return updated;
    } else {
      // 创建新工具调用
      const tid = cid || `call_${crypto.randomUUID()}`;
      const iArgs = this.extractPartialArgs(newArgs);
      const tc = {
        id: tid,
        type: 'function',
        tool: deltaName,
        args: iArgs,
        function: { name: deltaName, arguments: newArgs },
        status: 'pending',
        isPartial: isPartial,
        index: update.index
      } as any;

      return [...existingCalls, tc];
    }
  }
}

export const streamingResponseController = new StreamingResponseController();
