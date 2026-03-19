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
    
    // 🏆 物理兼容性：如果不在真实 Tauri 环境，使用仿真监听器
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
        console.warn('[StreamController] 🛡️ Non-Tauri environment detected. Using simulated listeners.');
        this.activeListeners.set(payload.correlationId, [() => {}]);
        return;
    }

    try {
        const { listen } = await import('@tauri-apps/api/event');
        // 1. 监听状态更新 (Status)
        const unlistenStatus = await listen<string>(`${messageId}_status`, (event) => {
          chatEventBus.emit('chat:session:sync', {
            ...payload,
            state: { status: event.payload }
          });
        });

        // 2. 监听核心内容流 (Stream)
        const unlistenStream = await listen<any>(messageId, (event) => {
          this.handleBackendEvent(event.payload, payload);
        });

        // 3. 记录监听器以便后续清理
        this.activeListeners.set(payload.correlationId, [unlistenStatus, unlistenStream]);
    } catch (e) {
        console.error('[StreamController] ❌ Failed to setup Tauri listeners:', e);
    }
  }

  /**
   * 处理后端返回的原始事件
   */
  private handleBackendEvent(raw: any, payload: BasePayload) {
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
        } catch { 
          // 🏆 文本片段处理
          this.emitChunk(raw, false, payload);
          return;
        }
      }

      // 情况 A: 文本内容
      if (data.type === 'content') {
        this.emitChunk(data.content || '', false, payload);
      }
      
      // 情况 B: 工具调用
      else if (data.type === 'tool_call' || data.type === 'toolCall') {
        const toolCall = data.toolCall || data.tool_call;
        chatEventBus.emit('chat:tool:call', {
          ...payload,
          toolId: toolCall.id,
          name: toolCall.function?.name || toolCall.tool,
          arguments: toolCall.function?.arguments || ''
        });
      }

      // 情况 C: 结束标志 (多种兼容格式)
      else if (data.type === 'finish' || data.finish_reason || data.done === true) {
        this.emitFinished(payload, data.usage?.total_tokens);
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
