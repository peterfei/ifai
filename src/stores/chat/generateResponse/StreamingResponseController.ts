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
  }

  /**
   * 处理后端返回的原始事件
   */
  private handleBackendEvent(raw: any, payload: BasePayload) {
    try {
      let data = raw;
      if (typeof raw === 'string') {
        try { data = JSON.parse(raw); } catch { /* text fragment */ }
      }

      // 情况 A: 文本内容
      if (data.type === 'content' || (typeof data === 'string' && !data.startsWith('{'))) {
        const delta = data.content || (typeof data === 'string' ? data : '');
        chatEventBus.emit('chat:stream:chunk', {
          ...payload,
          delta,
          fullContent: '', // 由 Store 层聚合
          isFinal: false
        });
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

      // 情况 C: 结束标志
      else if (data.type === 'finish' || data.finish_reason) {
        this.stopListening(payload.correlationId);
        chatEventBus.emit('chat:stream:finished', {
          ...payload,
          totalTokens: data.usage?.total_tokens
        });
      }
    } catch (error) {
      console.error('[StreamController] ❌ Parse error:', error);
    }
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
