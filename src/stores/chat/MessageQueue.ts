/**
 * MessageQueue - 消息队列管理器
 *
 * 实现双队列优先级处理机制，确保消息按顺序逐个处理。
 * 支持普通消息和工作流消息的分离，工作流消息具有更高优先级。
 *
 * @version 1.0.0
 * @proposal P4 Multi-Agent Collaboration - Phase 1
 */

import { chatEventBus, type ChatEvents } from './eventBus/ChatEventBus';

/**
 * 队列中的消息结构
 */
export interface QueuedMessage {
  /** 唯一标识符 */
  id: string;
  /** 消息内容（字符串或多媒体数组） */
  content: string | any[];
  /** AI 提供商 ID */
  providerId: string;
  /** 模型名称 */
  model: string;
  /** 时间戳 */
  timestamp: number;
  /** 消息状态 */
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'aborted';
  /** 优先级 */
  priority: 'normal' | 'high';
  /** 关联 ID（用于追踪） */
  correlationId?: string;
  /** AbortController 用于取消请求 */
  abortController?: AbortController;
}

/**
 * 队列状态
 */
export interface QueueStatus {
  /** 普通消息队列状态 */
  normal: {
    /** 等待中的消息数 */
    pending: number;
    /** 处理中的消息数 */
    processing: number;
  };
  /** 工作流消息队列状态 */
  workflow: {
    /** 等待中的消息数 */
    pending: number;
    /** 处理中的消息数 */
    processing: number;
  };
  /** 是否正在处理 */
  isProcessing: boolean;
  /** 排队中消息的内容摘要 */
  pendingPreviews: string[];
}

/**
 * MessageQueue - 消息队列管理器
 *
 * 核心功能：
 * 1. 双队列优先级处理（普通消息 vs 工作流消息）
 * 2. FIFO（先进先出）顺序处理
 * 3. 单线程串行处理，避免并发冲突
 * 4. 事件驱动状态通知
 */
export class MessageQueue {
  /** 普通消息队列 */
  private normalQueue: QueuedMessage[] = [];
  /** 工作流消息队列（高优先级） */
  private workflowQueue: QueuedMessage[] = [];
  /** 是否正在处理消息 */
  private isProcessing: boolean = false;

  /**
   * 获取单例实例
   */
  private static instance: MessageQueue;

  static getInstance(): MessageQueue {
    if (!MessageQueue.instance) {
      MessageQueue.instance = new MessageQueue();
    }
    return MessageQueue.instance;
  }

  constructor() {
    // 为 E2E 测试暴露实例
    if (typeof window !== 'undefined') {
      (window as any).__messageQueue = this;
    }
  }

  /**
   * 入队消息
   *
   * @param message - 消息内容（不包含 id、timestamp、status）
   * @returns 消息 ID
   */
  async enqueue(message: Omit<QueuedMessage, 'id' | 'timestamp' | 'status'>): Promise<string> {
    const id = crypto.randomUUID();
    const abortController = new AbortController();

    const queuedMessage: QueuedMessage = {
      ...message,
      id,
      timestamp: Date.now(),
      status: 'pending',
      abortController,
    };

    // 根据优先级进入不同的队列
    if (message.priority === 'high') {
      this.workflowQueue.push(queuedMessage);
      console.log(`[MessageQueue] 📨 Enqueued workflow message: ${id}`);
    } else {
      this.normalQueue.push(queuedMessage);
      console.log(`[MessageQueue] 📨 Enqueued normal message: ${id}`);
    }

    // 🔥 FIX: 发送排队状态变更事件，让 UI 能立即显示新入队的消息
    this.emitStatusChanged();

    // 触发队列处理
    this.process();

    return id;
  }

