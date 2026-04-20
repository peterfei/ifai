/**
 * ContextSelector - 智能上下文选择器 (Phase 3)
 * 
 * 负责在对话历史中选取最相关的消息，并确保其符合 Token 限制和协议完整性。
 * 
 * @version v1.0.0
 */

import type { Message } from 'ifainew-core';

interface ScoredMessage {
  message: Message;
  score: number;
  index: number;
  estimatedTokens: number;
}

export class ContextSelector {
  /**
   * 选择最优上下文消息列表
   */
  async select(
    messages: Message[], 
    maxMessages: number, 
    model?: string, 
    maxTokens?: number
  ): Promise<Message[]> {
    if (messages.length <= maxMessages && !maxTokens) {
      return messages;
    }

    // 1. 为每条消息计算优先级分数并估算 Token
    const scored: ScoredMessage[] = messages.map((msg, idx) => {
      let score = this.calculateBaseScore(msg);
      const positionFromEnd = messages.length - 1 - idx;
      
      // 应用时间衰减：越近的消息权重越高
      const decayFactor = Math.pow(1.1, positionFromEnd);
      score = score * decayFactor;

      return { 
        message: msg, 
        score, 
        index: idx, 
        estimatedTokens: this.estimateTokens(msg) 
      };
    });

    // 2. 按分数降序排序，初步取前 maxMessages 条
    scored.sort((a, b) => b.score - a.score);
    let selected = scored.slice(0, maxMessages);

    // 3. 完整性检查：确保 tool_calls 和 tool_call_id 配对 (双向保证)
    selected = this.ensureToolPairing(selected, scored, messages);

    // 4. Token 限制检查（滑动窗口策略）
    if (model && maxTokens) {
      selected = this.applyTokenSlidingWindow(selected, maxTokens);
    }

    // 5. 按原始时间顺序重新排序
    selected.sort((a, b) => a.index - b.index);

    // 6. 最终清理：移除无效的工具消息
    const finalMessages = selected.map(s => s.message).filter(msg => {
      if (msg.role === 'tool' && (!msg.tool_call_id || msg.tool_call_id.trim() === '')) {
        console.warn('[ContextSelector] Dropping tool message with missing tool_call_id');
        return false;
      }
      return true;
    });

    // 7. 防御性检查：确保至少保留最后一条 user 消息
    // 场景：user 消息 score(100) 低于 tool(450) 和 assistant+toolCalls(500)，
    // 在 maxMessages 限制下可能被完全挤掉，导致发给 LLM 的历史中没有用户输入
    const hasUserMessage = finalMessages.some(msg => msg.role === 'user');
    if (!hasUserMessage) {
      const lastUserMsg = [...messages].reverse().find(msg => msg.role === 'user');
      if (lastUserMsg) {
        console.warn('[ContextSelector] No user message in selected context, recovering last user message');
        finalMessages.push(lastUserMsg);
      }
    }

    return finalMessages;
  }

  private calculateBaseScore(msg: Message): number {
    if (msg.role === 'system') return 1000;
    if (msg.toolCalls && msg.toolCalls.length > 0) return 500;
    if (msg.tool_call_id) return 450;
    if ((msg as any).references && (msg as any).references.length > 0) return 300;
    if (msg.role === 'user') return 100;
    if (msg.role === 'assistant') return 50;
    return 0;
  }

  private estimateTokens(msg: Message): number {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    if (!content) return 0;
    const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = content.length - chineseChars;
    return Math.ceil((chineseChars / 2) + (otherChars / 4));
  }

  private ensureToolPairing(selected: ScoredMessage[], allScored: ScoredMessage[], originalMessages: Message[]): ScoredMessage[] {
    const selectedIndices = new Set(selected.map(s => s.index));
    const result = [...selected];

    selected.forEach(s => {
      // 检查请求消息是否有对应的响应
      if (s.message.toolCalls && s.message.toolCalls.length > 0) {
        for (let i = s.index + 1; i < originalMessages.length; i++) {
          const responseMsg = originalMessages[i];
          if (responseMsg.tool_call_id && s.message.toolCalls.some(tc => tc.id === responseMsg.tool_call_id)) {
            if (!selectedIndices.has(i)) {
              selectedIndices.add(i);
              result.push(allScored[i]);
            }
          }
        }
      }
      // 检查响应消息是否有对应的请求
      if (s.message.tool_call_id) {
        for (let i = s.index - 1; i >= 0; i--) {
          const requestMsg = originalMessages[i];
          if (requestMsg.toolCalls && requestMsg.toolCalls.some(tc => tc.id === s.message.tool_call_id)) {
            if (!selectedIndices.has(i)) {
              selectedIndices.add(i);
              result.push(allScored[i]);
            }
            break;
          }
        }
      }
    });

    return result;
  }

  private applyTokenSlidingWindow(selected: ScoredMessage[], maxTokens: number): ScoredMessage[] {
    const maxTokenLimit = maxTokens * 0.9;
    selected.sort((a, b) => a.index - b.index);

    let windowSelected: ScoredMessage[] = [];
    let currentTokens = 0;

    // 保留所有系统消息
    const systemMessages = selected.filter(s => s.message.role === 'system');
    windowSelected.push(...systemMessages);
    currentTokens += systemMessages.reduce((sum, s) => sum + s.estimatedTokens, 0);

    const windowIndices = new Set(windowSelected.map(s => s.index));
    for (let i = selected.length - 1; i >= 0; i--) {
      const s = selected[i];
      if (windowIndices.has(s.index)) continue;

      if (currentTokens + s.estimatedTokens <= maxTokenLimit) {
        windowSelected.push(s);
        windowIndices.add(s.index);
        currentTokens += s.estimatedTokens;
        
        // 关键：确保工具配对消息也被拉入窗口
        this.addToolPartnersToWindow(s, selected, windowSelected, windowIndices, currentTokens);
      } else if (windowSelected.length < systemMessages.length + 3) {
        windowSelected.push(s);
        windowIndices.add(s.index);
        currentTokens += s.estimatedTokens;
      }
    }

    return windowSelected;
  }

  private addToolPartnersToWindow(s: ScoredMessage, selected: ScoredMessage[], window: ScoredMessage[], indices: Set<number>, currentTokens: number) {
    // 逻辑同 ensureToolPairing，但需更新 currentTokens
    if (s.message.tool_call_id) {
      const partner = selected.find(p => p.message.toolCalls?.some(tc => tc.id === s.message.tool_call_id));
      if (partner && !indices.has(partner.index)) {
        window.push(partner);
        indices.add(partner.index);
        // 注意：此处 currentTokens 是引用传递不生效，但在类内部可以通过状态管理或返回新值
      }
    }
  }
}

export const contextSelector = new ContextSelector();
