/**
 * 事件处理器辅助函数
 * 纯函数工具集，用于简化事件处理器逻辑
 * @module handlerHelpers
 */

import type { ParsedTaskNode } from '../formatters/taskTree';

/**
 * 切片日志数组，保留最近 N 条
 * @param logs - 日志数组
 * @param limit - 保留数量，默认 100
 * @returns 切片后的日志数组
 */
export function sliceLogs<T>(logs: T[], limit: number = 100): T[] {
  return logs.slice(-limit);
}

/**
 * 判断是否需要更新 agent 状态
 * 用于防御性状态修复：收到日志时，agent 应该是 active 状态
 *
 * @param currentStatus - 当前状态
 * @returns 是否需要修复为 running 状态
 */
export function shouldUpdateStatus(currentStatus: string): boolean {
  // 只修复 initializing 和 idle 状态
  // 保留 waitingfortool（有效状态）和其他运行状态
  return currentStatus === 'initializing' || currentStatus === 'idle';
}

/**
 * 从 JSON 缓冲区提取标题
 * @param buffer - JSON 字符串
 * @returns 提取的标题或 null
 */
export function extractTitleFromBuffer(buffer: string): string | null {
  const titleMatch = buffer.match(/"title"\s*:\s*"([^"]+)"/);
  return titleMatch?.[1] || null;
}

/**
 * 从缓冲区提取 taskTree 对象
 * 支持不完整的 JSON 和嵌套结构
 *
 * @param buffer - 原始 JSON 字符串
 * @returns 解析后的 taskTree 或 null
 */
export function extractTaskTreeFromBuffer(buffer: string): ParsedTaskNode | null {
  try {
    // 移除 markdown 代码块标记
    const cleanBuffer = buffer
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    // 查找 taskTree 属性
    const taskTreeStart = cleanBuffer.indexOf('"taskTree"');
    if (taskTreeStart === -1) {
      return null;
    }

    // 使用括号匹配提取完整对象
    let braceCount = 0;
    let startPos = -1;
    let endPos = -1;

    for (let i = taskTreeStart; i < cleanBuffer.length; i++) {
      if (cleanBuffer[i] === '{') {
        if (startPos === -1) startPos = i;
        braceCount++;
      } else if (cleanBuffer[i] === '}') {
        braceCount--;
        if (braceCount === 0 && startPos !== -1) {
          endPos = i + 1;
          break;
        }
      }
    }

    if (startPos === -1 || endPos === -1) {
      return null;
    }

    const taskTreeJson = cleanBuffer.substring(startPos, endPos);
    const parsed = JSON.parse(`{"taskTree":${taskTreeJson}}`);

    return parsed.taskTree || null;
  } catch (e) {
    return null;
  }
}

/**
 * 检查标题是否已经在日志中显示过
 * @param logs - 现有日志数组
 * @param title - 要检查的标题
 * @returns 是否已显示
 */
export function isTitleAlreadyShown(logs: string[], title: string): boolean {
  return logs.some(log => log.includes(title));
}