  /**
   * 处理队列（单线程串行）
   *
   * 核心逻辑：
   * 1. 检查是否已有处理中的任务
   * 2. 优先从工作流队列取消息
   * 3. 如果工作流队列为空，从普通队列取消息
   * 4. 标记消息为 processing
   * 5. 调用 sendMessageOrchestrator
   * 6. 处理完成后移除消息，继续处理下一条
   */
  private async process() {
    // 如果已有任务在处理，直接返回
    if (this.isProcessing) {
      console.log('[MessageQueue] ⏸️ Already processing, skipping');
      return;
    }

    // 选择队列（优先工作流）
    const queue = this.workflowQueue.length > 0
      ? this.workflowQueue
      : this.normalQueue;

    // 找到第一条 pending 状态的消息
    const nextMessage = queue.find(m => m.status === 'pending');
    if (!nextMessage) {
      console.log('[MessageQueue] ✅ No pending messages');
      return;
    }

    this.isProcessing = true;
    nextMessage.status = 'processing';

    console.log(`[MessageQueue] 🚀 Processing message: ${nextMessage.id}`);

    // 发送处理开始事件
    this.emitEvent('message:processing', nextMessage);

    try {
      // 动态导入 SendMessageOrchestrator
      const { sendMessageOrchestrator } = await import('./sendMessage/SendMessageOrchestrator');

      console.log(`[MessageQueue] 📤 Calling sendMessageOrchestrator.send() for: ${nextMessage.id}`);

      // 调用 sendMessageOrchestrator.send()
      const result = await sendMessageOrchestrator.send(
        nextMessage.content,
        nextMessage.providerId,
        nextMessage.model,
        { signal: nextMessage.abortController?.signal }  // 传递 AbortSignal
      );

      console.log(`[MessageQueue] 📥 sendMessageOrchestrator.send() returned for: ${nextMessage.id}`, {
        hasResult: !!result,
        skipped: (result as any)?.skipped,
        hasContext: !!(result as any)?.context,
        hasCorrelationId: !!(result as any)?.correlationId,
      });

      // 🔥 检查是否需要调用 generateResponse
      // 如果 result.skipped 为真，说明是工作流消息，工作流会自己处理响应
      // 如果为假，说明是普通消息，需要调用 generateResponse 生成 AI 回复
      if (result && !(result as any).skipped) {
        console.log(`[MessageQueue] 🤖 Triggering generateResponse for: ${nextMessage.id}`);

        try {
          // 动态导入 useChatStore
          const { useChatStore } = await import('../useChatStore');
          const store = useChatStore.getState();

          if (typeof store.generateResponse === 'function') {
            // 🔥 FIX: 添加防御性检查，确保 result 有必要的属性
            const context = (result as any).context || [];
            const correlationId = (result as any).correlationId || nextMessage.id;

            await store.generateResponse(
              context,
              nextMessage.providerId,
              nextMessage.model,
              correlationId
            );
            console.log(`[MessageQueue] ✅ generateResponse completed for: ${nextMessage.id}`);
          } else {
            console.warn(`[MessageQueue] ⚠️ generateResponse not available in store`);
          }
        } catch (genErr) {
          console.error(`[MessageQueue] ❌ generateResponse failed for: ${nextMessage.id}`, genErr);
          // generateResponse 失败不算消息失败，消息已经成功发送
        }
      } else if (result && (result as any).skipped) {
        console.log(`[MessageQueue] ⚡ Workflow message skipped generateResponse: ${nextMessage.id}`);
      } else {
        // result 为 null/undefined 的情况
        console.warn(`[MessageQueue] ⚠️ No result returned from sendMessageOrchestrator for: ${nextMessage.id}`, result);
      }

      nextMessage.status = 'completed';
      console.log(`[MessageQueue] ✅ Message completed: ${nextMessage.id}`);

      // 发送完成事件
      this.emitEvent('message:completed', nextMessage);
    } catch (error: any) {
      // 检查是否是用户取消
      if (error.name === 'AbortError') {
        nextMessage.status = 'aborted';
        console.log(`[MessageQueue] ⏹️ Message aborted: ${nextMessage.id}`);

        // 发送中止事件
        this.emitEvent('message:aborted', nextMessage);
      } else {
        nextMessage.status = 'failed';
        console.error(`[MessageQueue] ❌ Message failed: ${nextMessage.id}`, error);
        console.error(`[MessageQueue] ❌ Error name: ${error.name}, message: ${error.message}`);
        console.error(`[MessageQueue] ❌ Error stack:`, error.stack);

        // 发送失败事件
        this.emitEvent('message:failed', { ...nextMessage, error });
      }
    } finally {
      // 从队列中移除已完成的消息
      const index = queue.indexOf(nextMessage);
      if (index > -1) {
        queue.splice(index, 1);
      }

      this.isProcessing = false;

      // 🔥 FIX: 发送队列状态变更事件，确保 UI 能正确更新
      // 因为 completed/aborted/failed 事件发出时 isProcessing 仍为 true
      // 需要在 finally 中额外发送一次状态变更
      this.emitStatusChanged();

      // 继续处理下一条消息
      const hasPending = this.workflowQueue.some(m => m.status === 'pending') ||
                        this.normalQueue.some(m => m.status === 'pending');

      if (hasPending) {
        // 使用 setTimeout 避免栈溢出
        setTimeout(() => this.process(), 10);
      } else {
        console.log('[MessageQueue] 🎉 All messages processed');
      }
    }
  }

