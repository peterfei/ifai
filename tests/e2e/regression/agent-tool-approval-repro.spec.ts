/**
 * Agent 工具批准按钮问题还原测试
 *
 * 问题：用户反馈 Agent 执行时批准按钮不显示
 * 截图显示：agent_read_file 工具调用已显示，但没有批准/拒绝按钮
 *
 * 目标：完整还原真实场景，找出根因
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Agent 工具批准按钮问题还原', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      // 捕获所有关键日志
      if (text.includes('AgentStore') ||
          text.includes('ToolApproval') ||
          text.includes('MessageItem') ||
          text.includes('isPartial') ||
          text.includes('tool_call') ||
          text.includes('Rendering message')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 等待应用完全加载
    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForFunction(() => !!(window as any).__agentStore, { timeout: 10000 });

    // 等待 React 应用完全渲染
    await page.waitForFunction(() => {
      const body = document.body;
      return body && (body.innerHTML.includes('class') || body.children.length > 0);
    }, { timeout: 10000 });

    await page.waitForTimeout(500);
  });

  test('@regression repro-001: 完整还原 Agent 执行场景 - 模拟真实后端事件流', async ({ page }) => {
    console.log('[Test] ========== 开始还原 Agent 工具批准按钮问题 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      console.log('[Test] Step 1: 清空现有消息');
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      // 生成唯一 ID
      const userMsgId = crypto.randomUUID();
      const agentId = crypto.randomUUID();
      const agentMsgId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      console.log('[Test] Step 2: 用户发送消息');
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '重构 README.md 90字左右',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('[Test] Step 3: Agent 启动 (模拟后端 launch_agent)');
      // 创建空的 assistant 消息
      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: agentId
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('[Test] Step 4: Agent thinking 流式更新');
      const thinkingContent = '我来重构 README.md 文件，精简到 90 字左右';

      // 模拟 thinking 逐字更新
      for (let i = 1; i <= thinkingContent.length; i++) {
        const chunk = thinkingContent.substring(0, i);
        chatStore.setState((state: any) => ({
          messages: state.messages.map((m: any) =>
            m.id === agentMsgId ? { ...m, content: chunk } : m
          )
        }));
        await new Promise(resolve => setTimeout(resolve, 20));  // 快速模拟
      }

      console.log('[Test] Thinking 完成:', thinkingContent);
      await new Promise(resolve => setTimeout(resolve, 200));

      // 检查 thinking 后的消息状态
      let messages = chatStore.getState().messages;
      let agentMsg = messages.find((m: any) => m.id === agentMsgId);
      console.log('[Test] Thinking 后的消息:', {
        id: agentMsg?.id,
        content: agentMsg?.content,
        hasToolCalls: !!(agentMsg?.toolCalls),
        toolCallsCount: agentMsg?.toolCalls?.length || 0
      });

      console.log('[Test] Step 5: Agent 创建 tool_call (isPartial: true)');
      // 模拟后端发送 tool_call 事件（isPartial: true）
      const partialToolCall = {
        id: toolCallId,
        type: 'function',
        tool: 'agent_read_file',
        args: {
          path: 'README.md'
        },
        function: {
          name: 'agent_read_file',
          arguments: JSON.stringify({ path: 'README.md' })
        },
        status: 'pending' as const,
        isPartial: true,
        agentId: agentId
      };

      // 直接更新 messages
      chatStore.setState((state: any) => ({
        messages: state.messages.map((m: any) =>
          m.id === agentMsgId
            ? { ...m, toolCalls: [partialToolCall] }
            : m
        )
      }));

      await new Promise(resolve => setTimeout(resolve, 200));

      // 检查 isPartial=true 时的状态
      messages = chatStore.getState().messages;
      agentMsg = messages.find((m: any) => m.id === agentMsgId);
      const toolCallAfterPartial = agentMsg?.toolCalls?.[0];
      console.log('[Test] isPartial=true 后的 toolCall:', {
        id: toolCallAfterPartial?.id,
        tool: toolCallAfterPartial?.tool,
        status: toolCallAfterPartial?.status,
        isPartial: toolCallAfterPartial?.isPartial,
        shouldShowButtons: toolCallAfterPartial?.status === 'pending' && !toolCallAfterPartial?.isPartial
      });

      console.log('[Test] Step 6: Agent 完成 tool_call (isPartial: false)');
      // 模拟后端发送 tool_call 事件（isPartial: false）
      const completedToolCall = {
        ...partialToolCall,
        isPartial: false  // 关键变化
      };

      chatStore.setState((state: any) => ({
        messages: state.messages.map((m: any) =>
          m.id === agentMsgId
            ? {
                ...m,
                toolCalls: m.toolCalls?.map((tc: any) =>
                  tc.id === toolCallId ? completedToolCall : tc
                ) || [completedToolCall]
              }
            : m
        )
      }));

      await new Promise(resolve => setTimeout(resolve, 300));  // 等待 React 渲染

      // 检查 isPartial=false 后的状态
      messages = chatStore.getState().messages;
      agentMsg = messages.find((m: any) => m.id === agentMsgId);
      const finalToolCall = agentMsg?.toolCalls?.[0];

      console.log('[Test] ========== 关键状态检查 ==========');
      console.log('[Test] Store 中的 toolCall:', {
        id: finalToolCall?.id,
        tool: finalToolCall?.tool,
        status: finalToolCall?.status,
        isPartial: finalToolCall?.isPartial,
        shouldShowButtons: finalToolCall?.status === 'pending' && !finalToolCall?.isPartial,
        args: finalToolCall?.args
      });

      // 检查 DOM 中的元素
      console.log('[Test] ========== DOM 检查 ==========');

      // 检查消息气泡
      const messageBubble = document.querySelector(`[data-testid="message-${agentMsgId}"]`);
      console.log('[Test] 消息气泡存在:', !!messageBubble);

      // 检查 ToolApproval 卡片
      const toolApprovalCards = document.querySelectorAll('[data-test-id="tool-approval-card"]');
      console.log('[Test] ToolApproval 卡片数量:', toolApprovalCards.length);

      // 检查所有包含 tool-approval 的元素
      const allToolApprovals = document.querySelectorAll('[class*="tool-approval"]');
      console.log('[Test] 所有 tool-approval 元素数量:', allToolApprovals.length);

      // 检查批准按钮
      const approveButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('批准') || b.textContent?.includes('Approve'));
      console.log('[Test] 批准按钮数量:', approveButtons.length);

      // 检查拒绝按钮
      const rejectButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('拒绝') || b.textContent?.includes('Reject'));
      console.log('[Test] 拒绝按钮数量:', rejectButtons.length);

      // 获取 ToolApproval 组件的实际 props（如果存在）
      console.log('[Test] ========== 深度调试 ==========');

      // 尝试从 DOM 中读取 toolCall 的状态
      if (toolApprovalCards.length > 0) {
        const cardHTML = toolApprovalCards[0].innerHTML;
        console.log('[Test] ToolApproval 卡片 HTML (前 2000 字符):', cardHTML.substring(0, 2000));
      }

      // 检查是否有"自动批准"提示
      const autoApproveText = Array.from(document.querySelectorAll('*'))
        .find(el => el.textContent?.includes('自动批准'));
      console.log('[Test] 自动批准提示存在:', !!autoApproveText);

      // 检查 settings 状态
      const settings = (window as any).__settingsStore?.getState();
      console.log('[Test] Auto-approve 设置:', settings?.agentAutoApprove);

      return {
        success: true,
        storeState: {
          toolCall: {
            id: finalToolCall?.id,
            tool: finalToolCall?.tool,
            status: finalToolCall?.status,
            isPartial: finalToolCall?.isPartial
          }
        },
        domState: {
          messageBubbleExists: !!messageBubble,
          toolApprovalCount: toolApprovalCards.length,
          allToolApprovalsCount: allToolApprovals.length,
          approveButtonCount: approveButtons.length,
          rejectButtonCount: rejectButtons.length,
          hasAutoApproveText: !!autoApproveText
        },
        settings: {
          autoApprove: settings?.agentAutoApprove
        },
        issue: (() => {
          // 条件判断
          const isPending = finalToolCall?.status === 'pending';
          const isPartial = finalToolCall?.isPartial;
          const autoApprove = settings?.agentAutoApprove;
          const shouldShow = isPending && !isPartial && !autoApprove;

          if (!shouldShow) {
            return `条件不满足: pending=${isPending}, isPartial=${isPartial}, autoApprove=${autoApprove}`;
          }
          if (approveButtons.length === 0) {
            return '条件满足但按钮未显示（React 渲染问题或组件未收到更新）';
          }
          return null;
        })()
      };
    });

    console.log('[Test] ========== 测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    // 验证结果
    expect(result.success).toBe(true);
    expect(result.storeState.toolCall.isPartial, 'isPartial 应该是 false').toBe(false);
    expect(result.storeState.toolCall.status, 'status 应该是 pending').toBe('pending');

    if (result.issue) {
      console.log('[Test] ❌ 问题确认:', result.issue);
    }

    expect(result.issue, '不应该有问题').toBeNull();
    expect(result.domState.approveButtonCount, '应该有批准按钮').toBeGreaterThan(0);
  });

  test('@regression repro-002: 检查 ToolApproval 组件的 props 传递', async ({ page }) => {
    console.log('[Test] ========== 检查 ToolApproval 组件 props 传递 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 清空消息
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      const agentMsgId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      // 创建带 toolCall 的消息（isPartial: false，应该显示按钮）
      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: '测试消息',
        timestamp: Date.now(),
        agentId: 'test-agent',
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_read_file',
          args: { path: 'README.md' },
          function: { name: 'agent_read_file', arguments: '{"path":"README.md"}' },
          status: 'pending' as const,
          isPartial: false  // 关键：应该是 false
        }]
      });

      await new Promise(resolve => setTimeout(resolve, 300));

      // 读取 store 状态
      const messages = chatStore.getState().messages;
      const msg = messages.find((m: any) => m.id === agentMsgId);
      const toolCall = msg?.toolCalls?.[0];

      console.log('[Test] Store 中的状态:', {
        toolCallId: toolCall?.id,
        status: toolCall?.status,
        isPartial: toolCall?.isPartial,
        shouldShowButtons: toolCall?.status === 'pending' && !toolCall?.isPartial
      });

      // 检查 DOM
      const approveButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('批准') || b.textContent?.includes('Approve'));

      console.log('[Test] DOM 中的批准按钮数量:', approveButtons.length);

      // 🔥 关键检查：尝试获取 React Fiber 的 props
      const messageBubble = document.querySelector(`[data-testid="message-${agentMsgId}"]`);
      if (messageBubble) {
        // 尝试读取 React 内部状态（仅用于调试）
        const fiberKey = Object.keys(messageBubble).find(key =>
          key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
        );

        if (fiberKey) {
          console.log('[Test] 找到 React Fiber:', fiberKey);
          // 注意：这里不能直接读取 fiber 内容，因为它是循环结构
        } else {
          console.log('[Test] 未找到 React Fiber');
        }
      }

      return {
        success: true,
        storeState: {
          status: toolCall?.status,
          isPartial: toolCall?.isPartial
        },
        domState: {
          approveButtonCount: approveButtons.length,
          messageBubbleExists: !!messageBubble
        }
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.storeState.isPartial).toBe(false);
    expect(result.domState.approveButtonCount).toBeGreaterThan(0);
  });
});
