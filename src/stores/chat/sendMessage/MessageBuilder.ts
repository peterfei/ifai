/**
 * MessageBuilder - 消息构建器 (Phase 3)
 *
 * 负责解析多模态内容、注入符号引用并构建标准 Message 对象。
 *
 * @version v1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import { readFileContent } from '../../../utils/fileSystem';
import type { Message, ContentPart } from 'ifainew-core';
import { LogDataFlow } from '../decorators/LogDataFlow';

// 🏆 v0.3.6: 工业级多模态数据缓存
// 将大体积图片保留在内存中，不存入受限的持久化存储
const multimodalCache = new Map<string, ContentPart[]>();

/**
 * 消息构建器（应用元编程装饰器）
 */
@LogDataFlow({ trackFields: ['multiModalContent', 'content'] })
export class MessageBuilder {
  /**
   * 构建富文本消息
   */
  async build(content: string | ContentPart[], sessionId: string): Promise<Message> {
    const messageId = uuidv4();
    
    // 1. 处理多模态缓存
    if (Array.isArray(content)) {
      multimodalCache.set(messageId, content);
      console.log(`[MessageBuilder] 🖼️ Multimodal data cached for ${messageId}`);
    }

    // 2. 解析并注入引用
    let textContent = typeof content === 'string' ? content : 
      (content.find(p => p.type === 'text') as any)?.text || '';
    
    const enrichedText = await this.injectReferences(textContent);

    // 3. 构建最终消息对象
    const message: Message = {
      id: messageId,
      role: 'user',
      content: enrichedText,
      // 保持原始多模态引用（如果存在）
      multiModalContent: Array.isArray(content) ? content : undefined,
      timestamp: Date.now(),
    };

    return message;
  }

  /**
   * 符号级精准注入逻辑
   */
  private async injectReferences(text: string): Promise<string> {
    if (!text.includes('[#')) return text;

    let result = text;
    const refMatches = [...text.matchAll(/\[#(.*?)\]\((.*?)(?::(\d+)-(\d+))?\)/g)];

    if (refMatches.length > 0) {
      console.log(`[MessageBuilder] 🧠 Reference injection: found ${refMatches.length} markers`);
      
      const contents = await Promise.all(refMatches.map(async (m) => {
        const [name, path, start, end] = [m[1], m[2], m[3], m[4]];
        try {
          const fileText = await readFileContent(path);
          if (start && end) {
            const snippet = fileText.split('\n').slice(parseInt(start) - 1, parseInt(end)).join('\n');
            return `\n\n--- SYMBOL: ${name} IN ${path} (Lines ${start}-${end}) ---\n${snippet}\n--- END ---`;
          }
          return `\n\n--- FILE: ${path} ---\n${fileText}\n--- END ---`;
        } catch (error) {
          console.error(`[MessageBuilder] ❌ Failed to read reference ${path}:`, error);
          return `\n[Error reading ${path}]`;
        }
      }));

      result += contents.join('');
    }

    return result;
  }

  /**
   * 获取多模态缓存数据
   */
  getMultimodalData(messageId: string): ContentPart[] | undefined {
    return multimodalCache.get(messageId);
  }

  /**
   * 清理缓存（防止内存泄漏）
   */
  clearCache(messageId: string) {
    multimodalCache.delete(messageId);
  }
}

export const messageBuilder = new MessageBuilder();
