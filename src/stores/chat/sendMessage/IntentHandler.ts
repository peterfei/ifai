/**
 * IntentHandler - 意图识别与拦截处理器 (Phase 3)
 * 
 * 负责识别用户输入的意图（斜杠命令、自然语言意图等）。
 * 
 * @version v1.0.0
 */

import { BasePayload, chatEventBus } from '../eventBus/ChatEventBus';
import { workflowIntentHandler } from './WorkflowIntentHandler';

export interface IntentResult {
  type: 'chat' | 'agent' | 'slash' | 'local' | 'workflow';
  category?: string;
  confidence: number;
  metadata?: any;
  shouldSkipChat?: boolean; // P4: 是否跳过后续聊天流程
}

// 🔥 FIX: 移除 /explore 和 /review，因为它们已被工作流系统处理
// 这些命令现在通过 WorkflowIntentHandler 处理，返回 type: 'workflow'
const SUPPORTED_SLASH_COMMANDS = ['/test', '/doc', '/refactor'];

// P4: 工作流斜杠命令
const WORKFLOW_SLASH_COMMANDS = ['/workflow', '/wf', '/code-review', '/exploration', '/quality-check'];

export class IntentHandler {
  /**
   * 识别用户意图
   */
  async recognize(content: string, payload: BasePayload): Promise<IntentResult> {
    const textInput = content.trim();
    console.log('[IntentHandler] 🔍 Original content:', JSON.stringify(content));
    console.log('[IntentHandler] 🔍 Trimmed textInput:', JSON.stringify(textInput));

    // P4: 0. 工作流命令优先检测（自然语言 + 斜杠）
    const workflowIntent = workflowIntentHandler.recognizeWorkflowIntent(textInput);
    console.log('[IntentHandler] Workflow intent check:', {
      input: textInput,
      isWorkflow: workflowIntent.isWorkflow,
      confidence: workflowIntent.confidence,
      workflowType: workflowIntent.workflowType,
    });

    if (workflowIntent.isWorkflow && workflowIntent.confidence >= 0.6) {
      console.log('[IntentHandler] ✅ Workflow intent detected, executing...');

      // 自动执行工作流（同步执行）
      let workflowId: string | undefined;
      if (workflowIntent.workflowType) {
        try {
          console.log('[IntentHandler] 🚀 Executing workflow:', workflowIntent.workflowType);

          workflowId = await workflowIntentHandler.executeWorkflow(
            workflowIntent.workflowType,
            workflowIntent.targetPath || '.',  // 🔥 修复：默认使用当前目录
            payload
          );

          console.log('[IntentHandler] ✅ Workflow executed successfully:', workflowId);
        } catch (error) {
          console.error('[IntentHandler] ❌ Workflow execution failed:', error);

          // 发布工作流错误事件
          chatEventBus.emit('workflow:error', {
            ...payload,
            error: error instanceof Error ? error.message : '未知错误',
            timestamp: Date.now(),
          });

          // 即使失败也返回结果，让流程继续
          return {
            type: 'chat',
            confidence: 0,
          };
        }
      }

      const result: IntentResult = {
        type: 'workflow',
        category: workflowIntent.workflowType,
        confidence: workflowIntent.confidence,
        shouldSkipChat: true, // P4: 标记为跳过后续聊天流程
        metadata: {
          workflowType: workflowIntent.workflowType,
          targetPath: workflowIntent.targetPath,
          response: workflowIntent.response,
          workflowId,
        }
      };

      console.log('[IntentHandler] 📤 Workflow result prepared:', {
        response: result.metadata?.response?.substring(0, 100),
        workflowId,
        hasResponse: !!result.metadata?.response,
      });

      this.emitIntent(result, payload);

      return result;
    }

    // 1. 斜杠命令拦截 (优先)
    if (textInput.startsWith('/')) {
      const parts = textInput.split(' ');
      const command = parts[0].toLowerCase();

      if (SUPPORTED_SLASH_COMMANDS.includes(command)) {
        const result: IntentResult = {
          type: 'slash',
          category: command.slice(1),
          confidence: 1.0,
          metadata: { command, args: parts.slice(1) }
        };

        this.emitIntent(result, payload);
        return result;
      }
    }

    // 2. 多模态检查：如果包含图片，强制路由到 Chat (云端 Vision)
    // 注意：Orchestrator 会传入 content 的类型，此处假设已处理为文本或通过 metadata 传入
    
    // 3. 自然语言意图识别 (通过注入的全局函数)
    if ((window as any).recognizeIntent) {
      try {
        const rawIntent = (window as any).recognizeIntent(textInput);
        const confidenceThreshold = (window as any).VITE_TEST_ENV === 'e2e' ? 0.3 : 0.7;

        if (rawIntent && rawIntent.confidence >= confidenceThreshold) {
           const result: IntentResult = {
             type: 'agent',
             category: rawIntent.category,
             confidence: rawIntent.confidence,
             metadata: rawIntent
           };
           this.emitIntent(result, payload);
           return result;
        }
      } catch (e) {
        console.warn('[IntentHandler] Natural language recognition failed:', e);
      }
    }

    // 4. 默认：普通聊天
    const defaultResult: IntentResult = { type: 'chat', confidence: 1.0 };
    this.emitIntent(defaultResult, payload);
    return defaultResult;
  }

  /**
   * 发布意图识别事件
   */
  private emitIntent(result: IntentResult, payload: BasePayload) {
    chatEventBus.emit('chat:intent:detected', {
      ...payload,
      intent: { type: result.type, confidence: result.confidence },
      metadata: result.metadata
    });
  }
}

export const intentHandler = new IntentHandler();
