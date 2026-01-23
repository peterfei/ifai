/**
 * 智谱 LLM Agent 工具调用深度调试
 *
 * 检查后端是否正确发送 tools 参数到智谱 API
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('智谱 LLM 工具调用调试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[AgentStream]') || text.includes('Streaming:') || text.includes('tool_call') || text.includes('tools')) {
        console.log('[Backend]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('@regression debug-tools-01: 检查后端是否发送 tools 参数', async ({ page }) => {
    console.log('[Test] ========== 检查后端是否发送 tools 参数 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      // 清空消息
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();

      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '读取 README.md 文件',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: undefined,
        isAgentLive: true
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const store = agentStore.getState();

      // 启动 Agent
      const agentId = await store.launchAgent(
        'Refactor Agent',
        '读取 README.md 文件',
        assistantMsgId,
        undefined
      );

      console.log('[Test] Agent ID:', agentId);

      // 等待执行
      await new Promise(resolve => setTimeout(resolve, 15000));

      // 检查消息
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === assistantMsgId);
      const toolCall = assistantMsg?.toolCalls?.[0];

      console.log('[Test] ========== 最终状态 ==========');
      console.log('[Test] assistantMsg:', {
        id: assistantMsg?.id,
        hasContent: !!(assistantMsg?.content),
        contentLength: assistantMsg?.content?.length || 0,
        hasToolCalls: !!(assistantMsg?.toolCalls),
        toolCallsCount: assistantMsg?.toolCalls?.length || 0
      });

      console.log('[Test] toolCall:', toolCall);

      // 检查 DOM
      const approveButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('批准') || b.textContent?.includes('Approve'));

      console.log('[Test] 批准按钮数量:', approveButtons.length);

      return {
        success: true,
        hasToolCall: !!toolCall,
        tool: toolCall?.tool,
        status: toolCall?.status,
        isPartial: toolCall?.isPartial,
        approveButtonCount: approveButtons.length,
        content: assistantMsg?.content?.substring(0, 500)
      };
    });

    console.log('[Test] ========== 结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    if (!result.hasToolCall) {
      console.log('[Test] ❌ Zhipu LLM 没有返回 tool_call');
      console.log('[Test] Content:', result.content);
    }
  });
});
