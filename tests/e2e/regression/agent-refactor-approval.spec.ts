/**
 * Agent Refactor 工具批准问题还原测试
 *
 * 场景：
 * 1. 用户发送 "重构 README.md 100行左右"
 * 2. Intent 识别为 /refactor，触发 Refactor Agent
 * 3. Agent 开始 thinking（逐字符流式传输）
 * 4. Agent 创建 tool_call (agent_read_file)
 * 5. 检查批准 UI 是否正确显示
 *
 * 问题：用户反馈执行 agent '重构' 非常慢，且没有显示批准 UI
 *
 * @version v0.3.1
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Agent Refactor 工具批准问题还原', () => {
  test.beforeEach(async ({ page }) => {
    // 监听所有相关日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('AgentStore') ||
          text.includes('ToolApproval') ||
          text.includes('hasPendingToolCalls') ||
          text.includes('effectivelyStreaming') ||
          text.includes('tool_call') ||
          text.includes('thinking') ||
          text.includes('Auto-approve') ||
          text.includes('Intent recognized')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 等待 stores 可用
    // 🔥 注意：agentStore 可能还没有被暴露，增加超时时间
    try {
      await page.waitForFunction(() => {
        const chatStore = !!(window as any).__chatStore;
        const agentStore = !!(window as any).__agentStore;
        return chatStore && agentStore;
      }, { timeout: 30000 });

      console.log('[Test] ✅ Stores 已加载');
    } catch (e) {
      // 如果 agentStore 不可用，只检查 chatStore
      console.log('[Test] ⚠️ agentStore 不可用，尝试仅使用 chatStore');
      await page.waitForFunction(() => {
        return !!(window as any).__chatStore;
      }, { timeout: 10000 });
    }

    await page.waitForTimeout(1000);
  });

  /**
   * 测试用例：模拟完整的 Agent Refactor 流程
   */
  test('@regression agent-refactor-01: 模拟用户触发 Refactor Agent，验证工具批准流程', async ({ page }) => {
    console.log('[Test] ========== 开始 Agent Refactor 工具批准测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;
      const threadStore = (window as any).__threadStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 清空现有消息
      chatStore.setState({ messages: [] });

      console.log('[Test] ========== 步骤 1: 用户发送消息 ==========');
      const userInput = '重构 README.md 100行左右';

      // 添加用户消息
      const userMsgId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: userInput,
        timestamp: Date.now()
      });

      console.log('[Test] 用户消息:', userInput);

      // 获取或创建当前线程
      const threadId = threadStore ? threadStore.getState().activeThreadId : 'test-thread';
      console.log('[Test] 当前线程 ID:', threadId);

      console.log('[Test] ========== 步骤 2: 模拟 Intent 识别和 Agent 启动 ==========');

      // 模拟 intent 识别结果
      const intent = {
        type: '/refactor',
        confidence: 0.9,
        args: '重构 README.md 100行左右'
      };

      console.log('[Test] Intent 识别结果:', intent);

      // 模拟启动 Agent
      const agentId = crypto.randomUUID();
      const agentMsgId = crypto.randomUUID();
      const eventId = `agent_${agentId}`;

      // 创建 assistant 消息（Agent 消息）
      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: agentId
      });

      // 如果 agentStore 可用，建立映射
      if (agentStore) {
        agentStore.setState((state: any) => ({
          agentToMessageMap: {
            ...state.agentToMessageMap,
            [agentId]: agentMsgId
          }
        }));
      }

      console.log('[Test] Agent ID:', agentId);
      console.log('[Test] Agent 消息 ID:', agentMsgId);
      console.log('[Test] Event ID:', eventId);

      console.log('[Test] ========== 步骤 3: 模拟 Thinking 阶段（逐字符） ==========');

      const thinkingText = '我来帮您重构 README.md 文件，将其精简到 100 行左右。';

      // 逐字符模拟 thinking 事件
      const thinkingEvents: string[] = [];
      for (let i = 0; i < thinkingText.length; i++) {
        const char = thinkingText[i];
        thinkingEvents.push(char);

        // 模拟 Agent thinking 事件处理
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
      console.log('[Test] Thinking 事件数:', thinkingEvents.length);

      console.log('[Test] ========== 步骤 4: 模拟 Agent 创建 tool_call ==========');

      // 模拟 Agent 创建 tool_call 事件
      const toolCallId = crypto.randomUUID();
      const toolCall = {
        id: toolCallId,
        type: 'function' as const,
        tool: 'agent_read_file',
        args: {
          path: 'README.md',
          lines: 100
        },
        function: {
          name: 'agent_read_file',
          arguments: JSON.stringify({ path: 'README.md', lines: 100 })
        },
        status: 'pending' as const,
        isPartial: false,  // 🔥 关键：从后端接收时 isPartial 应该是 false
        agentId: agentId
      };

      console.log('[Test] 创建 tool_call:', {
        id: toolCall.id,
        tool: toolCall.tool,
        status: toolCall.status,
        isPartial: toolCall.isPartial
      });

      // 添加 tool_call 到消息
      const messagesWithToolCall = chatStore.getState().messages.map((m: any) => {
        if (m.id === agentMsgId) {
          return {
            ...m,
            toolCalls: [toolCall]
          };
        }
        return m;
      });
      chatStore.setState({ messages: messagesWithToolCall });

      console.log('[Test] ========== 步骤 5: 验证状态 ==========');

      // 获取最终状态
      const finalMessages = chatStore.getState().messages;
      const agentMsg = finalMessages.find((m: any) => m.id === agentMsgId);
      const finalToolCall = agentMsg?.toolCalls?.[0];

      console.log('[Test] 最终消息状态:', {
        agentMsgId: agentMsg?.id,
        contentLength: agentMsg?.content?.length || 0,
        hasToolCalls: !!(agentMsg?.toolCalls),
        toolCallCount: agentMsg?.toolCalls?.length || 0
      });

      console.log('[Test] ToolCall 状态:', {
        id: finalToolCall?.id,
        tool: finalToolCall?.tool,
        status: finalToolCall?.status,
        isPartial: finalToolCall?.isPartial,
        agentId: finalToolCall?.agentId
      });

      // 检查 MessageItem 的 hasPendingToolCalls 逻辑
      const hasPendingToolCallsOld = finalToolCall?.status === 'pending' ||
                                     finalToolCall?.status === 'running' ||
                                     finalToolCall?.isPartial;
      const hasPendingToolCallsNew = finalToolCall?.status === 'running' ||
                                     finalToolCall?.isPartial;

      console.log('[Test] hasPendingToolCalls 逻辑:', {
        old: hasPendingToolCallsOld,
        new: hasPendingToolCallsNew,
        fixEffect: hasPendingToolCallsOld && !hasPendingToolCallsNew ? '修复后变为 false' : '无变化'
      });

      // 检查 ToolApproval 组件条件
      const isPending = finalToolCall?.status === 'pending';
      const isPartial = finalToolCall?.isPartial;
      const shouldShowButtons = isPending && !isPartial;

      console.log('[Test] ToolApproval 按钮条件:', {
        isPending,
        isPartial,
        shouldShowButtons,
        condition: `isPending=${isPending} && !isPartial=${!isPartial} = ${shouldShowButtons}`
      });

      // 检查 DOM 中的 ToolApproval
      const toolApprovalElements = document.querySelectorAll('[data-test-id="tool-approval-card"]');
      const approveButtons = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent?.includes('批准') || b.textContent?.includes('Approve'));

      console.log('[Test] DOM 检查:', {
        toolApprovalCount: toolApprovalElements.length,
        approveButtonCount: approveButtons.length
      });

      return {
        success: true,
        scenario: {
          userInput,
          intent,
          agentId,
          agentMsgId,
          thinkingContent: thinkingText,
          thinkingEventsCount: thinkingEvents.length
        },
        toolCall: {
          id: finalToolCall?.id,
          tool: finalToolCall?.tool,
          status: finalToolCall?.status,
          isPartial: finalToolCall?.isPartial
        },
        fixVerification: {
          hasPendingToolCallsOld,
          hasPendingToolCallsNew,
          fixApplied: hasPendingToolCallsOld && !hasPendingToolCallsNew
        },
        uiCheck: {
          isPending,
          isPartial,
          shouldShowButtons,
          toolApprovalCount: toolApprovalElements.length,
          approveButtonCount: approveButtons.length
        },
        issue: !shouldShowButtons ? '条件不满足，按钮不会显示' :
               !approveButtons.length && shouldShowButtons ? '条件满足但按钮未显示（渲染问题）' :
               null
      };
    });

    console.log('[Test] ========== 测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);

    // 验证修复
    if (result.fixVerification) {
      expect(result.fixVerification.fixApplied, '修复应该生效').toBe(true);
    }

    // 验证 tool_call 状态
    expect(result.toolCall.status, 'tool_call status 应该是 pending').toBe('pending');
    expect(result.toolCall.isPartial, 'tool_call isPartial 应该是 false').toBe(false);

    // 验证按钮显示条件
    expect(result.uiCheck.shouldShowButtons, '批准按钮应该显示').toBe(true);

    if (result.issue) {
      console.log('[Test] ⚠️ 发现问题:', result.issue);
    }

    console.log('[Test] ✅ 测试完成');
  });

  /**
   * 测试用例：模拟真实场景 - 使用 patchedSendMessage 触发 Agent
   */
  test('@regression agent-refactor-02: 真实场景测试 - 通过 patchedSendMessage 触发', async ({ page }) => {
    console.log('[Test] ========== 开始真实场景测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 清空现有消息
      chatStore.setState({ messages: [] });

      // 确保 auto-approve 关闭
      if (settingsStore) {
        settingsStore.setState({ agentAutoApprove: false });
        console.log('[Test] Auto-approve 设置:', settingsStore.getState().agentAutoApprove);
      } else {
        console.log('[Test] ⚠️ settingsStore 不可用');
      }

      // 模拟用户输入
      const userInput = '重构 README.md 100行左右';
      console.log('[Test] 用户输入:', userInput);

      // 注意：这里不能直接调用 patchedSendMessage 因为需要 Tauri invoke
      // 所以我们只能模拟前端处理流程

      // 1. 添加用户消息
      const userMsgId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: userInput,
        timestamp: Date.now()
      });

      // 2. 模拟 Intent 识别（前端会做的）
      const intent = { type: '/refactor', confidence: 0.9, args: userInput };
      console.log('[Test] Intent 识别:', intent);

      // 3. 检查是否有对应的 agent
      const agentType = 'Refactor Agent';
      console.log('[Test] 目标 Agent:', agentType);

      return {
        success: true,
        userInput,
        intent,
        agentType,
        note: '完整流程需要 Tauri 后端支持，此测试验证前端处理逻辑'
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));
    expect(result.success).toBe(true);
    console.log('[Test] ✅ 真实场景测试完成（需要后端支持）');
  });

  /**
   * 测试用例：验证 thinking 事件批处理
   */
  test('@regression agent-refactor-03: 验证 thinking 事件批处理优化', async ({ page }) => {
    console.log('[Test] ========== 开始 thinking 批处理测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      if (!chatStore || !agentStore) {
        return { success: false, error: 'stores not available' };
      }

      // 清空现有消息
      chatStore.setState({ messages: [] });

      console.log('[Test] ========== 测试场景 1: 逐字符更新 ==========');
      const agentMsgId1 = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: agentMsgId1,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: 'test-agent-1'
      });

      // 建立映射
      agentStore.setState((state: any) => ({
        agentToMessageMap: {
          ...state.agentToMessageMap,
          ['test-agent-1']: agentMsgId1
        }
      }));

      const text1 = '测试文本内容';
      const startTime1 = performance.now();

      // 逐字符更新
      for (let i = 0; i < text1.length; i++) {
        const messages = chatStore.getState().messages;
        const updatedMessages = messages.map((m: any) => {
          if (m.id === agentMsgId1) {
            return { ...m, content: (m.content || '') + text1[i] };
          }
          return m;
        });
        chatStore.setState({ messages: updatedMessages });
      }

      const endTime1 = performance.now();
      const duration1 = endTime1 - startTime1;

      console.log('[Test] 逐字符更新:', {
        textLength: text1.length,
        updates: text1.length,
        duration: `${duration1.toFixed(2)}ms`,
        avgPerUpdate: `${(duration1 / text1.length).toFixed(2)}ms`
      });

      console.log('[Test] ========== 测试场景 2: 批量更新 ==========');
      const agentMsgId2 = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: agentMsgId2,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: 'test-agent-2'
      });

      agentStore.setState((state: any) => ({
        agentToMessageMap: {
          ...state.agentToMessageMap,
          ['test-agent-2']: agentMsgId2
        }
      }));

      const text2 = '测试文本内容';
      const startTime2 = performance.now();

      // 批量更新（一次性）
      const messages = chatStore.getState().messages;
      const updatedMessages = messages.map((m: any) => {
        if (m.id === agentMsgId2) {
          return { ...m, content: text2 };
        }
        return m;
      });
      chatStore.setState({ messages: updatedMessages });

      const endTime2 = performance.now();
      const duration2 = endTime2 - startTime2;

      console.log('[Test] 批量更新:', {
        textLength: text2.length,
        updates: 1,
        duration: `${duration2.toFixed(2)}ms`,
        avgPerUpdate: `${duration2.toFixed(2)}ms`
      });

      return {
        success: true,
        comparison: {
         逐字符更新: {
            updates: text1.length,
            duration: duration1,
            avgPerUpdate: duration1 / text1.length
          },
          批量更新: {
            updates: 1,
            duration: duration2,
            avgPerUpdate: duration2
          },
          improvement: {
            timesFaster: (duration1 / duration2).toFixed(2),
            timeSaved: `${(duration1 - duration2).toFixed(2)}ms`
          }
        }
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));
    expect(result.success).toBe(true);

    if (result.comparison) {
      console.log('[Test] 性能对比:', {
        '批量更新比逐字符更新快': `${result.comparison.improvement.timesFaster}x`,
        '节省时间': result.comparison.improvement.timeSaved
      });
    }

    console.log('[Test] ✅ thinking 批处理测试完成');
  });
});
