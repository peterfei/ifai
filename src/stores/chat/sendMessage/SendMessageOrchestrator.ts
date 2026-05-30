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
import { LogDataFlow } from '../decorators/LogDataFlow';
import { ValidateMultiModal } from '../decorators/ValidateMultiModal';

console.log('[SendMessageOrchestrator] 🔧🔧🔧 Module loaded!');

/**
 * 消息发送编排器（应用元编程装饰器）
 */
@LogDataFlow({ trackFields: ['multiModalContent', 'content', 'messageId'] })
export class SendMessageOrchestrator {
  private instanceId: string;

  constructor() {
    this.instanceId = `orchestrator-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log('[SendMessageOrchestrator] 🔧 Instance created:', this.instanceId);
  }

  /**
   * 执行消息发送流程
   */
  async send(content: string | any[], providerId: string, modelName: string, options: any = {}) {
    console.log('[SendMessageOrchestrator] 🔥🔥🔥 send() method called on instance:', this.instanceId);
    console.log('[SendMessageOrchestrator] 🔥 content:', typeof content === 'string' ? content.substring(0, 50) : 'Array');
    console.log('[SendMessageOrchestrator] 🔥 providerId:', providerId);
    console.log('[SendMessageOrchestrator] 🔥 modelName:', modelName);

    // 🏆 FIX: 优先使用 options.threadId（由 sendMessage 在 async gap 前捕获的 currentThreadId 传入），
    // 确保 sessionId 与消息创建时的线程一致，防止用户在 async gap 期间切换线程导致：
    //   1. sessionId 拿到切换后的 activeThreadId
    //   2. chat:message:sent 将消息路由到错误线程的 _messagesByThread
    //   3. StreamSession 的 threadId 与消息所在 bucket 不匹配 → 流数据无处追加 → 骨架屏卡死
    // 1. 初始化全链路 ID (保险丝 1: 关联 ID)
    const correlationId = chatEventBus.createCorrelationId();
    const sessionId = options.threadId || useThreadStore.getState().activeThreadId || 'default-thread';
    const timestamp = Date.now();

    // 🔥 FIX: 为用户消息创建单独的 ID，避免与助手消息 ID 冲突
    // 用户消息和助手消息必须有不同的 ID，否则持久化时会被覆盖
    const messageId = `user-${correlationId}`;

    const basePayload = { correlationId, messageId, sessionId, timestamp };

    console.log('[SendMessageOrchestrator] 🔥 basePayload:', { correlationId, messageId, sessionId });

    try {
      console.log('[SendMessageOrchestrator] 🔥 About to emit chat:message:sending event');
      console.log('[SendMessageOrchestrator] 🔍 chatEventBus:', chatEventBus);
      console.log('[SendMessageOrchestrator] 🔍 chatEventBus.emit:', typeof chatEventBus?.emit);
      console.log('[SendMessageOrchestrator] 🔍 chatEventBus.handlers:', (chatEventBus as any).handlers);

      // 发布开始事件 (触发 UI Loading 和 初始持久化)
      try {
        const sendingPayload = {
          ...basePayload,
          content: typeof content === 'string' ? content : '[Multimodal Content]',
          providerId,
          model: modelName
        };
        console.log('[SendMessageOrchestrator] 🔍 sendingPayload:', sendingPayload);

        console.log('[SendMessageOrchestrator] ⏰ Before emit, timestamp:', Date.now());
        chatEventBus.emit('chat:message:sending', sendingPayload);
        console.log('[SendMessageOrchestrator] ⏰ After emit, timestamp:', Date.now());
        console.log('[SendMessageOrchestrator] 🔥 Emitted chat:message:sending event successfully');
      } catch (emitError) {
        console.error('[SendMessageOrchestrator] ❌ Error emitting chat:message:sending:', emitError);
        throw emitError;
      }

      console.log('[SendMessageOrchestrator] 🔅 After emit block, moving to ensureActiveThread');

      // 2. 线程自愈逻辑 (确保有活跃 Thread)
      // 🏆 FIX: 优先使用 options.threadId（sendMessage 在 async gap 前捕获的 currentThreadId），
      // 防止用户在 async gap 期间切换线程导致 ensureActiveThread() 返回切换后的 activeThreadId。
      // 使用 capturedThreadId 确保消息构建和上下文选择在正确的线程上进行。
      const threadId = options.threadId || await this.ensureActiveThread();
      
      // 3. 意图识别 (Slash Commands / Natural Language)
      const textInput = typeof content === 'string' ? content :
        (Array.isArray(content) ? content.map(p => p.type === 'text' ? p.text : '').join(' ') : '');

      const intentResult = await intentHandler.recognize(textInput, basePayload);
      console.log(`[SendMessageOrchestrator] Intent detected: ${intentResult.type}`);
      console.log(`[SendMessageOrchestrator] shouldSkipChat: ${intentResult.shouldSkipChat}`);
      console.log(`[SendMessageOrchestrator] Full intentResult:`, {
        type: intentResult.type,
        category: intentResult.category,
        confidence: intentResult.confidence,
        shouldSkipChat: intentResult.shouldSkipChat,
        workflowId: intentResult.metadata?.workflowId
      });

      // P4: 如果是工作流意图且标记为跳过聊天，直接返回
      if (intentResult.shouldSkipChat) {
        console.log('[SendMessageOrchestrator] ⚡🔥 Workflow intent detected, shouldSkipChat = TRUE');
        console.log('[SendMessageOrchestrator] 🚫 Skipping AI chat flow, only creating messages');

        // 先发布消息发送事件（创建用户消息和空的助手消息）
        // 🔥 添加 isWorkflowMessage 标记，防止 StoreMapper 触发 AI 回复
        console.log('[SendMessageOrchestrator] 🔍 EventBus instance:', (chatEventBus as any).constructor.name);
        console.log('[SendMessageOrchestrator] 🔍 EventBus handlers before emit:', (chatEventBus as any).handlers?.get('chat:message:sent')?.length || 0);
        chatEventBus.emit('chat:message:sent', {
          ...basePayload,
          content: textInput,
          messageId: messageId,  // 🔥 FIX: 使用独立的 messageId
          workflowId: intentResult.metadata?.workflowId,
          workflowType: intentResult.metadata?.workflowType,  // 🔥 传递 workflowType 给 StoreMapper
          isWorkflowMessage: true,  // 🔥 标记为工作流消息
        });
        console.log('[SendMessageOrchestrator] 📤 Emitted chat:message:sent with isWorkflowMessage=true');

        // 等待一小段时间确保消息被创建
        await new Promise(resolve => setTimeout(resolve, 100));

        // 重新触发 workflow:started 事件（带 nodes，用于 StoreMapper 初始化 PhaseData）
        if (intentResult.metadata?.workflowId) {
          const wfType = intentResult.metadata.workflowType;
          const plannedNodes = wfType === 'exploration'
            ? [{ id: 'explore', label: '探索项目', agent_type: 'explore' }]
            : wfType === 'test'
            ? [{ id: 'test', label: '生成测试', agent_type: 'test' }]
            : wfType === 'doc'
            ? [{ id: 'doc', label: '生成文档', agent_type: 'doc' }]
            : wfType === 'refactor'
            ? [{ id: 'refactor', label: '重构代码', agent_type: 'refactor' }]
            : wfType === 'refactor_test'
            ? [
                { id: 'refactor', label: '生成代码', agent_type: 'refactor' },
                { id: 'test', label: '生成测试', agent_type: 'test' },
              ]
            : wfType === 'proposal'
            ? [{ id: 'proposal', label: '生成提案', agent_type: 'proposal' }]
            : wfType === 'task'
            ? [{ id: 'task', label: '任务拆解', agent_type: 'task' }]
            : [{ id: 'task', label: '执行任务', agent_type: 'general_purpose' }];

          console.log('[SendMessageOrchestrator] 📤 Re-emitting workflow:started with', plannedNodes.length, 'nodes');
          chatEventBus.emit('workflow:started', {
            workflowId: intentResult.metadata.workflowId,
            workflowType: wfType,
            targetPath: intentResult.metadata?.targetPath,
            timestamp: Date.now(),
            nodes: plannedNodes,
            ...basePayload,
          });
        }

        // 🔥 FIX: 不要立即发送 workflow:response 事件
        // 只在工作流完成时才发送响应，避免显示"正在启动"消息
        // 参考 claw-code 的做法：执行期间只显示 Monitor，完成后显示总结
        console.log('[SendMessageOrchestrator] 🔥 Skipping immediate workflow:response (will send on completion)');
        console.log('[SendMessageOrchestrator] 📝 Workflow will send response when completed');

        // 返回特殊结果，表示工作流已处理
        return {
          success: true,
          skipped: true,
          workflowId: intentResult.metadata?.workflowId,
          // 不包含 response，让工作流完成时再发送
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

      // 🔴🟢 高保真日志点1：MessageBuilder → EventBus
      const multiModalContent = (builtMessage as any).multiModalContent;
      console.log('[SendMessageOrchestrator] 🔴🟢 POINT-1: Emitting chat:message:sent event');
      console.log('[SendMessageOrchestrator] ========================================');
      console.log('[SendMessageOrchestrator] 📤 builtMessage details:', {
          messageId: builtMessage.id,
          role: builtMessage.role,
          contentLength: builtMessage.content?.length || 0,
          contentPreview: builtMessage.content?.substring(0, 100),
          hasMultiModalContent: !!multiModalContent,
          multiModalContentType: typeof multiModalContent,
          multiModalContentConstructor: multiModalContent?.constructor?.name,
          isArray: Array.isArray(multiModalContent),
          itemCount: Array.isArray(multiModalContent) ? multiModalContent.length : 0,
          // 🔥 详细记录 multiModalContent 结构
          multiModalContentStructure: Array.isArray(multiModalContent)
              ? multiModalContent.map((part: any, idx: number) => ({
                    index: idx,
                    type: part.type,
                    hasImageUrl: !!part.image_url,
                    hasText: !!part.text,
                    imageUrlPreview: part.image_url?.url?.substring(0, 50) + '...',
                    textPreview: part.text?.substring(0, 50) + '...',
                }))
              : null,
          // 🔥 JSON 序列化测试
          jsonSerialized: JSON.stringify(multiModalContent),
      });
      console.log('[SendMessageOrchestrator] ========================================');

      // 6. 最终分发 (保险丝 2: 事务持久化触发点)
      chatEventBus.emit('chat:message:sent', {
        ...basePayload,
        messageId: builtMessage.id,
        content: builtMessage.content,
        // ✅ 元编程：自动包含 multiModalContent
        multiModalContent: (builtMessage as any).multiModalContent
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
    console.log('[SendMessageOrchestrator] 🔧 ensureActiveThread() called');
    const threadStore = useThreadStore.getState();
    console.log('[SendMessageOrchestrator] 🔧 threadStore:', threadStore);
    let activeId = threadStore.activeThreadId;
    console.log('[SendMessageOrchestrator] 🔧 activeThreadId before:', activeId);
    if (!activeId) {
      activeId = threadStore.createThread();
      console.log(`[SendMessageOrchestrator] Auto-created thread: ${activeId}`);
    }
    console.log('[SendMessageOrchestrator] 🔧 activeThreadId after:', activeId);
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
