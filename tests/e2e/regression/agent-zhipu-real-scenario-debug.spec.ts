/**
 * 真实智谱 LLM Agent 场景调试
 *
 * 直接在真实应用中测试 "重构 README.md 90字左右"
 * 检查是否收到 tool_calls 以及为什么没有按钮
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('智谱 LLM Agent 真实场景调试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[AgentStore]') || text.includes('[E2E]') || text.includes('tool_call') || text.includes('Streaming')) {
        console.log('[Backend]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('@regression debug-real-scenario: 直接调用智谱 API 并检查响应', async ({ page }) => {
    console.log('[Test] ========== 直接调用智谱 API 检查 tool_calls ==========');

    const result = await page.evaluate(async () => {
      const settingsStore = (window as any).__settingsStore;
      const settings = settingsStore.getState();
      const provider = settings.providers.find((p: any) => p.id === 'real-ai-e2e');

      if (!provider) {
        return { error: 'Provider not found' };
      }

      // 使用与真实 Agent 相同的 prompt
      const requestBody = {
        model: settings.currentModel,
        messages: [
          {
            role: 'system',
            content: 'You are an expert code refactoring assistant. When asked to refactor files, you should first read the file to understand its current content, then provide a refactored version.'
          },
          {
            role: 'user',
            content: '重构 README.md 90字左右'
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'agent_read_file',
              description: 'Read the content of a file at the specified path',
              parameters: {
                type: 'object',
                properties: {
                  rootPath: {
                    type: 'string',
                    description: 'The root directory path of the project'
                  },
                  relPath: {
                    type: 'string',
                    description: 'The relative path of the file from the root directory'
                  }
                },
                required: ['rootPath', 'relPath']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'agent_write_file',
              description: 'Write content to a file at the specified path',
              parameters: {
                type: 'object',
                properties: {
                  rootPath: {
                    type: 'string',
                    description: 'The root directory path of the project'
                  },
                  relPath: {
                    type: 'string',
                    description: 'The relative path of the file from the root directory'
                  },
                  content: {
                    type: 'string',
                    description: 'The content to write to the file'
                  }
                },
                required: ['rootPath', 'relPath', 'content']
              }
            }
          }
        ],
        stream: false
      };

      console.log('[Test] 发送请求到智谱 API');
      console.log('[Test] Request:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(provider.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      console.log('[Test] ========== 响应分析 ==========');
      console.log('[Test] Response:', JSON.stringify(data, null, 2));

      const choice = data.choices?.[0];
      const message = choice?.message;
      const toolCalls = message?.tool_calls;
      const content = message?.content;
      const reasoningContent = message?.reasoning_content;

      console.log('[Test] finish_reason:', choice?.finish_reason);
      console.log('[Test] has tool_calls:', !!toolCalls);
      console.log('[Test] tool_calls count:', toolCalls?.length || 0);
      console.log('[Test] has content:', !!content);
      console.log('[Test] has reasoning_content:', !!reasoningContent);

      if (content) {
        console.log('[Test] Content (first 500 chars):', content.substring(0, 500));
      }

      if (reasoningContent) {
        console.log('[Test] Reasoning (first 500 chars):', reasoningContent.substring(0, 500));
      }

      // 检查是否有 "是否确认写入文件" 文字
      const hasConfirmText = (content || '') + (reasoningContent || '');
      const hasConfirmWrite = hasConfirmText.includes('是否确认写入文件') || hasConfirmText.includes('确认写入');

      return {
        success: response.ok,
        finishReason: choice?.finish_reason,
        hasToolCalls: !!toolCalls,
        toolCallsCount: toolCalls?.length || 0,
        toolCalls: toolCalls || null,
        hasContent: !!content,
        hasReasoningContent: !!reasoningContent,
        content: content || null,
        reasoningContent: reasoningContent || null,
        hasConfirmWrite,
        fullResponse: data
      };
    });

    console.log('[Test] ========== 测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    // 关键分析
    if (!result.success) {
      console.log('[Test] ❌ API 请求失败');
    } else if (result.finishReason === 'tool_calls' && result.hasToolCalls) {
      console.log('[Test] ✅ 智谱返回了 tool_calls');
      console.log('[Test] ToolCalls:', result.toolCalls);
    } else if (result.finishReason === 'stop') {
      console.log('[Test] ⚠️ 智谱返回了普通文本，没有 tool_calls');
      console.log('[Test] Content:', result.content);
      console.log('[Test] Reasoning:', result.reasoningContent);
      console.log('[Test] 这就是为什么没有审批按钮的根本原因！');
    }

    expect(result.success).toBe(true);
  });
});
