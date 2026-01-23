/**
 * 智谱 API 流式 Function Calling 测试
 *
 * 直接调用智谱流式 API，检查：
 * 1. 流式响应中是否包含 tool_calls
 * 2. tool_calls 的格式
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('智谱 API 流式 Function Calling', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('@regression zhipu-stream-01: 测试智谱流式 API Function Calling', async ({ page }) => {
    console.log('[Test] ========== 测试智谱流式 API Function Calling ==========');

    const result = await page.evaluate(async () => {
      const settingsStore = (window as any).__settingsStore;
      const settings = settingsStore.getState();

      const provider = settings.providers.find((p: any) => p.id === 'real-ai-e2e');
      if (!provider) {
        return { error: 'Provider not found' };
      }

      // 构造请求 - 流式模式
      const requestBody = {
        model: settings.currentModel,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: '读取 README.md 文件的内容' }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'agent_read_file',
              description: 'Read content of a file',
              parameters: {
                type: 'object',
                properties: {
                  rel_path: { type: 'string', description: 'Relative path to file' }
                },
                required: ['rel_path']
              }
            }
          }
        ],
        stream: true  // 🔥 关键：流式模式
      };

      console.log('[Test] 发送流式请求到:', provider.baseUrl);

      const response = await fetch(provider.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log('[Test] Response status:', response.status);

      // 读取流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const chunks = [];
      const toolCallChunks = [];

      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;

        // 解析 SSE 格式
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              chunks.push(parsed);

              // 检查是否有 tool_calls
              if (parsed.choices?.[0]?.delta?.tool_calls) {
                toolCallChunks.push(parsed);
                console.log('[Test] 收到 tool_call chunk:', JSON.stringify(parsed.choices[0].delta.tool_calls));
              }

              // 检查 reasoning_content (智谱特有)
              if (parsed.choices?.[0]?.delta?.reasoning_content) {
                console.log('[Test] 收到 reasoning_content:', parsed.choices[0].delta.reasoning_content.substring(0, 100));
              }
            } catch (e) {
              // 忽略解析错误（可能是不完整的 JSON）
            }
          }
        }
      }

      console.log('[Test] ========== 流式响应分析 ==========');
      console.log('[Test] 总 chunk 数:', chunks.length);
      console.log('[Test] tool_call chunk 数:', toolCallChunks.length);

      // 分析最后几个 chunk
      console.log('[Test] 最后 3 个 chunks:');
      chunks.slice(-3).forEach((chunk, i) => {
        console.log(`[Test] Chunk -${i + 1}:`, JSON.stringify(chunk).substring(0, 500));
      });

      // 检查最终响应
      const lastChunk = chunks[chunks.length - 1];
      const hasToolCallsInFinal = lastChunk?.choices?.[0]?.message?.tool_calls;

      return {
        success: true,
        totalChunks: chunks.length,
        toolCallChunksCount: toolCallChunks.length,
        hasToolCallsInFinal: !!hasToolCallsInFinal,
        finalToolCalls: hasToolCallsInFinal || null,
        sampleChunks: chunks.slice(0, 5).map(c => ({
          hasContent: !!c.choices?.[0]?.delta?.content,
          hasToolCalls: !!c.choices?.[0]?.delta?.tool_calls,
          hasReasoning: !!c.choices?.[0]?.delta?.reasoning_content,
          finishReason: c.choices?.[0]?.finish_reason
        })),
        toolCallSamples: toolCallChunks.slice(0, 3).map(c => c.choices?.[0]?.delta?.tool_calls)
      };
    });

    console.log('[Test] ========== 测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    if (result.toolCallChunksCount === 0 && !result.hasToolCallsInFinal) {
      console.log('[Test] ❌ 智谱流式 API 没有返回 tool_calls！');
      console.log('[Test] 这就是为什么 Agent 没有显示批准按钮的根本原因！');
    }
  });
});
