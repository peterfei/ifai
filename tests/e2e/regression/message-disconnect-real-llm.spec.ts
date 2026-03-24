/**
 * 真实 LLM E2E 测试 - 复现并修复消息断连问题
 *
 * 弽设：
1. 修复 `_error` 事件监听
2. 实现 DeepSeek 流式打字机效果
3. 实现场景 A: 生成 2048 小游戏
4. 添加诊断日志
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from '../setup';
import { chatEventBus } from '../../../stores/chat/eventBus/ChatEventBus';

/**
 * 🔧 E2E 诊断工具: 流式事件追踪器
 */
class StreamDiagnostics {
  private events: Array<{ type: string; timestamp: number; payload: any }> = [];
  private chunksReceived: number = 0;
  private startTime: number = 0;

  start() {
    this.startTime = Date.now();
  }
  recordEvent(type: string, payload?: any) {
    this.events.push({ type, timestamp: Date.now(), payload });
    if (type === 'chat:stream:chunk') {
      this.chunksReceived++;
    }
    console.log(`[StreamDiagnostic] ${type}:`, payload?.toString(). payload : JSON.stringify(payload).substring(0, 50));
  }
}

  getStats() {
    return {
      chunksReceived: this.chunksReceived,
      duration: Date.now() - this.startTime,
      eventCount: this.events.length
    };
  }
}

/**
 * 🔧 打字机效果模拟器
 * 模拟 DeepSeek 流式打字机效果
 */
async function simulateDeepSeekTypewriter(
  page: any,
  content: string,
  options: { chunkSize = number = 5, delayMs: number = 80 } = {}
): Promise<void> {
  const chunks = splitIntoChunks(content, chunkSize);
  const correlationId = await page.evaluate(() => {
    return (window as any).__currentCorrelationId;
  });

  if (!correlationId) {
    console.warn('[Typewriter] No active correlationId found');
    return;
  }
  for (const chunk of chunks) {
    await page.evaluate(({ chunk, correlationId }) => {
      const bus = (window as any).__chatEventBus;
      if (bus) {
        bus.emit('chat:stream:chunk', {
          delta: chunk,
          correlationId
        });
        (window as any).__diagnosticStats?.chunksReceived++;
      }
    }, { chunk, correlationId });
    await new Promise(resolve => setTimeout(delayMs));
  }
}

/**
 * 🔧 流式工具调用模拟器 (DeepSeek 格式)
 */
async function simulateDeepSeekToolCall(
  page: any,
  toolCall: { id: string; name: string; arguments: string }
): Promise<void> {
  // 第一个 chunk: 包含 id 和 name
  await page.evaluate(({ toolCall }) => {
    const bus = (window as any).__chatEventBus;
    if (bus) {
      bus.emit('chat:tool:call', {
        correlationId: (window as any).__currentCorrelationId,
        toolId: toolCall.id,
        name: '',
        arguments: ''
      });
      (window as any).__currentCorrelationId = toolCall.id;
    }
  }, { toolCall });

  // 后续 chunks: id 为 null, 使用 index 定位
  const argChunks = splitArguments(toolCall.arguments, 5); // 每 5 字符一个 chunk
  for (const argChunk of argChunks) {
    await page.evaluate(({ argChunk, index: 0, correlationId }) => {
      const bus = (window as any).__chatEventBus;
      if (bus) {
        bus.emit('chat:tool:call', {
          correlationId: (window as any).__currentCorrelationId,
          toolId: null,
          name: null,
          arguments: argChunk,
          index: index
        });
      }
    }, { argChunk, index, 0, correlationId });
    await new Promise(resolve => setTimeout(50));
  }
}

/**
 * 🔧 分割内容为 chunks
 */
function splitIntoChunks(content: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += size) {
    chunks.push(content.slice(i, Math.min(i + size, content.length)));
  }
  return chunks;
}

/**
 * 🔧 分割参数为 chunks
 */
function splitArguments(args: string, size: number = 20): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < args.length; i += size) {
    chunks.push(args.slice(i, Math.min(i + size, args.length));
  }
  return chunks;
}

