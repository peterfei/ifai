// Token 计数工具 - v0.2.6 新增
// 提供与后端 tiktoken-rs 集成的 Token 计数功能

import { invoke } from '@tauri-apps/api/core';

/**
 * 计算单个文本的 Token 数量
 * @param text 要计数的文本
 * @param model 模型名称（用于选择正确的编码器）
 * @returns Token 数量
 */
export async function countTokens(text: string, model: string): Promise<number> {
  return invoke<number>('count_tokens', { text, model });
}

/**
 * 批量计算多个文本的 Token 数量
 * @param texts 文本数组
 * @param model 模型名称
 * @returns 每个文本的 Token 数量数组
 */
export async function countTokensBatch(texts: string[], model: string): Promise<number[]> {
  return invoke<number[]>('count_tokens_batch', { texts, model });
}

/**
 * 快速估算 Token 数量（不使用 tiktoken，基于字符数）
 * @param text 要估算的文本
 * @returns 估算的 Token 数量
 */
export async function estimateTokens(text: string): Promise<number> {
  return invoke<number>('estimate_tokens_cmd', { text });
}

/**
 * 计算消息列表的总 Token 数量
 * @param messages 消息数组
 * @param model 模型名称
 * @returns 总 Token 数量
 */
export async function countMessagesTokens(
  messages: Array<{ role: string; content: string }>,
  model: string
): Promise<number> {
  // 将消息序列化为文本进行计数
  const serialized = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  return countTokens(serialized, model);
}

/**
 * 获取模型的建议最大 Token 数量
 * @param model 模型名称
 * @returns 最大 Token 数量
 */
export function getModelMaxTokens(model: string): number {
  const modelLimits: Record<string, number> = {
    // GPT-4 系列
    'gpt-4': 8192,
    'gpt-4-turbo': 128000,
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,

    // GPT-3.5 系列
    'gpt-3.5-turbo': 16385,
    'gpt-3.5-turbo-16k': 16385,

    // Claude 系列（ Anthropic 使用不同的计数方式，这是近似值）
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'claude-3.5-sonnet': 200000,

    // Gemini 系列
    'gemini-1.5-pro': 1000000,
    'gemini-1.5-flash': 1000000,

    // 国产模型
    'glm-4': 128000,
    'glm-4-plus': 128000,
    'glm-4-air': 128000,
    'glm-4-flash': 128000,
    'glm-4.6': 128000,
    'glm-4.7': 128000,

    // DeepSeek
    'deepseek-chat': 64000,
    'deepseek-coder': 128000,

    // Kimi
    'moonshot-v1-8k': 8192,
    'moonshot-v1-32k': 32768,
    'moonshot-v1-128k': 128000,

    // 本地模型（默认值）
    'default': 4096,
  };

  // 尝试精确匹配
  if (modelLimits[model]) {
    return modelLimits[model];
  }

  // 尝试前缀匹配
  for (const [key, limit] of Object.entries(modelLimits)) {
    if (model.startsWith(key)) {
      return limit;
    }
  }

  // 默认返回 4096
  return modelLimits['default'];
}

/**
 * 计算上下文窗口使用百分比
 * @param used 已使用的 Token 数量
 * @param model 模型名称
 * @returns 使用百分比 (0-100)
 */
export function calculateTokenUsagePercentage(used: number, model: string): number {
  const max = getModelMaxTokens(model);
  return Math.min(100, Math.round((used / max) * 100));
}

/**
 * 格式化 Token 数量为可读字符串
 * @param count Token 数量
 * @returns 格式化后的字符串（如 "1.2K", "15.5K"）
 */
export function formatTokenCount(count: number): string {
  if (count < 1000) {
    return count.toString();
  } else if (count < 1000000) {
    return `${(count / 1000).toFixed(1)}K`;
  } else {
    return `${(count / 1000000).toFixed(2)}M`;
  }
}
