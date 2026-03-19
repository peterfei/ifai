/**
 * ChatEventBus - 核心聊天事件总线 (神经系统)
 * 
 * 基于订阅-发布模式，用于解耦 ChatStore 各子模块。
 * 强制执行 Correlation ID 协议，确保消息链路完整。
 * 
 * @version v1.0.0
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * 基础 Payload 类型：强制包含相关性 ID
 */
export interface BasePayload {
  correlationId: string; // 🏆 消息生命周期全链路 ID
  sessionId: string;    // 会话 ID (Thread ID)
  timestamp: number;    // 事件发生时间
}

/**
 * 聊天事件定义
 */
export interface ChatEvents {
  // 消息发送域
  'chat:message:sending': BasePayload & { content: string; providerId: string; model: string };
  'chat:message:sent': BasePayload & { messageId: string; content: string };
  'chat:intent:detected': BasePayload & { intent: { type: string; confidence: number }; metadata?: any };
  
  // 响应生成域
  'chat:stream:start': BasePayload & { messageId: string };
  'chat:stream:chunk': BasePayload & { delta: string; fullContent: string; isFinal: boolean };
  'chat:stream:finished': BasePayload & { totalTokens?: number };
  
  // 工具调用域
  'chat:tool:call': BasePayload & { toolId: string; name: string; arguments: string };
  'chat:tool:approved': BasePayload & { toolId: string };
  'chat:tool:completed': BasePayload & { toolId: string; result: any; error?: string };
  
  // 系统与错误域
  'chat:error': BasePayload & { code: string; message: string; stack?: string; moduleId: string };
  'chat:session:sync': BasePayload & { state: any }; // 用于触发持久化
}

type Handler<T = any> = (event: T) => void;

/**
 * ChatEventBus - 高性能事件分发器
 */
export class ChatEventBus {
  private handlers: Map<keyof ChatEvents, Handler[]> = new Map();
  private middleware: Array<(event: keyof ChatEvents, payload: any) => void> = [];

  /**
   * 注册事件监听器
   */
  on<K extends keyof ChatEvents>(type: K, handler: Handler<ChatEvents[K]>) {
    const handlers = this.handlers.get(type) || [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
    return () => this.off(type, handler);
  }

  /**
   * 移除事件监听器
   */
  off<K extends keyof ChatEvents>(type: K, handler: Handler<ChatEvents[K]>) {
    const handlers = this.handlers.get(type) || [];
    this.handlers.set(type, handlers.filter(h => h !== handler));
  }

  /**
   * 分发事件 (带有中间件拦截与错误边界保护)
   */
  emit<K extends keyof ChatEvents>(type: K, payload: ChatEvents[K]) {
    // 1. 执行中间件 (用于日志、审计、性能追踪)
    this.middleware.forEach(m => {
      try {
        m(type, payload);
      } catch (e) {
        console.error(`[ChatEventBus] Middleware error:`, e);
      }
    });

    // 2. 执行核心 Handler
    const handlers = this.handlers.get(type) || [];
    handlers.forEach(handler => {
      try {
        handler(payload);
      } catch (e) {
        // 🏆 防线：Handler 报错转化为系统错误事件，防止重构代码奔溃影响主流程
        console.error(`[ChatEventBus] Handler error for ${type}:`, e);
        this.emit('chat:error', {
          correlationId: payload.correlationId,
          sessionId: payload.sessionId,
          timestamp: Date.now(),
          code: 'HANDLER_ERROR',
          message: e instanceof Error ? e.message : String(e),
          moduleId: 'EventBus',
          stack: e instanceof Error ? e.stack : undefined
        } as any);
      }
    });
  }

  /**
   * 注册中间件
   */
  use(fn: (event: keyof ChatEvents, payload: any) => void) {
    this.middleware.push(fn);
  }

  /**
   * 生成全局唯一相关性 ID (回归标准 UUID 以保证 UI 兼容性)
   */
  createCorrelationId(): string {
    return uuidv4();
  }
}

// 导出单例，确保全系统共享同一套“神经系统”
export const chatEventBus = new ChatEventBus();

// 开发模式下开启事件追踪 (Debugability)
if (import.meta.env.DEV) {
  chatEventBus.use((event, payload) => {
    console.log(`[ChatEventBus] 🚀 ${event}`, {
      id: payload.correlationId,
      time: new Date(payload.timestamp).toLocaleTimeString(),
      data: payload
    });
  });
}
