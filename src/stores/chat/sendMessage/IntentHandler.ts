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
const SUPPORTED_SLASH_COMMANDS: string[] = [];

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

    // 🔥 问题3修复：检测重复的探索命令
    // 如果是 /explore 命令，检查最近是否执行过探索
    if (workflowIntent.isWorkflow && workflowIntent.workflowType === 'exploration') {
      const recentExplore = this.checkRecentExploreCommand();
      if (recentExplore) {
        console.log('[IntentHandler] 🔁 Detected repeated /explore command, using summary mode');

        // 修改响应为总结模式
        workflowIntent.response = `📊 **查看上次的探索结果**

正在为您加载之前的探索分析...

目标路径: \`${recentExplore.targetPath || '.'}\`
上次探索时间: ${new Date(recentExplore.timestamp).toLocaleString()}

工作流已开始，您可以在"执行监控"标签页查看详细进度。`;
      }
    }

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

          // 🔥 记录探索命令（用于重复检测）
          if (workflowIntent.workflowType === 'exploration') {
            this.recordExploreCommand(workflowIntent.targetPath);
          }
        } catch (error) {
          console.error('[IntentHandler] ❌ Workflow execution failed:', error);

          // 发布工作流错误事件
          chatEventBus.emit('workflow:error', {
            ...payload,
            error: error instanceof Error ? error.message : '未知错误',
            timestamp: Date.now(),
          });

          // 🔥 FIX: 即使执行失败也不回退到 chat 流程，
          // 否则 Orchestrator 会发送消息到 AI（→ Router → LocalModel 错误处理）
          // 返回 shouldSkipChat: true 跳过 AI 聊天流程
          return {
            type: 'workflow',
            category: workflowIntent.workflowType,
            confidence: workflowIntent.confidence,
            shouldSkipChat: true,
            metadata: {
              workflowType: workflowIntent.workflowType,
              targetPath: workflowIntent.targetPath,
              error: error instanceof Error ? error.message : '未知错误',
              response: workflowIntent.response || undefined,
            },
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

    // 🔥 1.5 自然语言工作流意图补充识别（比率匹配法）
    // 当 recognizeWorkflowIntent 未匹配时，使用比率匹配法再次检测
    // checkKeywords 使用逐模式匹配，recognizeNaturalLanguage 使用全关键词比率计算
    if (!textInput.startsWith('/')) {
      const nlIntent = workflowIntentHandler.recognizeNaturalLanguage(textInput);
      if (nlIntent.isWorkflow && nlIntent.confidence >= 0.65) {
        console.log('[IntentHandler] 🌐 Natural language workflow detected (ratio):', nlIntent.workflowType);

        let workflowId: string | undefined;
        if (nlIntent.workflowType) {
          try {
            workflowId = await workflowIntentHandler.executeWorkflow(
              nlIntent.workflowType,
              nlIntent.targetPath || '.',
              payload
            );
          } catch (error) {
            console.error('[IntentHandler] ❌ Natural language workflow execution failed:', error);
            chatEventBus.emit('workflow:error', {
              ...payload,
              error: error instanceof Error ? error.message : '未知错误',
              timestamp: Date.now(),
            });
            // 🔥 FIX: 不回退到 chat 流程，避免消息发送到 AI 模型
            return {
              type: 'workflow',
              category: nlIntent.workflowType,
              confidence: nlIntent.confidence,
              shouldSkipChat: true,
              metadata: {
                workflowType: nlIntent.workflowType,
                targetPath: nlIntent.targetPath,
                error: error instanceof Error ? error.message : '未知错误',
                response: nlIntent.response || undefined,
              },
            };
          }
        }

        const result: IntentResult = {
          type: 'workflow',
          category: nlIntent.workflowType,
          confidence: nlIntent.confidence,
          shouldSkipChat: true,
          metadata: {
            workflowType: nlIntent.workflowType,
            targetPath: nlIntent.targetPath,
            response: nlIntent.response,
            workflowId,
          }
        };

        this.emitIntent(result, payload);
        return result;
      }
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
   * 🔥 检查最近的探索命令（用于问题3：重复探索显示总结）
   * 检查过去 5 分钟内是否执行过 /explore 命令
   */
  private checkRecentExploreCommand(): { targetPath?: string; timestamp: number } | null {
    const RECENT_EXPLORE_KEY = 'ifai_recent_explore';
    const EXPLORE_TIMEOUT = 5 * 60 * 1000; // 5 分钟

    try {
      const stored = localStorage.getItem(RECENT_EXPLORE_KEY);
      if (!stored) return null;

      const recentExplore = JSON.parse(stored);
      const now = Date.now();

      // 检查是否在超时时间内
      if (now - recentExplore.timestamp < EXPLORE_TIMEOUT) {
        return recentExplore;
      }

      // 超时，清除记录
      localStorage.removeItem(RECENT_EXPLORE_KEY);
      return null;
    } catch (e) {
      console.warn('[IntentHandler] Failed to check recent explore command:', e);
      return null;
    }
  }

  /**
   * 🔥 记录探索命令（在执行成功后调用）
   */
  private recordExploreCommand(targetPath?: string): void {
    const RECENT_EXPLORE_KEY = 'ifai_recent_explore';

    try {
      const record = {
        timestamp: Date.now(),
        targetPath: targetPath || '.'
      };

      localStorage.setItem(RECENT_EXPLORE_KEY, JSON.stringify(record));
      console.log('[IntentHandler] 📝 Recorded explore command:', record);
    } catch (e) {
      console.warn('[IntentHandler] Failed to record explore command:', e);
    }
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
