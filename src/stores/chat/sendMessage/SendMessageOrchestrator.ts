/**
 * SendMessageOrchestrator - 消息发送编排器 (Phase 3)
 * 
 * 负责协调消息发送的全生命周期：
 * 意图识别 -> 消息构建 -> 引用注入 -> 上下文选择 -> 事件分发
 * 
 * @version v1.0.0
 */

import { chatEventBus } from '../eventBus/ChatEventBus';
import { useThreadStore } from '../../threadStore';
import { useSettingsStore } from '../../settingsStore';
import { useLayoutStore } from '../../layoutStore';
import { getThreadMessages } from '../../useChatStore';

export class SendMessageOrchestrator {
  /**
   * 执行消息发送流程
   */
  async send(content: string | any[], providerId: string, modelName: string, options: any = {}) {
    // 1. 初始化全链路 ID (保险丝 1: 关联 ID)
    const correlationId = chatEventBus.createCorrelationId();
    const sessionId = useThreadStore.getState().activeThreadId || 'default-thread';
    const timestamp = Date.now();

    const basePayload = { correlationId, sessionId, timestamp };

    try {
      // 发布开始事件 (触发 UI Loading 和 初始持久化)
      chatEventBus.emit('chat:message:sending', {
        ...basePayload,
        content: typeof content === 'string' ? content : '[Multimodal Content]',
        providerId,
        model: modelName
      });

      // 2. 线程自愈逻辑 (确保有活跃 Thread)
      const threadId = await this.ensureActiveThread();
      
      // 3. 意图识别 (Slash Commands / PIVO Intent)
      // TODO: 迁移至 IntentHandler
      const isIntercepted = await this.handleIntent(content, basePayload);
      if (isIntercepted) return;

      // 4. 消息构建与引用注入 (References / Multimodal Cache)
      // TODO: 迁移至 MessageBuilder
      const enrichedContent = await this.buildEnrichedMessage(content, basePayload);

      // 5. 上下文选择 (Sliding Window / Token Limit)
      // TODO: 迁移至 ContextSelector
      const context = await this.selectContext(threadId, basePayload);

      // 6. 最终分发 (保险丝 2: 事务持久化触发点)
      // 这里的 chat:message:sent 会被 PersistenceManager 监听到并即刻落盘
      chatEventBus.emit('chat:message:sent', {
        ...basePayload,
        messageId: `msg-${correlationId}`, // 临时 ID，后续由 Builder 生成
        content: enrichedContent
      });

      return { correlationId, sessionId };
    } catch (error) {
      console.error('[SendMessageOrchestrator] ❌ Pipeline failure:', error);
      chatEventBus.emit('chat:error', {
        ...basePayload,
        code: 'SEND_FAILED',
        message: error instanceof Error ? error.message : String(error),
        moduleId: 'SendMessage'
      });
      throw error;
    }
  }

  private async ensureActiveThread(): Promise<string> {
    const threadStore = useThreadStore.getState();
    let activeId = threadStore.activeThreadId;
    if (!activeId) {
      activeId = threadStore.createThread();
      console.log(`[SendMessageOrchestrator] Auto-created thread: ${activeId}`);
    }
    return activeId;
  }

  // 临时占位，后续将拆分到独立文件
  private async handleIntent(content: string | any[], payload: any): Promise<boolean> {
     // 迁移逻辑...
     return false; 
  }

  private async buildEnrichedMessage(content: string | any[], payload: any): Promise<string> {
     // 迁移逻辑...
     return typeof content === 'string' ? content : JSON.stringify(content);
  }

  private async selectContext(threadId: string, payload: any): Promise<any[]> {
     return getThreadMessages(threadId);
  }
}

export const sendMessageOrchestrator = new SendMessageOrchestrator();
