/**
 * Agent 工具批准按钮深度调试测试
 *
 * 目标：检查 ToolApproval 组件实际接收到的 props
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Agent 工具批准按钮深度调试', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('ToolApproval') ||
          text.includes('isPartial') ||
          text.includes('isPending') ||
          text.includes('DEBUG') ||
          text.includes('PROPS')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForFunction(() => {
      const body = document.body;
      return body && (body.innerHTML.includes('class') || body.children.length > 0);
    }, { timeout: 10000 });

    await page.waitForTimeout(500);

    // 🔥 FIX v0.3.11: 设置 project root 以支持 Agent 测试
    await page.evaluate(async () => {
      const fileStore = (window as any).__fileStore;
      if (fileStore && !fileStore.getState().rootPath) {
        await fileStore.getState().setRootPath('/Users/mac/mock-project');
        console.log('[Test] Project root set to: /Users/mac/mock-project');
      }
    });
  });

  test('@regression debug-001: 检查 ToolApproval 组件的实际 props', async ({ page }) => {
    console.log('[Test] ========== 深度调试 ToolApproval props ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 清空消息
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      const agentMsgId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      // 创建带 toolCall 的消息
      const toolCallData = {
        id: toolCallId,
        type: 'function',
        tool: 'agent_read_file',
        args: { path: 'README.md' },
        function: { name: 'agent_read_file', arguments: '{"path":"README.md"}' },
        status: 'pending' as const,
        isPartial: false  // 关键：设置为 false
      };

      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: '测试消息',
        timestamp: Date.now(),
        agentId: 'test-agent',
        toolCalls: [toolCallData]
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // 读取 store 中的状态
      const messages = chatStore.getState().messages;
      const msg = messages.find((m: any) => m.id === agentMsgId);
      const toolCall = msg?.toolCalls?.[0];

      console.log('[Test] ========== Store 状态检查 ==========');
      console.log('[Test] toolCall:', JSON.stringify(toolCall, null, 2));

      // 🔥 关键：检查 ToolApproval 组件实际接收到的 props
      // 通过查找 DOM 元素来推断组件的渲染状态
      const toolApprovalCards = document.querySelectorAll('[data-test-id="tool-approval-card"]');
      console.log('[Test] ToolApproval 卡片数量:', toolApprovalCards.length);

      if (toolApprovalCards.length > 0) {
        const card = toolApprovalCards[0];

        // 检查是否有"待审批"标签
        const hasPendingBadge = card.textContent?.includes('待审批');
        console.log('[Test] 有待审批标签:', hasPendingBadge);

        // 检查是否有"生成中"标签
        const hasStreamingBadge = card.textContent?.includes('生成中');
        console.log('[Test] 有生成中标签:', hasStreamingBadge);

        // 检查是否有批准按钮
        const hasApproveButton = card.querySelector('button')?.textContent?.includes('批准');
        console.log('[Test] 有批准按钮:', hasApproveButton);

        // 获取卡片的完整 HTML
        console.log('[Test] 卡片 HTML (前 3000 字符):', card.innerHTML.substring(0, 3000));
      }

      // 🔥 尝试直接读取 ToolApproval 的 props（通过 React DevTools）
      // 注意：这可能不工作，因为需要 React DevTools
      const allButtons = document.querySelectorAll('button');
      const approveButtons = Array.from(allButtons).filter(b =>
        b.textContent?.includes('批准') || b.textContent?.includes('Approve')
      );

      return {
        success: true,
        toolCallFromStore: {
          id: toolCall?.id,
          tool: toolCall?.tool,
          status: toolCall?.status,
          isPartial: toolCall?.isPartial,
          isPending: toolCall?.status === 'pending',
          shouldShowButtons: toolCall?.status === 'pending' && !toolCall?.isPartial
        },
        domCheck: {
          toolApprovalCount: toolApprovalCards.length,
          hasPendingBadge: toolApprovalCards.length > 0 && toolApprovalCards[0].textContent?.includes('待审批'),
          hasStreamingBadge: toolApprovalCards.length > 0 && toolApprovalCards[0].textContent?.includes('生成中'),
          approveButtonCount: approveButtons.length
        }
      };
    });

    console.log('[Test] ========== 调试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.toolCallFromStore.isPartial).toBe(false);
    expect(result.toolCallFromStore.shouldShowButtons).toBe(true);

    if (result.domCheck.approveButtonCount === 0) {
      console.log('[Test] ❌ 问题确认：条件满足但按钮未显示！');
      console.log('[Test] 可能原因：');
      console.log('[Test] 1. React 组件未重新渲染');
      console.log('[Test] 2. settings.agentAutoApprove 意外为 true');
      console.log('[Test] 3. JavaScript 错误阻止了按钮渲染');
    }
  });

  test('@regression debug-002: 检查 settings 状态', async ({ page }) => {
    console.log('[Test] ========== 检查 settings 状态 ==========');

    const result = await page.evaluate(async () => {
      // 检查 settingsStore
      const settingsStore = (window as any).__settingsStore;
      if (!settingsStore) {
        return { error: 'settingsStore not found' };
      }

      const settings = settingsStore.getState();

      console.log('[Test] Settings:', JSON.stringify({
        agentAutoApprove: settings.agentAutoApprove
      }, null, 2));

      return {
        success: true,
        settings: {
          agentAutoApprove: settings.agentAutoApprove
        }
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
  });

  test('@regression debug-003: 模拟真实 Agent 场景 - 通过 agentStore', async ({ page }) => {
    console.log('[Test] ========== 模拟真实 Agent 场景 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      // 清空消息
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      // 🔥 Zustand store 需要通过 getState() 访问方法
      const store = agentStore.getState();
      if (!store.launchAgent) {
        return {
          success: false,
          error: 'launchAgent method not found on agentStore',
          availableMethods: Object.keys(store)
        };
      }

      // 启动一个真实的 Agent
      const agentId = await store.launchAgent(
        'Refactor Agent',
        '重构 README.md 90字左右',
        undefined,
        undefined
      );

      console.log('[Test] Agent ID:', agentId);

      // 等待 Agent 执行
      await new Promise(resolve => setTimeout(resolve, 10000));

      // 检查消息
      const messages = chatStore.getState().messages;
      console.log('[Test] 消息数量:', messages.length);

      // 查找有 toolCalls 的消息
      const messagesWithToolCalls = messages.filter((m: any) => m.toolCalls && m.toolCalls.length > 0);
      console.log('[Test] 有 toolCalls 的消息数量:', messagesWithToolCalls.length);

      if (messagesWithToolCalls.length > 0) {
        const msg = messagesWithToolCalls[messagesWithToolCalls.length - 1];
        const toolCall = msg.toolCalls[0];

        console.log('[Test] 最后一个 toolCall:', JSON.stringify({
          id: toolCall.id,
          tool: toolCall.tool,
          status: toolCall.status,
          isPartial: toolCall.isPartial
        }, null, 2));

        // 检查 DOM
        const approveButtons = Array.from(document.querySelectorAll('button'))
          .filter(b => b.textContent?.includes('批准') || b.textContent?.includes('Approve'));

        return {
          success: true,
          toolCall: {
            tool: toolCall.tool,
            status: toolCall.status,
            isPartial: toolCall.isPartial,
            shouldShowButtons: toolCall.status === 'pending' && !toolCall.isPartial
          },
          approveButtonCount: approveButtons.length,
          issue: toolCall.status === 'pending' && !toolCall.isPartial && approveButtons.length === 0
            ? '条件满足但按钮未显示'
            : null
        };
      }

      return {
        success: true,
        message: '没有 toolCalls 消息'
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    if (result.issue) {
      console.log('[Test] ❌ 问题确认:', result.issue);
    }
  });
});
