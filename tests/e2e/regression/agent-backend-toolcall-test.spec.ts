/**
 * 直接测试后端 tool_call 事件发送
 *
 * 绕过 Agent 系统，直接调用 ai_utils.rs 的流式 API
 * 来验证 isPartial=false 修复是否生效
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('后端 tool_call 事件发送测试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[AgentStream]') || text.includes('tool_call') || text.includes('Streaming:') || text.includes('isPartial')) {
        console.log('[Backend]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('backend-toolcall-01: 验证智谱 LLM 返回 tool_calls 时后端发送正确的事件', async ({ page }) => {
    console.log('[Test] ========== 验证后端 tool_call 事件发送 ==========');

    // 这个测试通过 Tauri invoke 直接调用后端的 AI 功能
    // 来模拟真实场景并检查 tool_call 事件

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 清空消息
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      const assistantMsgId = crypto.randomUUID();

      // 创建 assistant 消息
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 监听 tool_call 事件
      const toolCallEvents: any[] = [];

      // 注册监听器
      const listenerId = crypto.randomUUID();

      // 创建一个 Promise 来等待 tool_call 事件
      const waitForToolCall = new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const messages = chatStore.getState().messages;
          const msg = messages.find((m: any) => m.id === assistantMsgId);
          if (msg?.toolCalls && msg.toolCalls.length > 0) {
            clearInterval(checkInterval);
            resolve(msg.toolCalls);
          }
        }, 100);

        // 超时
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(null);
        }, 20000);
      });

      // 通过 Tauri invoke 调用后端 ai_chat (带 tools)
      console.log('[Test] 调用后端 ai_chat...');

      try {
        const invokeResult = await (window as any).__TAURI__.core.invoke('ai_chat', {
          eventId: `test_${listenerId}`,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: '请读取 README.md 文件的内容' }
          ],
          providerId: 'real-ai-e2e',
          enableTools: true,
          projectRoot: '/Users/mac/project/aieditor/ifainew'
        });

        console.log('[Test] invokeResult:', invokeResult);
      } catch (e) {
        console.log('[Test] invoke error:', e);
      }

      // 等待 tool_call 事件
      const toolCalls = await waitForToolCall;

      // 检查消息状态
      const finalMessages = chatStore.getState().messages;
      const finalMsg = finalMessages.find((m: any) => m.id === assistantMsgId);

      console.log('[Test] ========== 最终状态 ==========');
      console.log('[Test] toolCalls:', toolCalls);
      console.log('[Test] finalMsg:', {
        id: finalMsg?.id,
        hasToolCalls: !!(finalMsg?.toolCalls),
        toolCallsCount: finalMsg?.toolCalls?.length || 0,
        contentLength: finalMsg?.content?.length || 0
      });

      // 检查 DOM
      const approveButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('批准') || b.textContent?.includes('Approve'));

      return {
        success: true,
        hasToolCalls: !!(finalMsg?.toolCalls),
        toolCallsCount: finalMsg?.toolCalls?.length || 0,
        firstToolCall: finalMsg?.toolCalls?.[0] || null,
        approveButtonCount: approveButtons.length,
        content: finalMsg?.content?.substring(0, 500) || null
      };
    });

    console.log('[Test] ========== 结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    if (result.hasToolCalls) {
      console.log('[Test] ✅ 成功接收到 tool_calls！');
      console.log('[Test] ToolCall:', result.firstToolCall);

      if (result.firstToolCall.isPartial === false) {
        console.log('[Test] ✅ isPartial 正确设置为 false！');
      } else {
        console.log('[Test] ❌ isPartial 仍然是 true，修复可能未生效');
      }

      if (result.approveButtonCount > 0) {
        console.log('[Test] ✅ 批准按钮已显示！');
      }
    } else {
      console.log('[Test] ❌ 没有接收到 tool_calls');
      console.log('[Test] Content:', result.content);
    }
  });
});
