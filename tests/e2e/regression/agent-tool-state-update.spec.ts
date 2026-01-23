/**
 * Agent 工具状态更新测试
 *
 * 验证当 toolCall.isPartial 从 true 更新为 false 时，
 * ToolApproval 组件是否正确接收新的 props
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Agent 工具状态更新', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('ToolApproval') || text.includes('isPartial')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });

    // 🔥 等待 React 应用完全渲染
    await page.waitForFunction(() => {
      const body = document.body;
      return body && (body.innerHTML.includes('class') || body.children.length > 0);
    }, { timeout: 10000 });

    await page.waitForTimeout(500);
  });

  test('@regression agent-state-update-01: 验证 toolCall isPartial 更新后组件重新渲染', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 清空消息
      chatStore.setState({ messages: [] });

      const agentMsgId = 'test-state-update-1';
      const toolCallId = 'tc-state-update-1';

      // 1. 创建 Agent 消息，带 content 和 toolCall (isPartial: true)
      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: 'Thinking...',
        timestamp: Date.now(),
        agentId: 'test-agent',
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_read_file',
          args: { path: 'README.md' },
          function: { name: 'agent_read_file', arguments: '{"path":"README.md"}' },
          status: 'pending',
          isPartial: true  // 🔥 初始状态
        }]
      });

      console.log('[Test] ========== 步骤 1: 创建了 isPartial=true 的 toolCall ==========');

      // 等待初始渲染完成
      await new Promise(resolve => setTimeout(resolve, 300));

      // 检查初始状态
      let messages = chatStore.getState().messages;
      let msg = messages.find((m: any) => m.id === agentMsgId);
      let tc = msg?.toolCalls?.[0];
      console.log('[Test] 初始状态:', {
        hasToolCall: !!tc,
        isPartial: tc?.isPartial
      });

      // 2. 更新 isPartial 为 false
      console.log('[Test] ========== 步骤 2: 更新 isPartial 为 false ==========');

      chatStore.setState((state: any) => {
        const updated = state.messages.map(m => {
          if (m.id === agentMsgId) {
            return {
              ...m,
              toolCalls: (m.toolCalls || []).map(t =>
                t.id === toolCallId
                  ? { ...t, isPartial: false, args: { path: 'README.md', lines: 100 } }
                  : { ...t }
              )
            };
          }
          return m;
        });
        return { messages: updated };
      });

      // 立即检查 store 中的值
      messages = chatStore.getState().messages;
      msg = messages.find((m: any) => m.id === agentMsgId);
      tc = msg?.toolCalls?.[0];
      console.log('[Test] 更新后的 store 状态:', {
        isPartial: tc?.isPartial,
        isActuallyFalse: tc?.isPartial === false
      });

      // 等待 React 渲染
      await new Promise(resolve => setTimeout(resolve, 500));

      // 3. 检查 DOM
      const toolApprovalCards = document.querySelectorAll('[data-test-id="tool-approval-card"]');
      console.log('[Test] DOM 中的 ToolApproval 数量:', toolApprovalCards.length);

      // 检查批准按钮是否存在
      const approveButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('批准') || b.textContent?.includes('Approve'));

      return {
        success: true,
        initialState: { isPartial: true },
        storeStateAfterUpdate: { isPartial: tc?.isPartial },
        toolApprovalCount: toolApprovalCards.length,
        approveButtonCount: approveButtons.length,
        issue: toolApprovalCards.length === 0 ? 'ToolApproval 未渲染' :
               approveButtons.length === 0 ? '批准按钮未显示' :
               null
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.storeStateAfterUpdate.isPartial).toBe(false);
    expect(result.toolApprovalCount).toBeGreaterThan(0);
    expect(result.approveButtonCount).toBeGreaterThan(0);
    expect(result.issue).toBeNull();
  });
});
