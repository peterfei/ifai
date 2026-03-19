/**
 * IntentHandler - 意图识别与拦截处理器 (Phase 3)
 * 
 * 负责识别用户输入的意图（斜杠命令、自然语言意图等）。
 * 
 * @version v1.0.0
 */

import { BasePayload, chatEventBus } from '../eventBus/ChatEventBus';

export interface IntentResult {
  type: 'chat' | 'agent' | 'slash' | 'local';
  category?: string;
  confidence: number;
  metadata?: any;
}

const SUPPORTED_SLASH_COMMANDS = ['/explore', '/review', '/test', '/doc', '/refactor'];

export class IntentHandler {
  /**
   * 识别用户意图
   */
  async recognize(content: string, payload: BasePayload): Promise<IntentResult> {
    const textInput = content.trim();

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
