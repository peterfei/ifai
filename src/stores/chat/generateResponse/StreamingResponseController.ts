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

export class StreamingResponseController {
  private activeListeners: Map<string, Function[]> = new Map();

  /**
   * 工具调用参数累积缓冲区
   * 用于在流式传输过程中逐步累积完整的 arguments
   * Key: bufferKey (优先用 id，其次用 index), Value: { name, arguments, hasName, hasArgs, toolId }
   */
  private toolCallBuffer: Map<string, { name: string; arguments: string; hasName: boolean; hasArgs: boolean; toolId: string }> = new Map();

  /**
   * Index 到 ID 的映射
   * 用于处理流式传输时后续 chunks 的 id 为 null 的情况
   * Key: index (如 "0"), Value: bufferKey (如 "id-call_123")
   */
  private indexToBufferKey: Map<string, string> = new Map();

  /**
   * 启动针对特定消息的流式监听
   */
  async startListening(messageId: string, payload: BasePayload) {
    console.log(`[StreamController] 📡 Starting listener for ${messageId}`);

    // 🏆 新增：触发 chat:stream:start 事件，初始化 ContentSegmentManager
    chatEventBus.emit('chat:stream:start', {
      messageId: messageId,
      correlationId: payload.correlationId,
      sessionId: payload.sessionId,
      timestamp: payload.timestamp || Date.now()
    });

    // 🏆 物理对齐：使用私有库的 eventId 格式 "chat_${correlationId}"
    const eventId = `chat_${messageId}`;

    console.log(`[StreamController] 🎯 Target eventId: ${eventId}`);
    console.log(`[StreamController] 🎯 Payload correlationId: ${payload.correlationId}`);
    console.log(`[StreamController] 🎯 Payload sessionId: ${payload.sessionId}`);

    // 🏆 FIX: 防止重复注册监听器（会导致内容重复追加）
    // 在续播场景下，同一个 correlationId 可能多次调用 startListening
    if (this.activeListeners.has(payload.correlationId)) {
      console.log(`[StreamController] 🛡️ Existing listeners found for ${payload.correlationId}, cleaning up first...`);
      this.stopListening(payload.correlationId);
    }

    // 🏆 物理兼容性：如果不在真实 Tauri 环境，使用仿真监听器
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
        console.warn('[StreamController] 🛡️ Non-Tauri environment detected. Using simulated listeners.');
        this.activeListeners.set(payload.correlationId, [() => {}]);
        return;
    }

    try {
        const { listen } = await import('@tauri-apps/api/event');
        // 1. 监听状态更新 (Status)
        const unlistenStatus = await listen<string>(`${eventId}_status`, (event) => {
          console.log(`[StreamController] 📨 Status event received:`, event.payload);
          chatEventBus.emit('chat:session:sync', {
            ...payload,
            state: { status: event.payload }
          });
        });

        // 2. 监听核心内容流 (Stream)
        const unlistenStream = await listen<any>(eventId, (event) => {
          console.log(`[StreamController] 📨 Stream event received, type:`, typeof event.payload);
          console.log(`[StreamController] 📨 Raw payload:`, event.payload);
          this.handleBackendEvent(event.payload, payload);
        });

        // 3. 🔥 FIX: 监听 finish 事件（商业版 ifainew_core 发送）
        const unlistenFinish = await listen<string>(`${eventId}_finish`, (event) => {
          console.log(`[StreamController] 🏁 Finish event received:`, event.payload);
          this.emitFinished(payload);
        });

        // 4. 记录监听器以便后续清理
        this.activeListeners.set(payload.correlationId, [unlistenStatus, unlistenStream, unlistenFinish]);
        console.log(`[StreamController] ✅ Listening to eventId: ${eventId} (including _finish)`);
    } catch (e) {
        console.error('[StreamController] ❌ Failed to setup Tauri listeners:', e);
    }
  }

  /**
   * 处理后端返回的原始事件
   */
  private handleBackendEvent(raw: any, payload: BasePayload) {
    console.log('[StreamController] 🔍 handleBackendEvent called, raw type:', typeof raw);
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

          if (hasCompleteToolCalls) {
            console.log('[StreamController] 🏁 Detected finish via empty content chunk with complete tool calls');
            this.emitFinished(payload);
            return;
          }
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
                console.log('[StreamController] ⏳ Current arguments:', buffered.arguments);
                console.log('[StreamController] ⏳ Parse error:', e);
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

    this.stopListening(payload.correlationId);
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
  }
}

export const streamingResponseController = new StreamingResponseController();
