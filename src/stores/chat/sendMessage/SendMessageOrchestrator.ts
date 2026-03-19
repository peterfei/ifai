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
import { getThreadMessages } from '../../useChatStore';
import { intentHandler } from './IntentHandler';
import { messageBuilder } from './MessageBuilder';
import { contextSelector } from './ContextSelector';

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
      
      // 3. 意图识别 (Slash Commands / Natural Language)
      const textInput = typeof content === 'string' ? content : 
        (Array.isArray(content) ? content.map(p => p.type === 'text' ? p.text : '').join(' ') : '');
      
      const intentResult = await intentHandler.recognize(textInput, basePayload);
      console.log(`[SendMessageOrchestrator] Intent detected: ${intentResult.type}`);

      // 4. 消息构建与引用注入 (References / Multimodal Cache)
      const builtMessage = await messageBuilder.build(content, threadId);
      
      // 5. 上下文选择 (Sliding Window / Token Limit)
      const settings = useSettingsStore.getState();
      let allMessages = getThreadMessages(threadId);
      
      // 🏆 修正：将当前刚构建的消息合入历史记录，确保 AI 能收到它
      const messageToSelect = [...allMessages, builtMessage];
      
      // 如果没有历史消息，注入初始系统消息
      if (allMessages.length === 0) {
        const systemMsg: any = {
          id: `sys-${correlationId}`,
          role: 'system',
          content: settings.customSystemPrompt || 'You are IfAI, a helpful AI assistant.',
          timestamp: Date.now() - 1 // 确保在用户消息之前
        };
        messageToSelect.unshift(systemMsg);
        console.log('[SendMessageOrchestrator] 🧠 Injected default system prompt for new session');
      }
      
      const context = await contextSelector.select(
        messageToSelect as any,
        settings.maxContextMessages || 20,
        modelName,
        settings.maxContextTokens || 4000
      );
      
      console.log(`[SendMessageOrchestrator] Context selected: ${context.length} messages (including current)`);

      // 6. 最终分发 (保险丝 2: 事务持久化触发点)
      chatEventBus.emit('chat:message:sent', {
        ...basePayload,
        messageId: builtMessage.id, 
        content: builtMessage.content
      });

      return { correlationId, sessionId, messageId: builtMessage.id, context };
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
