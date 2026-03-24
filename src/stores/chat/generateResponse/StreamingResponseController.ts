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
    console.error('[StreamingResponseController] ❌ Failed to get Tauri listen function:', e);
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
        console.log(`[StreamController] 💓 Heartbeat updated for ${correlationId} (tool completed)`);
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

          // 🚀 OPTIMIZATION: 更激进的超时策略
          // 如果有内容但没有待处理工具，5秒超时后强制完成（从30秒缩短到5秒）
          // 🏆 FIX: 增加 session.hasReceivedChunk 判断，确保不会在续播刚开始、首包还没到时就触发快杀
          // 🏆 FIX: 增加 session.startTime 保护期判断，前 15 秒内绝对禁止快杀，给续播/思考留出充足时间
          if (session.hasReceivedChunk && (hasContent || hasToolCalls) && !hasPendingTools && (now - session.lastHeartbeat > 5000) && (now - session.startTime > 15000)) {
            console.warn(`[StreamController] ⚡ Fast finish: Content received, no pending tools, 5s timeout for ${correlationId}`);
            this.emitFinished({ correlationId, sessionId: session.sessionId || '', timestamp: Date.now() });
            return;
          }

          // 15 秒超时阈值（原有逻辑）
          // 🏆 FIX: 增加 startTime 保护，确保前 15 秒内不触发自愈/终止
          if (now - session.lastHeartbeat > 15000 && now - session.startTime > 15000) {
            console.warn(`[StreamController] 🛡️ Sentinel detected stall for session: ${correlationId}`);
            this.triggerPhysicalSelfHealing(correlationId);
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

    // PIVO 信号存根用于测试
    if (typeof window !== 'undefined') {
      if (!(window as any).__PIVO_SIGNALS__) (window as any).__PIVO_SIGNALS__ = {};
      (window as any).__PIVO_SIGNALS__['ifainew:self-healing-triggered'] = {
        correlationId,
        timestamp: Date.now()
      };
    }

    const hasUnclosedTool = msg.toolCalls?.some(tc => tc.isPartial);
    const hasContent = !!msg.content && String(msg.content).trim().length > 0;
    const hasAnyTool = msg.toolCalls && msg.toolCalls.length > 0;

    if (hasUnclosedTool || (!hasContent && !hasAnyTool)) {
      const reason = hasUnclosedTool ? "Unclosed tool" : "Startup stall";
      console.log(`[StreamController] 🔄 Physical Auto-Continue (${reason}): ${correlationId}`);

      // 重置心跳防止死循环
      const session = this.activeSessions.get(correlationId);
      if (session) session.lastHeartbeat = Date.now();

      const settings = useSettingsStore.getState();
      const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
      if (providerConfig) {
        (chatStore as any).generateResponse(chatStore.messages, providerConfig);
      }
    } else {
      console.log(`[StreamController] 🛡️ Physical Finalize (Normal stop): ${correlationId}`);
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
          console.log(`[PIVO-BRIDGE] 📥 Direct Injection: ${id}`, payload);
          window.dispatchEvent(new CustomEvent(`pivo:direct-chunk:${id}`, { detail: payload }));
        },
        finalize: (id: string) => {
          console.log(`[PIVO-BRIDGE] 🏁 Direct Finalize: ${id}`);
          window.dispatchEvent(new CustomEvent(`pivo:direct-finish:${id}`));
        }
      };
      console.log('[StreamController] ✅ PIVO Bridge initialized');
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
      console.log('[PIVO-BRIDGE] 📨 Received chunk via PIVO Bridge:', customEvent.detail);
      this.handleBackendEvent(customEvent.detail, payload);
    };

    // 监听直接注入的 finish
    const finishHandler = () => {
      console.log('[PIVO-BRIDGE] 🏁 Received finish via PIVO Bridge');
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
    console.log(`[StreamController] ✅ PIVO Bridge listeners registered for ${correlationId}`);
  }

  /**
   * 启动针对特定消息的流式监听
   */
  async startListening(messageId: string, payload: BasePayload) {
    console.log(`[StreamController] 📡 ========== START LISTENING ==========`);
    console.log(`[StreamController] 📡 Starting listener for ${messageId}`);
    console.log(`[StreamController] 📡 Payload correlationId: ${payload.correlationId}`);
    console.log(`[StreamController] 📡 Payload sessionId: ${payload.sessionId}`);

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
      console.log(`[StreamController] 🔄 Continuation mode: Physical Reset for ${payload.correlationId}`);
      this.emittedFinish.delete(payload.correlationId);
    }

    // 🏆 物理隔离：仅在彻底新建会话时清理旧监听器
    if (!isContinuation && this.activeListeners.has(payload.correlationId)) {
      console.log(`[StreamController] 🛡️ Non-continuation: Performing full cleanup for ${payload.correlationId}`);
      this.stopListening(payload.correlationId);
    }

    // 🔥 FIX v0.3.13: 续播场景下清理旧监听器 (必须在创建新 session 之前)
    if (isContinuation && this.activeListeners.has(payload.correlationId)) {
      console.log(`[StreamController] 🧹 Cleaning up old listeners for continuation: ${payload.correlationId}`);
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
      messageId
    };
    this.activeSessions.set(payload.correlationId, session);

    // 🏆 物理对齐：使用 correlationId 构建 eventId，确保与 Rust 后端（lib.rs）完全一致
    // 注意：后端发射格式始终为 "chat_${correlationId}"
    const eventId = `chat_${payload.correlationId}`;

    console.log(`[StreamController] 🎯 Target eventId: ${eventId}`);
    console.log(`[StreamController] 🎯 correlationId: ${payload.correlationId}`);
    console.log(`[StreamController] 🎯 messageId: ${messageId}`);
    console.log(`[StreamController] 🎯 Payload sessionId: ${threadId}`);

    if (messageId !== payload.correlationId) {
      console.warn(`[StreamController] ⚠️ MESSAGE ID MISMATCH: messageId="${messageId}" vs correlationId="${payload.correlationId}"`);
      console.warn(`[StreamController] ⚠️ This may cause eventId mismatch - backend sends to "chat_${payload.correlationId}" but we listen to "chat_${messageId}"`);
    } else {
      console.log(`[StreamController] ✅ Message ID matches correlationId - eventId should be consistent`);
    }

    // 🔧 注册 PIVO Bridge 监听器（E2E 测试支持）
    this.registerPIVOBridgeListener(payload.correlationId, payload);

    // 🏆 物理兼容性：如果不在真实 Tauri 环境，使用仿真监听器
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
        console.warn('[StreamController] 🛡️ Non-Tauri environment detected. Using simulated listeners.');
        this.activeListeners.set(payload.correlationId, [() => {}]);
        return;
    }

    try {
        // 🔥 FIX: 使用动态获取的 listen 函数，修复 E2E 环境中的模块解析问题
        const listen = await getTauriListen();

        // 🔥 DEBUG: 诊断 Tauri event listen 是否可用
        console.log('[StreamController] 🔍 Tauri Event Listen Check:', {
          eventId,
          listenFunctionExists: typeof listen === 'function',
          listenSource: typeof window !== 'undefined' && (window as any).__TAURI__?.event?.listen ? 'global' : 'module',
          correlationId: payload.correlationId
        });

        // 1. 监听状态更新 (Status)
        const unlistenStatus = await listen(`${eventId}_status`, (event: any) => {
          console.log(`[StreamController] 📨 Status event received:`, event.payload);
          session.lastHeartbeat = Date.now();
          chatEventBus.emit('chat:session:sync', {
            ...payload,
            state: { status: event.payload }
          });
        });

        // 2. 监听核心内容流 (Stream)
        console.log(`[StreamController] 🔍 Attempting to listen to eventId: ${eventId}`);
        console.log(`[StreamController] 🔍 Is this a continuation?`, isContinuation);
        console.log(`[StreamController] 🔍 ActiveListeners before:`, Array.from(this.activeListeners.keys()));
        let unlistenStream;
        let eventReceived = false;

        // 🔥 FIX v0.3.14: 根据场景使用不同的超时时间
        // - 首次请求: 15秒超时（DeepSeek/OpenAI 正常响应时间）
        // - 续播请求: 30秒超时（工具调用后 LLM 需要更长时间）
        // 这是一个诊断超时，不会中断实际的流处理
        const timeoutMs = isContinuation ? 30000 : 15000;
        const eventTimeoutCheck = setTimeout(() => {
          if (!eventReceived) {
            console.warn(`[StreamController] ⏰ EVENT TIMEOUT: No events received within ${timeoutMs}ms for eventId: ${eventId}`);
            console.warn(`[StreamController] ⏰ This is expected for slow LLMs (DeepSeek, local models) - the stream may still arrive`);
            console.warn(`[StreamController] 🔍 Expected eventId: ${eventId}`);
            console.warn(`[StreamController] 🔍 Is continuation: ${isContinuation}`);
            console.warn(`[StreamController] 🔍 correlationId: ${payload.correlationId}`);
          }
        }, timeoutMs);

        try {
            unlistenStream = await listen(eventId, (event: any) => {
                if (!eventReceived) {
                  eventReceived = true;
                  clearTimeout(eventTimeoutCheck);
                  console.log(`[StreamController] ✅ First event received after ${(Date.now() - session.lastHeartbeat)}ms`);
                }
                console.log(`[StreamController] 📨 Stream event received, type:`, typeof event.payload);
                console.log(`[StreamController] 📨 Raw payload:`, event.payload);
                session.lastHeartbeat = Date.now();
                this.handleBackendEvent(event.payload, payload);
            });
            console.log(`[StreamController] ✅ Successfully registered listener for ${eventId}`);
        } catch (e) {
            clearTimeout(eventTimeoutCheck);
            console.error(`[StreamController] ❌ Failed to listen to ${eventId}:`, e);
            throw e;
        }

        // 3. 🔥 FIX: 监听 finish 事件（商业版 ifainew_core 发送）
        const unlistenFinish = await listen(`${eventId}_finish`, (event: any) => {
          console.log(`[StreamController] 🏁 Finish event received for ${payload.correlationId}:`, event.payload);
          console.log(`[StreamController] 🏁 Already emitted? ${this.emittedFinish.has(payload.correlationId)}`);
          this.emitFinished(payload);
        });

        // 4. 🔥 FIX: 监听 error 事件（后端 API 错误或致命错误时发送）
        const unlistenError = await listen(`${eventId}_error`, (event: any) => {
          console.error(`[StreamController] ❌ Error event received for ${payload.correlationId}:`, event.payload);
          // 发送错误事件到 EventBus
          chatEventBus.emit('chat:error', {
            correlationId: payload.correlationId,
            error: event.payload
          });
          // 结束流并设置 isLoading = false
          this.emitFinished(payload);
        });

        // 5. 记录监听器以便后续清理
        this.activeListeners.set(payload.correlationId, [unlistenStatus, unlistenStream, unlistenFinish, unlistenError]);
        console.log(`[StreamController] ✅ Listening to eventId: ${eventId} (including _finish)`);
        console.log(`[StreamController] 🎯 Registered listeners for correlationId: ${payload.correlationId}`);
    } catch (e) {
        console.error('[StreamController] ❌ Failed to setup Tauri listeners:', e);
    }
  }

  /**
   * 处理后端返回的原始事件
   */
  private handleBackendEvent(raw: any, payload: BasePayload) {
    console.log('[StreamController] 🔍 handleBackendEvent called, raw type:', typeof raw);

    // 🏆 FIX: 只要收到数据，立即刷新心跳并标记已接收数据
    const session = this.activeSessions.get(payload.correlationId);
    if (session && raw) {
      session.hasReceivedChunk = true;
      session.lastHeartbeat = Date.now();
    }

    // 🏆 FIX: 如果 raw 是空或已经结束，检测是否需要触发 finish
    if (!raw) {
      console.log('[StreamController] ⚠️ Raw is empty/null, checking if stream should finish...');
      // 检查是否有待处理的工具或内容
      const chatStore = useChatStore.getState();
      const msg = chatStore.messages.find(m => m.id === payload.correlationId);
      const hasPendingTools = msg?.toolCalls?.some((tc: any) =>
        tc.status === 'pending' || tc.status === 'approved' || tc.status === 'executing' || tc.isPartial
      );

      if (!hasPendingTools) {
        console.log('[StreamController] 🏁 No pending tools, triggering finish (empty raw)');
        this.emitFinished(payload);
      }
      return;
    }

    console.log('[StreamController] 🔍 Raw value:', raw);

    // 🏆 物理保险丝：如果 raw 为空或 undefined，可能意味着流已结束
    if (!raw) {
      this.emitFinished(payload);
      return;
    }

    try {
      let data = raw;
      if (typeof raw === 'string') {
        console.log('[StreamController] 🔍 Raw is string, attempting JSON parse...');
        try {
          data = JSON.parse(raw);
          console.log('[StreamController] ✅ JSON parse success, data:', data);
        } catch (e) {
          console.log('[StreamController] ⚠️ JSON parse failed, treating as text chunk');
          // 🏆 文本片段处理
          this.emitChunk(raw, false, payload);
          return;
        }
      }

      console.log('[StreamController] 🔍 Processed data type:', data.type, 'full data:', data);

      // 情况 A: 文本内容
      if (data.type === 'content') {
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
            console.log('[StreamController] ⏸️ Empty content with tool calls - waiting for tool completion and finish event');
            // 不要触发 emitFinished，等待真正的 _finish 事件
            return;
          }

          // 没有工具调用时的空 content，可能是真正的流结束
          console.log('[StreamController] 🏁 Empty content without tool calls - potential stream end');
          // 继续处理，但不立即 finish，等待 _finish 事件
        }

        console.log('[StreamController] 📝 Content chunk:', data.content?.substring(0, 50));
        this.emitChunk(data.content || '', false, payload);
      }

      // 情况 B: 工具调用 (深度提取支持)
      else if (data.type === 'tool_call' || data.type === 'toolCall' || data.tool_calls) {
        console.log('[StreamController] 🔧 Tool call detected!');
        console.log('[StreamController] 🔧 data.tool_call:', data.tool_call);
        console.log('[StreamController] 🔧 data.toolCall:', data.toolCall);
        console.log('[StreamController] 🔧 data.tool_calls:', data.tool_calls);

        // 🏆 兼容私有库的数据结构：优先使用 tool_call 字段（私有库使用的格式）
        const tc = data.tool_call || data.toolCall || data.tool_calls?.[0];

        console.log('[StreamController] 🔧 Extracted tc:', tc);

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
              console.log('[StreamController] 📝 Index mapping created:', indexKey, '->', bufferKey);
            } else {
              // 后续 chunks 没有 id，尝试通过 index 找到对应的 buffer key
              bufferKey = this.indexToBufferKey.get(indexKey) || indexKey;
            }

            console.log('[StreamController] 🔧 Chunk analysis:', {
              bufferKey,
              originalId,
              index: tc.index,
              indexKey,
              toolName: toolName || '(empty)',
              toolArgs: toolArgs.substring(0, 50),
              hasName: !!toolName,
              hasArgs: toolArgs.length > 0
            });

            // 跳过既没有 name 也没有 arguments 的无效 chunk
            if (!toolName && !toolArgs) {
              console.warn('[StreamController] ⚠️ Empty chunk (no name, no args), skipping');
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
              console.log('[StreamController] 📝 Tool name buffered:', toolName);
            }

            // 🏆 累积 arguments（可能流式到达）
            if (toolArgs) {
              buffered.arguments += toolArgs;
              buffered.hasArgs = buffered.arguments.length > 0;
              console.log('[StreamController] 📝 Arguments buffered, total length:', buffered.arguments.length);
              console.log('[StreamController] 📝 Current arguments:', buffered.arguments);
            }

            // 🏆 当有 name 且有完整的 arguments 时，emit 工具调用
            if (buffered.hasName && buffered.hasArgs) {
              // 尝试解析 JSON 检查完整性
              let isComplete = false;
              try {
                JSON.parse(buffered.arguments);
                isComplete = true;
                console.log('[StreamController] ✅ Arguments JSON is complete:', buffered.arguments);
              } catch (e) {
                // JSON 不完整，继续等待更多 chunks
                console.log('[StreamController] ⏳ Arguments JSON incomplete, waiting for more chunks...');
              }

              if (isComplete) {
                console.log('[StreamController] 🎯 Emitting complete tool call:', {
                  toolId: buffered.toolId,
                  name: buffered.name,
                  argsLength: buffered.arguments.length
                });

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
            console.warn('[StreamController] ⚠️ Tool call data structure not recognized:', data);
        }
      }

      // 情况 C: 结束标志 (高度兼容模式：finish, finish_reason, done)
      else if (data.type === 'finish' || data.finish_reason || data.finish || data.done === true) {
        console.log(`[StreamController] 🏁 End of stream detected via: ${data.finish || data.finish_reason || 'type:finish'}`);
        console.log('[StreamController] 🏁 Finish data:', data);
        this.emitFinished(payload, data.usage?.total_tokens);
      }

      // 🏆 FIX: 检测 finish=tool_calls 的情况
      else if (data.finish === 'tool_calls' || data.finish === 'tool') {
        console.log(`[StreamController] 🏁 End of stream detected (tool_calls):`, data.finish);
        console.log('[StreamController] 🏁 Finish data:', data);
        this.emitFinished(payload, data.usage?.total_tokens);
      }

      // 🏆 FIX: 检测空内容 chunk 作为备用 finish 信号
      // 某些后端（如本地模型）可能不发送标准 finish 事件
      // 如果收到空内容的 content chunk 且 buffer 中有完整的 tool call，视为流结束
      else if (data.type === 'content' && (!data.content || data.content === '')) {
        const hasCompleteToolCalls = Array.from(this.toolCallBuffer.entries())
          .some(([key, buffered]) => buffered.hasName && buffered.hasArgs);

        if (hasCompleteToolCalls) {
          console.log('[StreamController] 🏁 Detected finish via empty content chunk with complete tool calls');
          this.emitFinished(payload);
        } else {
          // 正常的空 content chunk，继续等待
          this.emitChunk('', false, payload);
        }
      } else {
        console.log('[StreamController] ⚠️ Unhandled event type:', data.type);
      }
    } catch (error) {
      console.error('[StreamController] ❌ Parse error:', error);
      // 解析失败不代表流断了，尝试作为纯文本发出
      if (typeof raw === 'string') this.emitChunk(raw, false, payload);
    }
  }

  private emitChunk(delta: string, isFinal: boolean, payload: BasePayload) {
    chatEventBus.emit('chat:stream:chunk', {
      ...payload,
      delta,
      fullContent: '', 
      isFinal
    });
  }

  private emitFinished(payload: BasePayload, tokens?: number) {
    // 🔥 FIX v0.3.12: 幂等性保护 - 防止同一个 correlationId 多次触发 finish
    const correlationId = payload.correlationId;
    console.log(`[StreamController] 🔍 emitFinished called for ${correlationId}, emittedFinish.size: ${this.emittedFinish.size}, has: ${this.emittedFinish.has(correlationId)}`);

    if (this.emittedFinish.has(correlationId)) {
      console.warn(`[StreamController] ⚠️ Finish already emitted for ${correlationId}, skipping duplicate`);

      // 🏆 FIX: 强制清理可能残留的 session（续播场景可能导致 session 泄漏）
      const session = this.activeSessions.get(correlationId);
      if (session) {
        console.warn(`[StreamController] 🛡️ Found stale session for ${correlationId}, force cleaning up...`);
        session.isFinished = true;
        this.stopListening(correlationId);
      }

      // 🏆 CRITICAL FIX: 确保输入框被启用，但避免重复发送事件导致循环
      const chatStore = useChatStore.getState();
      if (chatStore.isLoading) {
        console.log(`[StreamController] 🔄 Force setting isLoading to false (duplicate finish)`);
        chatStore.setLoading(false);
      }

      return;
    }

    // 🏆 第一次 finish：正常处理
    this.emittedFinish.add(correlationId);
    this.finishedEventEmitted.add(correlationId); // 记录已发送 finished 事件
    console.log(`[StreamController] ✅ First finish for ${correlationId}, proceeding... Added to Set, size now: ${this.emittedFinish.size}`);

    // 🏆 FIX: Emit 任何缓冲中的 tool calls（即使 JSON 不完整）
    if (this.toolCallBuffer.size > 0) {
      console.log('[StreamController] 🔄 Emitting buffered tool calls before finish:', this.toolCallBuffer.size);

      for (const [bufferKey, buffered] of this.toolCallBuffer.entries()) {
        if (buffered.hasName && buffered.arguments.length > 0) {
          console.log('[StreamController] 🎯 Emitting buffered tool call:', {
            toolId: buffered.toolId,
            name: buffered.name,
            argsLength: buffered.arguments.length,
            arguments: buffered.arguments
          });

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
    console.log(`[PIVO-SIGNAL] 🏁 Stream Finalized: ${correlationId}`);

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
        console.warn(`[StreamController] ⚠️ Empty response detected for ${correlationId}`);
        chatEventBus.emit('chat:error', {
            correlationId,
            error: "AI returned an empty response. This might be due to a safety filter or model limitation. Please try again with a different prompt."
        });
    }

    // 🏆 FIX: 在清理前标记 session 为已完成，防止心跳监测器误判
    const session = this.activeSessions.get(correlationId);
    if (session) {
      session.isFinished = true;
      console.log(`[StreamController] ✅ Session ${correlationId} marked as finished before stopListening`);
    }

    this.stopListening(payload.correlationId);

    // 🏆 FIX: 如果没有活跃会话了，物理停止心跳监测
    if (this.activeSessions.size === 0 && this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      console.log('[StreamController] 🛑 Heartbeat monitor stopped (no active sessions)');
    }

    chatEventBus.emit('chat:stream:finished', {
      ...payload,
      totalTokens: tokens
    });
  }

  /**
   * 停止并注销所有监听器 (防泄漏)
   */
  stopListening(correlationId: string) {
    const listeners = this.activeListeners.get(correlationId);
    if (listeners) {
      console.log(`[StreamController] 🛑 Cleaning up listeners for ${correlationId}`);
      listeners.forEach(unlisten => unlisten());
      this.activeListeners.delete(correlationId);
    }

    // 🔧 清理 PIVO Bridge 监听器
    const pivoUnlisten = this.pivoBridgeUnlisteners.get(correlationId);
    if (pivoUnlisten) {
      console.log(`[StreamController] 🛑 Cleaning up PIVO Bridge listeners for ${correlationId}`);
      pivoUnlisten();
      this.pivoBridgeUnlisteners.delete(correlationId);
    }

    // 🏆 FIX: 先标记会话为已完成，防止心跳监测器误判
    const session = this.activeSessions.get(correlationId);
    if (session) {
      session.isFinished = true;
      console.log(`[StreamController] ✅ Session ${correlationId} marked as finished before deletion`);
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
            isSandbox: true,
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
