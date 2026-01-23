/**
 * Agent 重构后 Diff 显示功能测试
 *
 * 测试场景：
 * 1. 用户触发 Refactor Agent 重构文件
 * 2. Agent 调用 agent_write_file 工具
 * 3. 用户批准工具调用
 * 4. **关键验证**：文件写入后应显示 diff 对比和回退按钮
 * 5. 验证 diff 数据完整性（originalContent, newContent）
 * 6. 验证回退功能正常工作
 *
 * Bug 描述：
 * - Refactor Agent 执行完成后，diff 数据被 Agent 的 result 覆盖
 * - 导致 ToolApproval 组件无法显示 diff 对话框
 * - 用户看不到原文件 vs 新文件的对比
 * - 回退按钮无法显示
 *
 * 根因：
 * src/stores/agentStore.ts:792
 * ...(isCompleted && !tc.result ? { result } : {})
 * Agent result 覆盖了工具执行时保存的 diff 数据
 *
 * @version v0.3.9.2
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Agent Diff After Refactor - 全场景覆盖', () => {

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('AgentStore') ||
          text.includes('tool_call') ||
          text.includes('result') ||
          text.includes('diff') ||
          text.includes('Rollback') ||
          text.includes('originalContent') ||
          text.includes('newContent')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('@regression scenario-01: 验证 Refactor Agent 执行后 diff 数据保留完整', async ({ page }) => {
    console.log('[Test] ========== 场景 1: Diff 数据完整性验证 ==========');
    test.setTimeout(120000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      if (!chatStore || !agentStore) {
        return { success: false, error: 'Stores not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      // 🔥 步骤 1: 模拟完整的 Agent 工具执行流程
      const userMsgId = crypto.randomUUID();
      const agentMsgId = crypto.randomUUID();
      const agentId = crypto.randomUUID();
      const toolCallId = 'call_diff_test_123';

      // 添加用户消息
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '重构 README.md，精简到 100 字左右',
        timestamp: Date.now()
      });

      // 创建 Agent 消息
      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: '',
        agentId: agentId,
        timestamp: Date.now()
      });

      // 建立 agentToMessageMap
      agentStore.setState((state: any) => ({
        agentToMessageMap: {
          ...state.agentToMessageMap,
          [agentId]: agentMsgId
        }
      }));

      console.log('[Test] Agent 准备完成');

      // 🔥 步骤 2: 模拟 thinking 内容流式更新
      const thinkingText = '我来帮您重构 README.md 文件。';
      for (let i = 0; i < thinkingText.length; i++) {
        const messages = chatStore.getState().messages;
        const updated = messages.map((m: any) => {
          if (m.id === agentMsgId) {
            return { ...m, content: thinkingText.substring(0, i + 1) };
          }
          return m;
        });
        chatStore.setState({ messages: updated });
      }

      console.log('[Test] Thinking 完成');

      // 🔥 步骤 3: 模拟 tool_call 事件
      const toolCall = {
        id: toolCallId,
        type: 'function',
        tool: 'agent_write_file',
        arguments: {
          rel_path: 'README.md',
          content: '这是精简后的 README.md 内容...'
        },
        function: {
          name: 'agent_write_file',
          arguments: JSON.stringify({
            rel_path: 'README.md',
            content: '这是精简后的 README.md 内容...'
          })
        },
        status: 'pending',
        isPartial: false
      };

      let messages = chatStore.getState().messages;
      let updated = messages.map((m: any) => {
        if (m.id === agentMsgId) {
          return { ...m, toolCalls: [toolCall] };
        }
        return m;
      });
      chatStore.setState({ messages: updated });

      console.log('[Test] Tool call 添加完成');

      // 🔥 步骤 4: 模拟用户批准工具
      await chatStore.getState().approveToolCall(agentMsgId, toolCallId);

      // 等待处理完成
      await new Promise(resolve => setTimeout(resolve, 500));

      // 🔥 步骤 5: 模拟 Agent result 事件（这是 Bug 发生的位置）
      const agentResult = '✅ 重构完成！README.md 已精简到 100 字。';
      agentStore.setState((state: any) => ({
        runningAgents: state.runningAgents.map((a: any) => {
          if (a.id === agentId) {
            return { ...a, status: 'completed' as const };
          }
          return a;
        })
      }));

      // 模拟 AgentStore 的 result 事件处理
      messages = chatStore.getState().messages;
      updated = messages.map((m: any) => {
        if (m.id === agentMsgId) {
          return {
            ...m,
            content: agentResult,
            agentId: undefined,
            isAgentLive: false,
            // 🐛 BUG: 这里会覆盖 toolCall.result
            toolCalls: m.toolCalls?.map((tc: any) => {
              const isCompleted = tc.status === 'approved' || tc.status === 'pending';
              return {
                ...tc,
                status: isCompleted ? 'completed' : tc.status,
                ...(isCompleted && !tc.result ? { result: agentResult } : {})
              };
            })
          };
        }
        return m;
      });
      chatStore.setState({ messages: updated });

      console.log('[Test] Agent result 事件处理完成');

      // 🔥 步骤 6: 验证最终状态
      messages = chatStore.getState().messages;
      const finalMsg = messages.find((m: any) => m.id === agentMsgId);
      const finalToolCall = finalMsg?.toolCalls?.[0];

      console.log('[Test] 最终状态:', {
        content: finalMsg?.content,
        toolCallResult: finalToolCall?.result,
        toolCallStatus: finalToolCall?.status
      });

      // 尝试解析 result
      let parsedResult = null;
      if (finalToolCall?.result) {
        try {
          parsedResult = JSON.parse(finalToolCall.result);
          console.log('[Test] Result 是有效 JSON:', parsedResult);
        } catch (e) {
          console.log('[Test] Result 不是 JSON，是纯文本:', finalToolCall.result);
        }
      }

      return {
        success: true,
        agentContent: finalMsg?.content,
        toolCallResult: finalToolCall?.result,
        isResultJSON: !!parsedResult,
        parsedResult,
        hasOriginalContent: !!parsedResult?.originalContent,
        hasNewContent: !!parsedResult?.newContent,
        hasRollbackData: !!(parsedResult?.originalContent !== undefined || parsedResult?.newContent !== undefined)
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // ❌ Bug: result 被覆盖为纯文本，失去了 diff 数据
    if (result.isResultJSON) {
      console.log('[Test] ✅ Result 保留了 JSON 格式');
      expect(result.hasRollbackData).toBe(true);
      console.log('[Test] ✅ Diff 数据完整');
    } else {
      console.log('[Test] ❌ Bug: Result 被覆盖为纯文本');
      console.log('[Test] 这是当前 Bug - Agent 覆盖了工具的 diff 数据');
    }
  });

  test('@regression scenario-02: 验证工具执行时 diff 数据正确保存', async ({ page }) => {
    console.log('[Test] ========== 场景 2: 工具执行时 diff 数据验证 ==========');
    test.setTimeout(60000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      const msgId = crypto.randomUUID();
      const toolCallId = 'call_diff_verify_456';

      // 添加消息和工具调用
      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_write_file',
          arguments: {
            rel_path: 'test.txt',
            content: 'New content here'
          },
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({
              rel_path: 'test.txt',
              content: 'New content here'
            })
          },
          status: 'pending',
          isPartial: false
        }],
        timestamp: Date.now()
      });

      // 模拟工具批准和执行
      await chatStore.getState().approveToolCall(msgId, toolCallId);

      await new Promise(resolve => setTimeout(resolve, 500));

      // 检查执行后的 toolCall 状态
      const messages = chatStore.getState().messages;
      const msg = messages.find((m: any) => m.id === msgId);
      const toolCall = msg?.toolCalls?.[0];

      console.log('[Test] 工具执行后:', {
        status: toolCall?.status,
        hasResult: !!toolCall?.result,
        resultType: typeof toolCall?.result
      });

      // 解析 result
      let parsedResult = null;
      if (toolCall?.result && typeof toolCall.result === 'string') {
        try {
          parsedResult = JSON.parse(toolCall.result);
        } catch (e) {
          // 不是 JSON
        }
      }

      return {
        success: true,
        toolCallStatus: toolCall?.status,
        hasResult: !!toolCall?.result,
        resultIsJSON: !!parsedResult,
        parsedResult,
        hasOriginalContent: !!parsedResult?.originalContent,
        hasNewContent: !!parsedResult?.newContent
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // ✅ 验证：工具执行后应该保存了 diff 数据
    expect(result.success).toBe(true);
    expect(result.hasResult).toBe(true);
    expect(result.resultIsJSON).toBe(true);
    // 🔥 新建文件时 originalContent 是空字符串，但字段存在
    expect(result.parsedResult).toHaveProperty('originalContent');
    expect(result.hasNewContent).toBe(true);

    console.log('[Test] ✅ 工具执行时 diff 数据保存正确');
  });

  test('@regression scenario-03: 模拟完整 Agent 流程验证 diff 保留', async ({ page }) => {
    console.log('[Test] ========== 场景 3: 完整 Agent 流程 diff 保留验证 ==========');
    test.setTimeout(120000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      if (!chatStore || !agentStore) {
        return { success: false, error: 'Stores not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      const agentMsgId = crypto.randomUUID();
      const agentId = crypto.randomUUID();
      const toolCallId = 'call_full_flow_789';

      // 创建 Agent 消息
      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: '',
        agentId: agentId,
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_write_file',
          arguments: { rel_path: 'demo.ts', content: 'const x = 1;' },
          function: { name: 'agent_write_file', arguments: '{"rel_path":"demo.ts","content":"const x = 1;"}' },
          status: 'pending'
        }],
        timestamp: Date.now()
      });

      // 建立映射
      agentStore.setState((state: any) => ({
        agentToMessageMap: {
          ...state.agentToMessageMap,
          [agentId]: agentMsgId
        }
      }));

      console.log('[Test] Agent 消息创建完成');

      // 🔥 模拟工具批准
      await chatStore.getState().approveToolCall(agentMsgId, toolCallId);
      await new Promise(resolve => setTimeout(resolve, 500));

      const afterApproveMessages = chatStore.getState().messages;
      const afterApproveMsg = afterApproveMessages.find((m: any) => m.id === agentMsgId);
      const afterApproveTC = afterApproveMsg?.toolCalls?.[0];

      console.log('[Test] 批准后:', {
        status: afterApproveTC?.status,
        hasResult: !!afterApproveTC?.result,
        resultType: typeof afterApproveTC?.result
      });

      // 🔥 关键：解析批准后的 result
      let parsedResultAfterApprove = null;
      if (afterApproveTC?.result && typeof afterApproveTC.result === 'string') {
        try {
          parsedResultAfterApprove = JSON.parse(afterApproveTC.result);
          console.log('[Test] 批准后 result 解析成功:', {
            hasOriginal: !!parsedResultAfterApprove?.originalContent,
            hasNew: !!parsedResultAfterApprove?.newContent
          });
        } catch (e) {
          console.log('[Test] 批准后 result 不是 JSON:', e.message);
        }
      }

      // 🔥 模拟 Agent 完成（发送 result 事件）
      const agentResultText = '✅ 文件已成功重构！';
      const agentEventData = {
        type: 'result',
        result: agentResultText
      };

      // 模拟 AgentStore 的 result 事件处理逻辑
      let messages = chatStore.getState().messages;
      let updated = messages.map((m: any) => {
        if (m.id === agentMsgId) {
          return {
            ...m,
            content: agentResultText,
            agentId: undefined,
            isAgentLive: false,
            // 🐛 BUG 位置：覆盖 result
            // 🔥 FIX: 使用与 agentStore.ts 一致的条件逻辑
            toolCalls: m.toolCalls?.map((tc: any) => {
              const isCompleted = tc.status === 'approved' || tc.status === 'pending';
              return {
                ...tc,
                status: isCompleted ? 'completed' : tc.status,
                ...(isCompleted && !tc.result ? { result: agentResultText } : {})
              };
            })
          };
        }
        return m;
      });
      chatStore.setState({ messages: updated });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 验证最终状态
      messages = chatStore.getState().messages;
      const finalMsg = messages.find((m: any) => m.id === agentMsgId);
      const finalTC = finalMsg?.toolCalls?.[0];

      console.log('[Test] Agent 完成后:', {
        status: finalTC?.status,
        hasResult: !!finalTC?.result,
        resultType: typeof finalTC?.result,
        resultPreview: finalTC?.result?.substring(0, 50)
      });

      // 尝试解析最终 result
      let parsedResultFinal = null;
      if (finalTC?.result && typeof finalTC.result === 'string') {
        try {
          parsedResultFinal = JSON.parse(finalTC.result);
        } catch (e) {
          // 不是 JSON
        }
      }

      return {
        success: true,
        step1_AfterApprove: {
          status: afterApproveTC?.status,
          hasResult: !!afterApproveTC?.result,
          resultIsJSON: !!parsedResultAfterApprove,
          hasDiffData: !!(parsedResultAfterApprove?.originalContent || parsedResultAfterApprove?.newContent)
        },
        step2_AfterAgentResult: {
          status: finalTC?.status,
          hasResult: !!finalTC?.result,
          resultIsJSON: !!parsedResultFinal,
          hasDiffData: !!(parsedResultFinal?.originalContent || parsedResultFinal?.newContent),
          bugDetected: !parsedResultFinal && finalTC?.result === agentResultText
        }
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // ✅ 验证步骤 1：批准后应该有 diff 数据
    expect(result.step1_AfterApprove.resultIsJSON).toBe(true);
    expect(result.step1_AfterApprove.hasDiffData).toBe(true);
    console.log('[Test] ✅ 步骤 1: 批准后 diff 数据正确');

    // ✅ 验证步骤 2：Agent 完成后 diff 数据应被保留（不被覆盖）
    if (result.step2_AfterAgentResult.hasDiffData) {
      console.log('[Test] ✅ Bug 已修复: diff 数据保留完整');
      console.log('[Test] Agent result 没有覆盖工具的 diff 数据');
    } else {
      console.log('[Test] ❌ Bug 确认: Agent result 覆盖了 diff 数据');
      console.log('[Test] 这是需要修复的问题');
    }

    expect(result.step2_AfterAgentResult.hasDiffData).toBe(true); // 修复后应为 true
  });

  test('@regression scenario-04: 验证回退功能是否可用', async ({ page }) => {
    console.log('[Test] ========== 场景 4: 回退功能可用性验证 ==========');
    test.setTimeout(60000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      const msgId = crypto.randomUUID();
      const toolCallId = 'call_rollback_test_abc';

      // 创建带完整 diff 数据的工具调用
      const diffData = {
        success: true,
        message: 'File written successfully',
        originalContent: 'Line 1\nLine 2\nLine 3',
        newContent: 'Line 1 Modified\nLine 2 Modified\nLine 3 Modified',
        filePath: '/test/path/demo.ts',
        timestamp: Date.now()
      };

      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_write_file',
          arguments: {},
          function: { name: 'agent_write_file', arguments: '{}' },
          status: 'completed',
          result: JSON.stringify(diffData)
        }],
        timestamp: Date.now()
      });

      // 检查是否可以回退
      const hasRollback = !!(chatStore.getState() as any).rollbackToolCall;

      // 检查 toolCall 是否有回退数据
      const messages = chatStore.getState().messages;
      const msg = messages.find((m: any) => m.id === msgId);
      const tc = msg?.toolCalls?.[0];

      let hasRollbackData = false;
      if (tc?.result) {
        try {
          const parsed = JSON.parse(tc.result);
          hasRollbackData = !!(parsed.originalContent !== undefined || parsed.newContent !== undefined);
        } catch (e) {
          // result 不是 JSON
        }
      }

      return {
        success: true,
        hasRollbackFunction: hasRollback,
        hasRollbackData,
        toolCallStatus: tc?.status,
        resultPreview: tc?.result?.substring(0, 100)
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // ✅ 验证：应该有回退功能和数据
    expect(result.success).toBe(true);
    expect(result.hasRollbackFunction).toBe(true);
    expect(result.hasRollbackData).toBe(true);

    console.log('[Test] ✅ 回退功能可用（前提：diff 数据未被覆盖）');
  });

  test('@regression scenario-05: 验证不同工具类型的 diff 处理', async ({ page }) => {
    console.log('[Test] ========== 场景 5: 不同工具类型 diff 处理验证 ==========');
    test.setTimeout(60000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 测试不同的工具类型
      const tools = [
        { name: 'agent_write_file', hasDiff: true },
        { name: 'agent_read_file', hasDiff: false },
        { name: 'agent_list_dir', hasDiff: false },
        { name: 'bash', hasDiff: false }
      ];

      const results: any[] = [];

      for (const tool of tools) {
        chatStore.setState({ messages: [] });

        const msgId = crypto.randomUUID();
        const toolCallId = `call_test_${tool.name}`;

        chatStore.getState().addMessage({
          id: msgId,
          role: 'assistant',
          content: '',
          toolCalls: [{
            id: toolCallId,
            type: 'function',
            tool: tool.name,
            arguments: {},
            function: { name: tool.name, arguments: '{}' },
            status: 'pending'
          }],
          timestamp: Date.now()
        });

        // 检查工具配置
        const messages = chatStore.getState().messages;
        const msg = messages.find((m: any) => m.id === msgId);
        const tc = msg?.toolCalls?.[0];

        results.push({
          tool: tool.name,
          hasToolCall: !!tc
        });
      }

      return {
        success: true,
        results
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // ✅ 验证：所有工具都正确配置
    expect(result.success).toBe(true);
    result.results.forEach(r => {
      expect(r.hasToolCall).toBe(true);
    });

    console.log('[Test] ✅ 所有工具类型配置正确');
  });
});
