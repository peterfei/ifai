/**
 * MessageQueue - 消息队列管理器
 *
 * 实现双队列优先级处理机制，确保消息按顺序逐个处理。
 * 支持普通消息和工作流消息的分离，工作流消息具有更高优先级。
 *
 * @version 1.0.0
 * @proposal P4 Multi-Agent Collaboration - Phase 1
 */

import { chatEventBus } from './eventBus/ChatEventBus';

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

      // 调用 sendMessageOrchestrator.send()
      const result = await sendMessageOrchestrator.send(
        nextMessage.content,
        nextMessage.providerId,
        nextMessage.model,
        { signal: nextMessage.abortController?.signal }  // 传递 AbortSignal
      );

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
    return {
      normal: {
        pending: this.normalQueue.filter(m => m.status === 'pending').length,
        processing: this.normalQueue.filter(m => m.status === 'processing').length,
      },
      workflow: {
        pending: this.workflowQueue.filter(m => m.status === 'pending').length,
        processing: this.workflowQueue.filter(m => m.status === 'processing').length,
      },
      isProcessing: this.isProcessing,
    };
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
      chatEventBus.emit(eventType, {
        ...data,
        queueStatus: this.getStatus(),
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`[MessageQueue] ❌ Failed to emit event: ${eventType}`, error);
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
