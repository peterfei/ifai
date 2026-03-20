/**
 * StreamingResponseController - 流式响应控制器 (Phase 4)
 * 
 * 负责与 Tauri 后端通信，监听流式 SSE 事件并转化为 EventBus 信号。
 * 解决底层通信与 UI 状态的耦合问题。
 * 
 * @version v1.0.0
 */

import { listen } from '@tauri-apps/api/event';
import { chatEventBus, BasePayload } from '../eventBus/ChatEventBus';

export class StreamingResponseController {
  private activeListeners: Map<string, Function[]> = new Map();

  /**
   * 启动针对特定消息的流式监听
   */
  async startListening(messageId: string, payload: BasePayload) {
    console.log(`[StreamController] 📡 Starting listener for ${messageId}`);

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

        // 3. 记录监听器以便后续清理
        this.activeListeners.set(payload.correlationId, [unlistenStatus, unlistenStream]);
        console.log(`[StreamController] ✅ Listening to eventId: ${eventId}`);
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
            // 🏆 FIX: 添加详细的调试日志
            console.log('[StreamController] 🔧 Tool call data:', JSON.stringify(tc, null, 2));
            console.log('[StreamController] 🔧 Tool name extraction:', {
              'tc.function?.name': tc.function?.name,
              'tc.name': tc.name,
              'tc.tool': tc.tool,
              'tc.type': tc.type,
              'final': tc.function?.name || tc.name || tc.tool || 'Unknown Tool'
            });

            const toolName = tc.function?.name || tc.name || tc.tool || 'Unknown Tool';
            const toolArgs = tc.function?.arguments || tc.arguments || '';

            console.log('[StreamController] 🔧 Emitting chat:tool:call with:');
            console.log('[StreamController] 🔧   toolId:', tc.id || `tc-${Date.now()}`);
            console.log('[StreamController] 🔧   name:', toolName);
            console.log('[StreamController] 🔧   arguments:', toolArgs.substring(0, 50));

            chatEventBus.emit('chat:tool:call', {
              ...payload,
              toolId: tc.id || `tc-${Date.now()}`,
              name: toolName,
              arguments: toolArgs
            });
        } else {
            console.warn('[StreamController] ⚠️ Tool call data structure not recognized:', data);
        }
      }

      // 情况 C: 结束标志 (高度兼容模式：finish, finish_reason, done)
      else if (data.type === 'finish' || data.finish_reason || data.finish || data.done === true) {
        console.log(`[StreamController] 🏁 End of stream detected via: ${data.finish || data.finish_reason || 'type:finish'}`);
        this.emitFinished(payload, data.usage?.total_tokens);
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
