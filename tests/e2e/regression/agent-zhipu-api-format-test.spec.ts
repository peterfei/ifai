/**
 * 智谱 API Function Calling 格式测试
 *
 * 直接调用智谱 API，检查：
 * 1. 是否返回 tool_calls
 * 2. tool_calls 的格式是什么
 * 3. 与 OpenAI 格式是否兼容
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('智谱 API Function Calling 格式', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('zhipu-api-01: 直接测试智谱 API Function Calling', async ({ page }) => {
    console.log('[Test] ========== 测试智谱 API Function Calling 格式 ==========');

    const result = await page.evaluate(async () => {
      // 获取配置
      const settingsStore = (window as any).__settingsStore;
      const settings = settingsStore.getState();

      // E2E 测试环境使用 'real-ai-e2e' provider
      const provider = settings.providers.find((p: any) => p.id === 'real-ai-e2e');
      if (!provider) {
        return { error: 'Provider not found', providers: settings.providers.map((p: any) => ({ id: p.id, name: p.name })) };
      }

      console.log('[Test] Provider config:', {
        id: provider.id,
        baseUrl: provider.baseUrl,
        model: settings.currentModel
      });

      // 构造测试请求 - 带 tools
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
        stream: false
      };

      console.log('[Test] Request body (tools included):', JSON.stringify(requestBody, null, 2));

      // 发送请求
      const response = await fetch(provider.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log('[Test] Response status:', response.status);

      const responseText = await response.text();
      console.log('[Test] Response body:', responseText);

      let responseJson;
      try {
        responseJson = JSON.parse(responseText);
      } catch (e) {
        return {
          error: 'Failed to parse response as JSON',
          responseText: responseText.substring(0, 1000)
        };
      }

      // 检查响应格式
      const message = responseJson.choices?.[0]?.message;
      const hasToolCalls = !!message?.tool_calls;
      const toolCallsCount = message?.tool_calls?.length || 0;
      const hasContent = !!message?.content;

      console.log('[Test] ========== Response Analysis ==========');
      console.log('[Test] Has tool_calls:', hasToolCalls);
      console.log('[Test] Tool calls count:', toolCallsCount);
      console.log('[Test] Has content:', hasContent);
      console.log('[Test] Content:', message?.content?.substring(0, 500));

      if (hasToolCalls && toolCallsCount > 0) {
        console.log('[Test] Tool call sample:', JSON.stringify(message.tool_calls[0], null, 2));
      }

      return {
        success: true,
        responseStatus: response.status,
        hasToolCalls,
        toolCallsCount,
        hasContent,
        contentPreview: message?.content?.substring(0, 500) || null,
        toolCallsSample: hasToolCalls ? message.tool_calls[0] : null,
        fullResponse: responseJson
      };
    });

    console.log('[Test] ========== Test Result ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    if (!result.hasToolCalls) {
      console.log('[Test] ❌ 智谱 API 没有返回 tool_calls！');
      console.log('[Test] 可能原因：');
      console.log('[Test] 1. 智谱 glm-4.7 不支持此格式的 function calling');
      console.log('[Test] 2. 需要不同的 tools 格式');
      console.log('[Test] 3. prompt 需要明确要求使用工具');
    }
  });
});