  /**
   * 获取队列状态
   */
  getStatus(): QueueStatus {
    const extractPreview = (content: string | any[]): string => {
      if (typeof content === 'string') {
        return content.length > 20 ? content.slice(0, 20) + '...' : content;
      }
      const textPart = content.find((c: any) => c.type === 'text');
      if (textPart) {
        const t = (textPart as any).text || '';
        return t.length > 20 ? t.slice(0, 20) + '...' : t;
      }
      return '[多媒体]';
    };

    const pendingMessages = [
      ...this.normalQueue.filter(m => m.status === 'pending'),
      ...this.workflowQueue.filter(m => m.status === 'pending'),
    ];

    const status = {
      normal: {
        pending: this.normalQueue.filter(m => m.status === 'pending').length,
        processing: this.normalQueue.filter(m => m.status === 'processing').length,
      },
      workflow: {
        pending: this.workflowQueue.filter(m => m.status === 'pending').length,
        processing: this.workflowQueue.filter(m => m.status === 'processing').length,
      },
      isProcessing: this.isProcessing,
      pendingPreviews: pendingMessages.map(m => extractPreview(m.content)),
    };

    // 🔥 DEBUG: 打印 pending 消息信息
    if (pendingMessages.length > 0) {
      console.log('[MessageQueue] 📋 getStatus: pendingMessages =', pendingMessages.map(m => ({
        id: m.id.substring(0, 8),
        status: m.status,
        preview: extractPreview(m.content),
      })));
    }

    return status;
  }

  /**
   * 取消指定消息的处理
   *
   * @param messageId - 消息 ID
   * @returns 是否成功取消
   */
  abort(messageId: string): boolean {
    // 查找消息
    const message = this.normalQueue.find(m => m.id === messageId) ||
                   this.workflowQueue.find(m => m.id === messageId);

    if (!message) {
      console.warn(`[MessageQueue] ⚠️ Message not found for abort: ${messageId}`);
      return false;
    }

    // 如果消息已完成，无法取消
    if (message.status === 'completed' || message.status === 'failed') {
      console.warn(`[MessageQueue] ⚠️ Cannot abort message with status: ${message.status}`);
      return false;
    }

    // 调用 AbortController
    if (message.abortController) {
      message.abortController.abort();
      console.log(`[MessageQueue] ⏹️ Aborted message: ${messageId}`);
      return true;
    }

    return false;
  }

  /**
   * 取消当前正在处理的消息
   *
   * @returns 是否成功取消
   */
  abortCurrent(): boolean {
    // 查找正在处理的消息
    const processing = this.normalQueue.find(m => m.status === 'processing') ||
                      this.workflowQueue.find(m => m.status === 'processing');

    if (!processing) {
      console.warn('[MessageQueue] ⚠️ No processing message to abort');
      return false;
    }

    return this.abort(processing.id);
  }

  /**
   * 清空所有队列
   */
  clear() {
    console.log('[MessageQueue] 🗑️ Clearing all queues');

    // 取消所有活跃的 AbortController
    [...this.normalQueue, ...this.workflowQueue].forEach(msg => {
      if (msg.status === 'processing' || msg.status === 'pending') {
        if (msg.abortController) {
          msg.abortController.abort();
        }
      }
    });

    this.normalQueue = [];
    this.workflowQueue = [];
    this.isProcessing = false;
  }

  /**
   * 发送事件到 ChatEventBus
   */
  private emitEvent(eventType: string, data: any) {
    try {
      // 映射事件名称到 ChatEventBus 规范
      const eventMap: Record<string, keyof ChatEvents> = {
        'message:processing': 'chat:queue:processing',
        'message:completed': 'chat:queue:completed',
        'message:aborted': 'chat:queue:aborted',
        'message:failed': 'chat:queue:failed',
      };

      const busEventType = eventMap[eventType];
      if (!busEventType) {
        console.warn(`[MessageQueue] ⚠️ Unknown event type: ${eventType}`);
        return;
      }

      // 构建符合 BasePayload 的数据结构
      const queueStatus = this.getStatus();

      // 🔥 DEBUG: 打印 pendingPreviews 以确认是否正确生成
      if (queueStatus.pendingPreviews && queueStatus.pendingPreviews.length > 0) {
        console.log(`[MessageQueue] 📋 pendingPreviews:`, queueStatus.pendingPreviews);
      }

      chatEventBus.emit(busEventType, {
        correlationId: data.correlationId || chatEventBus.createCorrelationId(),
        sessionId: data.sessionId || 'default',
        timestamp: Date.now(),
        messageId: data.id,
        priority: data.priority,
        queueStatus,
        ...(data.error && { error: data.error }),
      } as any);
    } catch (error) {
      console.error(`[MessageQueue] ❌ Failed to emit event: ${eventType}`, error);
    }
  }

  /**
   * 发送队列状态变更事件
   * 用于在 finally 块中通知 UI 队列已空闲
   */
  private emitStatusChanged() {
    try {
      chatEventBus.emit('chat:queue:status-changed', {
        correlationId: chatEventBus.createCorrelationId(),
        sessionId: 'default',
        timestamp: Date.now(),
        queueStatus: this.getStatus(),
      } as any);
    } catch (error) {
      console.error('[MessageQueue] ❌ Failed to emit status-changed event', error);
    }
  }
}

/**
 * 导出单例实例
 */
export const messageQueue = MessageQueue.getInstance();

/**
 * 导出类型
 */
export type { QueueStatus };
