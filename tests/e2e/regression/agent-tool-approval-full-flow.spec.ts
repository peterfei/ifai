/**
 * Agent 工具批准完整流程测试
 *
 * 真实还原用户场景：
 * 1. 用户发送 "重构 README.md 100行左右"
 * 2. Agent 启动并发送 thinking 内容（逐字符流式）
 * 3. Agent 创建 tool_call（isPartial: true → false）
 * 4. 检查 ToolApproval 组件是否正确显示批准按钮
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe.serial('Agent 工具批准完整流程', () => {
  test.beforeEach(async ({ page }) => {
    // 监听所有相关日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('ToolApproval') ||
          text.includes('MessageItem') ||
          text.includes('AgentStore') ||
          text.includes('effectivelyStreaming') ||
          text.includes('isActivelyStreaming') ||
          text.includes('shouldShowButtons')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 等待 stores 可用
    await page.waitForFunction(() => {
      return !!(window as any).__chatStore && !!(window as any).__agentStore;
    }, { timeout: 30000 });  // 🔥 增加超时时间到 30 秒

    await page.waitForTimeout(1000);
  });

  test('@regression agent-full-flow-01: 完整模拟 Agent thinking + tool_call 流程', async ({ page }) => {
    console.log('[Test] ========== 开始完整 Agent 流程测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      if (!chatStore || !agentStore) {
        return { success: false, error: 'stores not available' };
      }

      // 清空现有消息
      chatStore.setState({ messages: [] });

      console.log('[Test] ========== 步骤 1: 用户发送消息 ==========');
      const userInput = '重构 README.md 100行左右';
      const userMsgId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: userInput,
        timestamp: Date.now()
      });

      console.log('[Test] ========== 步骤 2: 创建 Agent 消息 ==========');
      const agentId = crypto.randomUUID();
      const agentMsgId = crypto.randomUUID();

      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: agentId
      });

      // 建立 agent 到 message 的映射
      agentStore.setState((state: any) => ({
        agentToMessageMap: {
          ...state.agentToMessageMap,
          [agentId]: agentMsgId
        }
      }));

      console.log('[Test] ========== 步骤 3: 模拟 Thinking 逐字符流式 ==========');
      const thinkingText = '我来帮您重构 README.md 文件，将其精简到 100 行左右。';
      const thinkingDelay = 50; // 每 50ms 一个字符

      // 逐字符添加 thinking 内容
      for (let i = 0; i < thinkingText.length; i++) {
        await new Promise(resolve => setTimeout(resolve, thinkingDelay));
        const char = thinkingText[i];
        const messages = chatStore.getState().messages;
        const updatedMessages = messages.map((m: any) => {
          if (m.id === agentMsgId) {
            return { ...m, content: (m.content || '') + char };
          }
          return m;
        });
        chatStore.setState({ messages: updatedMessages });
      }

      console.log('[Test] Thinking 完成，内容长度:', thinkingText.length);

      // 等待一下，让 React 完成渲染
      await new Promise(resolve => setTimeout(resolve, 200));

      // 检查 thinking 后的状态
      let messages = chatStore.getState().messages;
      let agentMsg = messages.find((m: any) => m.id === agentMsgId);
      console.log('[Test] Thinking 后消息状态:', {
        hasContent: !!agentMsg?.content,
        contentLength: agentMsg?.content?.length || 0,
        hasToolCalls: !!(agentMsg?.toolCalls && agentMsg.toolCalls.length > 0)
      });

      console.log('[Test] ========== 步骤 4: 创建 tool_call (isPartial: true) ==========');
      const toolCallId = crypto.randomUUID();

      // 创建流式工具调用
      chatStore.setState((state: any) => ({
        messages: state.messages.map(m =>
          m.id === agentMsgId ? {
            ...m,
            toolCalls: [{
              id: toolCallId,
              type: 'function',
              tool: 'agent_read_file',
              args: { path: 'README.md' },
              function: { name: 'agent_read_file', arguments: '{"path":"README.md"}' },
              status: 'pending',
              isPartial: true,  // 🔥 流式状态
              agentId: agentId
            }]
          } : m
        )
      }));

      await new Promise(resolve => setTimeout(resolve, 100));

      messages = chatStore.getState().messages;
      agentMsg = messages.find((m: any) => m.id === agentMsgId);
      const partialToolCall = agentMsg?.toolCalls?.[0];
      console.log('[Test] Tool_call (partial=true) 状态:', {
        hasToolCall: !!partialToolCall,
        status: partialToolCall?.status,
        isPartial: partialToolCall?.isPartial
      });

      console.log('[Test] ========== 步骤 5: 完成 tool_call (isPartial: false) ==========');

      // 模拟工具参数完成，设置 isPartial: false
      // 🔥 关键修复：创建全新的 toolCalls 数组，确保 React 能检测到变化
      chatStore.setState((state: any) => {
        const updatedMessages = state.messages.map(m => {
          if (m.id === agentMsgId) {
            // 创建全新的 toolCalls 数组，每个元素都是新对象
            const newToolCalls = (m.toolCalls || []).map(tc =>
              tc.id === toolCallId
                ? {
                    ...tc,
                    isPartial: false,
                    args: { path: 'README.md', lines: 100 }
                  }
                : { ...tc }  // 🔥 也创建其他 toolCalls 的新对象
            );
            // 返回全新的消息对象
            return {
              ...m,
              toolCalls: newToolCalls
            };
          }
          return m;
        });

        console.log('[Test] State update: 创建了全新的 messages 数组');
        return { messages: updatedMessages };
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 🔥 关键检查：在更新 isPartial 后，检查 store 中的 toolCall 状态
      messages = chatStore.getState().messages;
      agentMsg = messages.find((m: any) => m.id === agentMsgId);
      const toolCallAfterUpdate = agentMsg?.toolCalls?.[0];

      console.log('[Test] 🔥 isPartial 更新后的 toolCall 状态:', {
        id: toolCallAfterUpdate?.id,
        status: toolCallAfterUpdate?.status,
        isPartial: toolCallAfterUpdate?.isPartial,
        // 检查是否真的更新了
        isPartialActuallyFalse: toolCallAfterUpdate?.isPartial === false
      });

      // 使用 toolCallAfterUpdate 作为 finalToolCall
      const finalToolCall = toolCallAfterUpdate;
      console.log('[Test] Tool_call (partial=false) 最终状态:', {
        id: finalToolCall?.id,
        tool: finalToolCall?.tool,
        status: finalToolCall?.status,
        isPartial: finalToolCall?.isPartial
      });

      console.log('[Test] ========== 步骤 6: 检查 DOM 中的 ToolApproval ==========');

      // 等待 DOM 更新
      await new Promise(resolve => setTimeout(resolve, 300));

      // 检查 ToolApproval 卡片
      const toolApprovalCards = document.querySelectorAll('[data-test-id="tool-approval-card"]');
      console.log('[Test] ToolApproval 卡片数量:', toolApprovalCards.length);

      // 检查批准按钮
      const allButtons = Array.from(document.querySelectorAll('button'));
      const approveButtons = allButtons.filter(b =>
        b.textContent?.includes('批准') || b.textContent?.includes('Approve')
      );
      console.log('[Test] 批准按钮数量:', approveButtons.length);

      // 打印所有按钮的文本
      const allButtonTexts = allButtons.map(b => b.textContent?.trim()).filter(t => t);
      console.log('[Test] 页面所有按钮:', allButtonTexts.slice(0, 20)); // 只打印前 20 个

      // 检查 ToolApproval 组件的条件
      const isPending = finalToolCall?.status === 'pending';
      const isPartial = finalToolCall?.isPartial;
      const shouldShowButtons = isPending && !isPartial;

      console.log('[Test] ToolApproval 按钮显示条件:', {
        isPending,
        isPartial,
        shouldShowButtons,
        condition: `isPending=${isPending} && !isPartial=${!isPartial} = ${shouldShowButtons}`
      });

      return {
        success: true,
        flowSteps: {
          userMessage: { id: userMsgId, content: userInput },
          agentMessage: { id: agentMsgId, agentId },
          thinking: { text: thinkingText, length: thinkingText.length },
          toolCall: {
            id: finalToolCall?.id,
            tool: finalToolCall?.tool,
            status: finalToolCall?.status,
            isPartial: finalToolCall?.isPartial
          }
        },
        domCheck: {
          toolApprovalCardCount: toolApprovalCards.length,
          approveButtonCount: approveButtons.length,
          allButtonsPreview: allButtonTexts.slice(0, 10)
        },
        conditionCheck: {
          isPending,
          isPartial,
          shouldShowButtons
        },
        issue: !shouldShowButtons ? '条件不满足' :
               approveButtons.length === 0 ? '条件满足但无批准按钮（渲染问题）' :
               null
      };
    });

    console.log('[Test] ========== 测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    // 验证流程步骤
    expect(result.flowSteps.thinking.length).toBeGreaterThan(0);
    expect(result.flowSteps.toolCall.status).toBe('pending');
    expect(result.flowSteps.toolCall.isPartial).toBe(false);

    // 验证显示条件
    expect(result.conditionCheck.shouldShowButtons, '批准按钮显示条件应该满足').toBe(true);

    // 最终断言
    if (result.issue) {
      console.log('[Test] ⚠️ 发现问题:', result.issue);
    }

    expect(result.issue, '不应该有问题').toBeNull();

    console.log('[Test] ✅ 测试完成');
  });

  test('@regression agent-full-flow-02: 模拟无 content 的 Agent 消息', async ({ page }) => {
    console.log('[Test] ========== 测试无 content 的 Agent 消息 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 清空现有消息 - 逐个删除以确保 React 状态正确更新
      const currentMessages = chatStore.getState().messages;
      console.log('[Test] 清空前消息数量:', currentMessages.length);
      for (const msg of currentMessages) {
        console.log('[Test] 删除消息:', msg.id);
        chatStore.getState().deleteMessage?.(msg.id);
      }
      // 验证已清空
      const afterDelete = chatStore.getState().messages;
      console.log('[Test] 删除后消息数量:', afterDelete.length);
      // 等待 React 状态更新
      await new Promise(resolve => setTimeout(resolve, 200));

      const agentMsgId = 'agent-no-content-1';
      const agentId = 'agent-no-content';

      // 创建没有 content 但有 toolCalls 的 Agent 消息
      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: '',  // 🔥 空 content
        contentSegments: [],  // 🔥 显式设置空 contentSegments
        timestamp: Date.now(),
        agentId: agentId,
        toolCalls: [{
          id: 'tc-no-content-1',
          type: 'function',
          tool: 'agent_read_file',
          args: { path: 'README.md' },
          function: { name: 'agent_read_file', arguments: '{"path":"README.md"}' },
          status: 'pending',
          isPartial: false,  // 🔥 已完成，等待批准
          agentId: agentId
        }]
      });

      // 等待 DOM 更新
      await new Promise(resolve => setTimeout(resolve, 300));

      // 检查 DOM - 查询两种可能的 data-testid
      const toolApprovalCards = document.querySelectorAll('[data-test-id="tool-approval-card"], [data-testid="tool-batch-card"], [data-testid="tool-approval-card"]');
      const approveButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('批准') || b.textContent?.includes('Approve'));

      // 检查消息状态
      const messages = chatStore.getState().messages;
      const agentMsg = messages.find((m: any) => m.id === agentMsgId);
      const toolCall = agentMsg?.toolCalls?.[0];

      const hasContent = agentMsg?.content && agentMsg.content.trim().length > 0;
      const hasToolCalls = agentMsg?.toolCalls && agentMsg.toolCalls.length > 0;
      const shouldHideBubble = !!(agentMsg?.agentId) === false && !hasContent && hasToolCalls;

      console.log('[Test] 无 content 消息检查:', {
        hasContent,
        hasToolCalls,
        shouldHideBubble,
        toolApprovalCount: toolApprovalCards.length,
        approveButtonCount: approveButtons.length
      });

      return {
        success: true,
        messageState: {
          hasContent,
          hasToolCalls,
          shouldHideBubble
        },
        toolCall: {
          status: toolCall?.status,
          isPartial: toolCall?.isPartial
        },
        domCheck: {
          toolApprovalCount: toolApprovalCards.length,
          approveButtonCount: approveButtons.length
        }
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    // 验证 ToolApproval 组件存在
    expect(result.domCheck.toolApprovalCount).toBeGreaterThan(0);

    console.log('[Test] ✅ 无 content 消息测试完成');
  });
});
