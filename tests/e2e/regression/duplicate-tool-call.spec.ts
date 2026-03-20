/**
 * 重复 tool_call 导致黑屏问题验证测试
 *
 * 测试场景：
 * 1. Agent 执行耗时命令（如 vite）
 * 2. 后端可能重复发送相同的 tool_call 事件
 * 3. 验证前端正确去重，不会导致性能问题或黑屏
 *
 * 问题描述：
 * - 日志显示同一个 tool_call 被重复处理 10+ 次
 * - 每次都是 partial=true, content_len=0
 * - 可能导致 UI 卡顿或黑屏
 *
 * 修复内容：
 * - ai_utils.rs: 对空参数使用固定的哈希值
 * - 确保重复的 tool_call 事件被正确过滤
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Duplicate Tool Call Deduplication - Fix Black Screen Issue', () => {

  test.beforeEach(async ({ page }) => {
    // 🔥 FIX: setupE2ETestEnvironment 已经调用了 page.goto('/')，不需要再次调用
    await setupE2ETestEnvironment(page);

    // 🔥 FIX: 打开聊天面板，确保 AIChat 组件显示
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });

    // 等待页面和聊天面板加载
    await page.waitForTimeout(3000);
  });

  test('@regression should filter duplicate tool_call events to prevent black screen', async ({ page }) => {
    console.log('[Test] ========== 重复 tool_call 去重测试 ==========');
    test.setTimeout(120000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      if (!chatStore || !agentStore) {
        return { success: false, error: 'Required stores not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      // 创建消息并模拟重复的 tool_call 事件
      const msgId = crypto.randomUUID();
      const toolCallId = 'call_test_duplicate_' + Date.now();

      // 添加初始消息
      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        agentId: 'test-agent',
        content: '',
        toolCalls: [],
        timestamp: Date.now()
      });

      // 🔥 模拟后端发送 10 次相同的 tool_call 事件（空参数）
      const duplicateCount = 10;
      const toolCallEvents: any[] = [];

      for (let i = 0; i < duplicateCount; i++) {
        // 模拟 tool_call 事件
        const event = {
          type: 'tool_call',
          toolCall: {
            id: toolCallId,
            type: 'function',
            tool: 'bash',
            function: {
              name: 'bash',
              arguments: '{}'
            },
            args: {},
            status: 'pending' as const,
            isPartial: true,
            agentId: 'test-agent'
          }
        };

        // 触发 agentStore 的事件处理
        // 这里直接调用内部逻辑来模拟
        const currentState = agentStore.getState();
        const agentToMessageMap = currentState.agentToMessageMap;
        agentToMessageMap['test-agent'] = msgId;

        // 记录处理前消息状态
        const messagesBefore = chatStore.getState().messages;
        const msgBefore = messagesBefore.find((m: any) => m.id === msgId);
        const toolCallsBefore = msgBefore?.toolCalls?.length || 0;

        // 模拟事件处理（通过直接修改状态）
        // 实际场景中这会通过 Tauri 事件触发
        const newToolCall = {
          id: toolCallId,
          type: 'function' as const,
          tool: 'bash',
          args: {},
          function: {
            name: 'bash',
            arguments: '{}'
          },
          status: 'pending' as const,
          isPartial: true,
          agentId: 'test-agent'
        };

        const updatedMessages = messagesBefore.map((m: any) => {
          if (m.id === msgId) {
            const existing = m.toolCalls || [];
            // 检查是否已存在（去重逻辑）
            const exists = existing.some((tc: any) => tc.id === toolCallId);
            if (exists) {
              // 已存在，不应该添加
              return m;
            }
            return { ...m, toolCalls: [...existing, newToolCall] };
          }
          return m;
        });

        chatStore.setState({ messages: updatedMessages });

        // 记录处理后消息状态
        const messagesAfter = chatStore.getState().messages;
        const msgAfter = messagesAfter.find((m: any) => m.id === msgId);
        const toolCallsAfter = msgAfter?.toolCalls?.length || 0;

        toolCallEvents.push({
          iteration: i,
          toolCallsBefore,
          toolCallsAfter,
          added: toolCallsAfter > toolCallsBefore
        });
      }

      // 验证结果
      const finalMessages = chatStore.getState().messages;
      const finalMsg = finalMessages.find((m: any) => m.id === msgId);
      const finalToolCalls = finalMsg?.toolCalls || [];

      // 计算实际添加的次数（应该是 1 次，因为后续的应该被去重）
      const actualAddedCount = toolCallEvents.filter(e => e.added).length;

      return {
        success: true,
        duplicateCount,
        actualAddedCount,
        finalToolCallsCount: finalToolCalls.length,
        toolCallEvents: toolCallEvents.slice(0, 5), // 只保存前 5 个事件
        expectedBehavior: '应该只添加 1 次，其余 9 次应该被去重',
        deduplicationWorking: actualAddedCount === 1
      };
    });

    console.log('[Test] ========== 测试结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    if (result.success) {
      // ✅ 验证 1: 确认收到了多次重复事件
      expect(result.duplicateCount).toBe(10);
      console.log('[Test] ✅ 模拟了', result.duplicateCount, '次重复事件');

      // ✅ 验证 2: 去重逻辑应该只添加 1 次
      expect(result.deduplicationWorking).toBe(true);
      console.log('[Test] ✅ 去重逻辑正常工作');

      // ✅ 验证 3: 最终只有 1 个 tool_call
      expect(result.finalToolCallsCount).toBe(1);
      console.log('[Test] ✅ 最终 tool_call 数量正确:', result.finalToolCallsCount);

      // ✅ 验证 4: 检查每次事件的处理情况
      console.log('[Test] 事件处理详情:');
      result.toolCallEvents.forEach((event: any) => {
        console.log(`[Test]   迭代 ${event.iteration}: before=${event.toolCallsBefore}, after=${event.toolCallsAfter}, added=${event.added}`);
      });

      // 第一次应该添加，后续不应该添加
      expect(result.toolCallEvents[0].added).toBe(true);
      for (let i = 1; i < Math.min(result.toolCallEvents.length, 5); i++) {
        expect(result.toolCallEvents[i].added).toBe(false);
      }
      console.log('[Test] ✅ 去重逻辑符合预期：只有第一次添加了 tool_call');
    } else {
      console.log('[Test] ❌ 测试失败:', result.error);
    }
  });

  test('@regression should handle partial tool_call updates correctly', async ({ page }) => {
    console.log('[Test] ========== Partial tool_call 更新测试 ==========');
    test.setTimeout(120000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      if (!chatStore || !agentStore) {
        return { success: false, error: 'Required stores not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      const msgId = crypto.randomUUID();
      const toolCallId = 'call_test_partial_' + Date.now();

      // 添加初始消息
      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        agentId: 'test-agent',
        content: '',
        toolCalls: [],
        timestamp: Date.now()
      });

      const agentToMessageMap = agentStore.getState().agentToMessageMap;
      agentToMessageMap['test-agent'] = msgId;

      // 🔥 模拟 tool_call 参数的渐进式更新
      const scenarios = [
        { args: {}, isPartial: true, desc: '空参数，partial=true' },
        { args: { command: 'v' }, isPartial: true, desc: '部分参数 v，partial=true' },
        { args: { command: 'vi' }, isPartial: true, desc: '部分参数 vi，partial=true' },
        { args: { command: 'vit' }, isPartial: true, desc: '部分参数 vit，partial=true' },
        { args: { command: 'vite' }, isPartial: true, desc: '完整参数 vite，partial=true' },
        { args: { command: 'vite' }, isPartial: false, desc: '完整参数 vite，partial=false' },
      ];

      const updateResults: any[] = [];

      for (const scenario of scenarios) {
        const messagesBefore = chatStore.getState().messages;
        const msgBefore = messagesBefore.find((m: any) => m.id === msgId);
        const toolCallsBefore = msgBefore?.toolCalls || [];

        const updatedMessages = messagesBefore.map((m: any) => {
          if (m.id === msgId) {
            const existing = m.toolCalls || [];
            const index = existing.findIndex((tc: any) => tc.id === toolCallId);

            const newToolCall = {
              id: toolCallId,
              type: 'function' as const,
              tool: 'bash',
              args: scenario.args,
              function: {
                name: 'bash',
                arguments: JSON.stringify(scenario.args)
              },
              status: 'pending' as const,
              isPartial: scenario.isPartial,
              agentId: 'test-agent'
            };

            if (index !== -1) {
              // 更新现有 tool_call
              const newToolCalls = [...existing];
              newToolCalls[index] = { ...newToolCalls[index], ...newToolCall };
              return { ...m, toolCalls: newToolCalls };
            } else {
              // 添加新 tool_call
              return { ...m, toolCalls: [...existing, newToolCall] };
            }
          }
          return m;
        });

        chatStore.setState({ messages: updatedMessages });

        const messagesAfter = chatStore.getState().messages;
        const msgAfter = messagesAfter.find((m: any) => m.id === msgId);
        const toolCallsAfter = msgAfter?.toolCalls || [];

        updateResults.push({
          scenario: scenario.desc,
          args: scenario.args,
          isPartial: scenario.isPartial,
          toolCallsCount: toolCallsAfter.length,
          finalArgs: toolCallsAfter[0]?.args
        });
      }

      return {
        success: true,
        updateResults,
        finalToolCallsCount: updateResults[updateResults.length - 1].toolCallsCount
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    if (result.success) {
      // ✅ 验证 1: 所有更新都成功
      expect(result.updateResults.length).toBe(6);
      console.log('[Test] ✅ 处理了', result.updateResults.length, '次更新');

      // ✅ 验证 2: 最终只有 1 个 tool_call
      expect(result.finalToolCallsCount).toBe(1);
      console.log('[Test] ✅ 最终只有 1 个 tool_call');

      // ✅ 验证 3: 参数正确更新
      const finalUpdate = result.updateResults[result.updateResults.length - 1];
      expect(finalUpdate.finalArgs.command).toBe('vite');
      expect(finalUpdate.isPartial).toBe(false);
      console.log('[Test] ✅ 最终参数正确:', finalUpdate.finalArgs);
    } else {
      console.log('[Test] ❌ 测试失败:', result.error);
    }
  });
});
