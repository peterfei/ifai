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

    // 🔥 FIX: 为用户消息创建单独的 ID，避免与助手消息 ID 冲突
    // 用户消息和助手消息必须有不同的 ID，否则持久化时会被覆盖
    const messageId = `user-${correlationId}`;

    const basePayload = { correlationId, messageId, sessionId, timestamp };

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

      // P4: 如果是工作流意图且标记为跳过聊天，直接返回
      if (intentResult.shouldSkipChat) {
        console.log('[SendMessageOrchestrator] ⚡ Workflow intent detected, skipping chat flow');

        // 先发布消息发送事件（创建用户消息和空的助手消息）
        chatEventBus.emit('chat:message:sent', {
          ...basePayload,
          content: textInput,
          messageId: messageId,  // 🔥 FIX: 使用独立的 messageId
          workflowId: intentResult.metadata?.workflowId,
        });

        // 等待一小段时间确保消息被创建
        await new Promise(resolve => setTimeout(resolve, 100));

        // 然后发布工作流响应事件（更新助手消息的内容）
        console.log('[SendMessageOrchestrator] 📤 Emitting workflow:response event after message creation');
        console.log('[SendMessageOrchestrator] 📝 Response content:', intentResult.metadata?.response?.substring(0, 100));
        chatEventBus.emit('workflow:response', {
          ...basePayload,
          workflowId: intentResult.metadata?.workflowId,
          workflowType: intentResult.metadata?.workflowType,
          response: intentResult.metadata?.response,
          timestamp: Date.now(),
        });

        // 返回特殊结果，表示工作流已处理
        return {
          success: true,
          skipped: true,
          workflowId: intentResult.metadata?.workflowId,
          response: intentResult.metadata?.response,
        };
      }

      // 4. 消息构建与引用注入 (References / Multimodal Cache)
      const builtMessage = await messageBuilder.build(content, threadId);
      
      // 5. 上下文选择 (Sliding Window / Token Limit)
      const settings = useSettingsStore.getState();
      let allMessages = getThreadMessages(threadId);
      
      // 🏆 修正：将当前刚构建的消息合入历史记录，确保 AI 能收到它
      const messageToSelect = [...allMessages, builtMessage];
      
      // 如果没有历史消息，注入初始系统消息
      if (allMessages.length === 0) {
        // 🔥 FIX: 根据供应商使用不同的默认 system prompt
        // 智谱需要更详细的 prompt 才能正确调用工具（特别是 TodoWrite）
        const getDefaultSystemPrompt = (providerId: string): string => {
          const id = providerId.toLowerCase();
          if (id.includes('zhipu') || id.includes('glm')) {
            return `你是 IfAI，一个专业的 AI 代码助手，基于智谱 GLM 模型。

## 你的身份
- 名字：IfAI
- 角色：AI 代码助手和开发伙伴
- 创建者：IfAI 开源社区
- 特点：专业、友好、技术精湛

## 你的能力
- 代码编写、分析和优化
- 多语言支持（Rust, Python, JavaScript, Go 等）
- 问题诊断和调试
- 架构设计和最佳实践建议
- 工具调用（文件操作、任务管理等）

## 回答风格
- 简洁专业，直击要点
- 代码示例完整可用
- 中文回答为主，技术术语保留英文
- 主动提供相关建议和最佳实践

## 注意事项
- 你是 IfAI，不是智谱 AI
- 保持友好和专业的语气
- 不确定时诚实承认
- 优先给出实用建议`;
          } else if (id.includes('deepseek')) {
            return `你是 IfAI，一个专业的 AI 代码助手，基于 DeepSeek 模型。

## 你的身份
- 名字：IfAI
- 角色：AI 代码助手和开发伙伴
- 特点：专业、友好、技术精湛

## 你的能力
- 代码编写、分析和优化
- 多语言支持
- 问题诊断和调试
- 架构设计和最佳实践建议
- 工具调用（文件操作、任务管理等）

## 回答风格
- 简洁专业，直击要点
- 中文回答为主
- 主动提供相关建议`;
          } else if (id.includes('openai') || id.includes('gpt')) {
            return `你是 IfAI，一个专业的 AI 代码助手，由 OpenAI GPT 模型驱动。
专业、友好、技术精湛。擅长代码编写、分析和优化，以及工具调用。`;
          } else if (id.includes('anthropic') || id.includes('claude')) {
            return `你是 IfAI，一个专业的 AI 代码助手，由 Anthropic Claude 模型驱动。
专业、友好、技术精湛。擅长代码编写、分析和优化，以及工具调用。`;
          }
          return 'You are IfAI, a helpful AI assistant.';
        };

        const systemMsg: any = {
          id: `sys-${correlationId}`,
          role: 'system',
          content: (settings as any).customSystemPrompt || getDefaultSystemPrompt(providerId),
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
