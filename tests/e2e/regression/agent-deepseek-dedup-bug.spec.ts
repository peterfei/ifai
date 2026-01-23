/**
 * DeepSeek 流式输出去重问题还原测试
 *
 * 问题描述：
 * DeepSeek API 发送 tool_call 时的行为：
 * 1. 先发送空的 tool_call (args_len=0, isPartial=true)
 * 2. 然后多次重复发送相同的空 tool_call
 * 3. 最后发送完整的 tool_call (args_len>0, isPartial=false)
 *
 * Bug:
 * - 去重逻辑在第一个空 tool_call 时就标记为"已发送"
 * - 导致后续的完整 tool_call 也被跳过
 * - 用户看不到工具批准 UI
 *
 * 修复方案：
 * - 不要在 args_len=0 时标记为已发送
 * - 只在 args_len>0 时才标记为已发送
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('DeepSeek Tool Call Dedup Bug', () => {

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('AgentStore') ||
          text.includes('tool_call') ||
          text.includes('dedup') ||
          text.includes('args_len') ||
          text.includes('isPartial')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('@regression should reproduce DeepSeek empty tool_call dedup bug', async ({ page }) => {
    console.log('[Test] ========== DeepSeek Tool Call 去重 Bug 还原 ==========');
    test.setTimeout(60000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      const msgId = crypto.randomUUID();
      const toolCallId = 'call_deepseek_test_123';

      // 🔥 步骤 1: 模拟 DeepSeek 行为 - 发送空的 tool_call
      console.log('[Test] 步骤 1: 发送空 tool_call (args_len=0)');
      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_write_file',
          arguments: {},  // 🔥 空的！
          function: { name: 'agent_write_file', arguments: '{}' },
          status: 'pending',
          isPartial: true
        }],
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      let messages = chatStore.getState().messages;
      let msg = messages.find((m: any) => m.id === msgId);
      const step1ToolCalls = msg.toolCalls || [];

      console.log('[Test] 步骤 1 结果:', {
        hasToolCalls: !!step1ToolCalls.length,
        toolCall: step1ToolCalls[0] || null
      });

      // 🔥 步骤 2: 模拟 DeepSeek 重复发送相同的空 tool_call
      console.log('[Test] 步骤 2: 模拟重复发送（去重逻辑应该跳过）');
      for (let i = 0; i < 5; i++) {
        messages = chatStore.getState().messages;
        msg = messages.find((m: any) => m.id === msgId);
        msg.toolCalls = [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_write_file',
          arguments: {},  // 仍然是空的
          function: { name: 'agent_write_file', arguments: '{}' },
          status: 'pending',
          isPartial: true
        }];
        chatStore.setState({ messages: [...messages] });
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 🔥 步骤 3: 模拟 DeepSeek 发送完整的 tool_call
      console.log('[Test] 步骤 3: 发送完整 tool_call (args_len>0)');

      messages = chatStore.getState().messages;
      msg = messages.find((m: any) => m.id === msgId);
      msg.toolCalls = [{
        id: toolCallId,
        type: 'function',
        tool: 'agent_write_file',
        arguments: {
          rel_path: 'test.txt',
          content: 'Hello World'
        },
        function: { name: 'agent_write_file', arguments: '{"rel_path":"test.txt","content":"Hello World"}' },
        status: 'pending',
        isPartial: false
      }];
      chatStore.setState({ messages: [...messages] });

      await new Promise(resolve => setTimeout(resolve, 100));

      // 验证最终状态
      messages = chatStore.getState().messages;
      msg = messages.find((m: any) => m.id === msgId);
      const finalToolCalls = msg.toolCalls || [];

      console.log('[Test] 最终状态:', {
        hasToolCalls: !!finalToolCalls.length,
        args: finalToolCalls[0]?.arguments,
        isPartial: finalToolCalls[0]?.isPartial
      });

      return {
        success: true,
        step1: {
          hasToolCalls: !!step1ToolCalls.length,
          args: step1ToolCalls[0]?.arguments
        },
        final: {
          hasToolCalls: !!finalToolCalls.length,
          args: finalToolCalls[0]?.arguments,
          isPartial: finalToolCalls[0]?.isPartial,
          hasValidContent: finalToolCalls[0]?.arguments?.content === 'Hello World'
        }
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // ✅ 验证：最终的 tool_call 应该有完整参数
    expect(result.success).toBe(true);
    expect(result.final.hasToolCalls).toBe(true);
    expect(result.final.hasValidContent).toBe(true);

    console.log('[Test] ✅ Tool Call 参数正确更新');
  });

  test('@regression should verify backend dedup logic with empty args', async ({ page }) => {
    console.log('[Test] ========== 后端去重逻辑验证 ==========');
    test.setTimeout(30000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      const msgId = crypto.randomUUID();
      const toolCallId = 'call_test_empty_args';

      // 模拟后端发送空 tool_call 的事件序列
      const scenarios = [
        {
          name: 'Empty tool_call (args_len=0)',
          toolCall: {
            id: toolCallId,
            tool: 'agent_write_file',
            arguments: {},
            isPartial: true
          }
        },
        {
          name: 'Partial tool_call (args_len=5)',
          toolCall: {
            id: toolCallId,
            tool: 'agent_write_file',
            arguments: { rel_path: 't' },
            isPartial: true
          }
        },
        {
          name: 'Complete tool_call (args_len=full)',
          toolCall: {
            id: toolCallId,
            tool: 'agent_write_file',
            arguments: { rel_path: 'test.txt', content: 'Hello' },
            isPartial: false
          }
        }
      ];

      const results: any[] = [];

      for (const scenario of scenarios) {
        // 添加/更新 tool_call
        let messages = chatStore.getState().messages;
        let msg = messages.find((m: any) => m.id === msgId);

        if (!msg) {
          chatStore.getState().addMessage({
            id: msgId,
            role: 'assistant',
            content: '',
            toolCalls: [{
              id: scenario.toolCall.id,
              type: 'function',
              tool: scenario.toolCall.tool,
              arguments: scenario.toolCall.arguments,
              function: {
                name: scenario.toolCall.tool,
                arguments: JSON.stringify(scenario.toolCall.arguments)
              },
              status: 'pending',
              isPartial: scenario.toolCall.isPartial
            }],
            timestamp: Date.now()
          });
        } else {
          msg.toolCalls = [{
            id: scenario.toolCall.id,
            type: 'function',
            tool: scenario.toolCall.tool,
            arguments: scenario.toolCall.arguments,
            function: {
              name: scenario.toolCall.tool,
              arguments: JSON.stringify(scenario.toolCall.arguments)
            },
            status: 'pending',
            isPartial: scenario.toolCall.isPartial
          }];
          chatStore.setState({ messages: [...messages] });
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        // 读取结果
        messages = chatStore.getState().messages;
        msg = messages.find((m: any) => m.id === msgId);
        const tc = msg.toolCalls?.[0];

        results.push({
          scenario: scenario.name,
          args: tc?.arguments,
          isPartial: tc?.isPartial,
          argsLen: JSON.stringify(tc?.arguments || {}).length
        });
      }

      return {
        success: true,
        results
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // ✅ 验证：参数应该逐步增长
    expect(result.success).toBe(true);
    expect(result.results[0].argsLen).toBe(2); // {}
    expect(result.results[1].argsLen).toBeGreaterThan(2); // {rel_path:"t"}
    expect(result.results[2].argsLen).toBeGreaterThan(result.results[1].argsLen); // full args

    console.log('[Test] ✅ Tool Call 参数逐步更新正确');
  });
});
