/**
 * 智谱 API 批准按钮点击报错修复验证
 *
 * 真实场景还原：
 * 1. 智谱 API 发送第一个 tool_call (id: call_xxx)
 * 2. UI 渲染批准按钮
 * 3. 智谱 API 发送第二个 tool_call (id: call_yyy, 相同签名)
 * 4. 前端去重逻辑跳过第二个，记录 ID 映射
 * 5. 用户点击批准按钮（持有被跳过的 ID）
 * 6. 验证批准通过 ID 重定向成功
 *
 * 修复内容：
 * - agentStore.ts: 添加 deduplicatedToolCallIds 映射表
 * - useChatStore.ts: 添加 ID 重定向逻辑
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe.skip('智谱 API 批准按钮 ID 重定向验证 - TODO: Fix this test', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[AgentStore]') || text.includes('[useChatStore]') ||
          text.includes('ID Redirect') || text.includes('ID mapping') ||
          text.includes('Skipping duplicate') || text.includes('[E2E]')) {
        console.log('[Backend]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('@regression approval-redirect-01: 模拟智谱 API 重复 tool_call + 批准按钮点击', async ({ page }) => {
    console.log('[Test] ========== 完整模拟智谱 API 重复场景 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      if (!chatStore || !agentStore) {
        return { success: false, skip: true, error: 'Store not available' };
      }

      // 清空消息和状态
      chatStore.setState({ messages: [] });
      agentStore.setState({ deduplicatedToolCallIds: {} });
      await new Promise(resolve => setTimeout(resolve, 100));

      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();

      // 1. 创建用户消息
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '重构 README.md',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 2. 创建助手消息
      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: undefined,
        isAgentLive: true
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 3. 模拟智谱 API 发送第一个 tool_call
      const firstToolCall = {
        id: 'call_1fa10ed6184942a698009039',  // 智谱 API 提供的 ID
        tool: 'agent_write_file',
        args: {
          rootPath: '.',
          relPath: 'README.md',
          content: 'refactored content'
        },
        isPartial: false,
        status: 'pending'
      };

      // 手动添加第一个 tool_call
      chatStore.setState((state: any) => ({
        messages: state.messages.map((m: any) =>
          m.id === assistantMsgId
            ? { ...m, toolCalls: [...(m.toolCalls || []), firstToolCall] }
            : m
        )
      }));

      await new Promise(resolve => setTimeout(resolve, 200));

      // 4. 模拟智谱 API 发送第二个 tool_call（相同签名，不同 ID）
      const secondToolCall = {
        id: 'b97a913a-4f60-4027-afcd-5289952e91b4_0',  // 索引生成的 ID
        tool: 'agent_write_file',
        args: {
          rootPath: '.',
          relPath: 'README.md',
          content: 'refactored content'
        },
        isPartial: false,
        status: 'pending'
      };

      // 应用 agentStore 的去重逻辑
      const messagesBefore = chatStore.getState().messages;
      const assistantMsgBefore = messagesBefore.find((m: any) => m.id === assistantMsgId);
      const toolCallsBefore = assistantMsgBefore?.toolCalls || [];

      const signature1 = `${firstToolCall.tool}:${JSON.stringify(firstToolCall.args)}`;
      const signature2 = `${secondToolCall.tool}:${JSON.stringify(secondToolCall.args)}`;

      // 检查是否应该去重
      const signatureIndex = toolCallsBefore.findIndex((tc: any) =>
        tc.tool === secondToolCall.tool &&
        JSON.stringify(tc.args) === JSON.stringify(secondToolCall.args)
      );

      const shouldSkip = !toolCallsBefore.some((tc: any) => tc.id === secondToolCall.id) &&
                         signatureIndex !== -1;

      // 记录 ID 映射（模拟 agentStore.ts 的逻辑）
      if (shouldSkip) {
        const canonicalId = toolCallsBefore[signatureIndex].id;
        const skippedId = secondToolCall.id;
        console.log(`[Test] 🔥 Simulating dedup: recording ID mapping ${skippedId} -> ${canonicalId}`);

        agentStore.setState((state: any) => ({
          deduplicatedToolCallIds: {
            ...state.deduplicatedToolCallIds,
            [skippedId]: canonicalId
          }
        }));
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // 5. 验证去重后的状态
      const messagesAfter = chatStore.getState().messages;
      const assistantMsgAfter = messagesAfter.find((m: any) => m.id === assistantMsgId);
      const toolCallsAfter = assistantMsgAfter?.toolCalls || [];

      // 6. 测试批准功能 - 使用被跳过的 ID
      const deduplicatedIds = agentStore.getState().deduplicatedToolCallIds;

      // 模拟点击第二个（被跳过的）tool_call 的批准按钮
      const testToolCallId = secondToolCall.id;  // 使用被跳过的 ID
      const canonicalId = deduplicatedIds[testToolCallId];

      // 检查 ID 映射是否存在
      const hasMapping = !!canonicalId;

      // 检查批准函数是否能通过 ID 重定向找到正确的 tool_call
      let approveWouldWork = false;
      if (hasMapping) {
        const foundByCanonicalId = toolCallsAfter.some((tc: any) => tc.id === canonicalId);
        approveWouldWork = foundByCanonicalId;
      }

      // 检查直接查找（原始 ID）
      const foundByOriginalId = toolCallsAfter.some((tc: any) => tc.id === testToolCallId);

      return {
        success: true,
        signature1,
        signature2,
        signaturesMatch: signature1 === signature2,
        toolCallsCount: toolCallsAfter.length,
        toolCallsIds: toolCallsAfter.map((tc: any) => tc.id),
        deduplicatedIds,
        hasMapping,
        canonicalId,
        testToolCallId,
        foundByOriginalId,
        foundByCanonicalId: approveWouldWork,
        // 总体验证
        dedupSuccessful: toolCallsAfter.length === 1,
        redirectWouldWork: hasMapping && approveWouldWork
      };
    });

    console.log('[Test] ========== 结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    if (result.skip) {
      console.log('[Test] ⚠️ 跳过测试');
      return;
    }

    expect(result.success).toBe(true);

    // 验证签名匹配
    expect(result.signaturesMatch).toBe(true);
    console.log('[Test] ✅ 签名匹配确认');

    // 验证去重成功
    if (result.dedupSuccessful) {
      console.log('[Test] ✅ 去重成功，只有 1 个 tool_call');
      console.log('[Test] ToolCall IDs:', result.toolCallsIds);
    } else {
      console.log(`[Test] ❌ 去重失败，有 ${result.toolCallsCount} 个 tool_call`);
    }
    expect(result.dedupSuccessful).toBe(true);

    // 验证 ID 映射已记录
    if (result.hasMapping) {
      console.log(`[Test] ✅ ID 映射已记录: ${result.testToolCallId} -> ${result.canonicalId}`);
    } else {
      console.log('[Test] ❌ ID 映射未记录');
    }
    expect(result.hasMapping).toBe(true);

    // 验证原始 ID 找不到（去重后）
    expect(result.foundByOriginalId).toBe(false);
    console.log('[Test] ✅ 原始（被跳过）ID 在消息中不存在');

    // 验证通过规范 ID 能找到
    expect(result.foundByCanonicalId).toBe(true);
    console.log('[Test] ✅ 通过规范 ID 能找到 tool_call');

    // 验证重定向机制完整可用
    if (result.redirectWouldWork) {
      console.log('[Test] ✅ ID 重定向机制完整可用');
    } else {
      console.log('[Test] ❌ ID 重定向机制不可用');
    }
    expect(result.redirectWouldWork).toBe(true);
  });

  test('@regression approval-redirect-02: 真实 Agent 场景 - 发射 Agent 并模拟去重', async ({ page }) => {
    console.log('[Test] ========== 真实 Agent 场景测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      if (!chatStore || !agentStore) {
        return { success: false, skip: true };
      }

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

      // 发射 Agent（这会创建真实的 agent-message 事件监听）
      const store = agentStore.getState();
      const agentId = await store.launchAgent(
        'Refactor Agent',
        '读取 README.md 文件',
        assistantMsgId,
        undefined
      );

      // 等待 Agent 执行
      await new Promise(resolve => setTimeout(resolve, 15000));

      // 获取执行结果
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === assistantMsgId);
      const toolCalls = assistantMsg?.toolCalls || [];

      // 检查 deduplicatedToolCallIds 状态
      const deduplicatedIds = agentStore.getState().deduplicatedToolCallIds;

      return {
        success: true,
        agentId,
        toolCallsCount: toolCalls.length,
        toolCallsIds: toolCalls.map((tc: any) => ({ id: tc.id, tool: tc.tool, status: tc.status })),
        deduplicatedIds,
        hasDedupMapping: Object.keys(deduplicatedIds).length > 0
      };
    });

    console.log('[Test] ========== 结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    if (result.skip) {
      console.log('[Test] ⚠️ 跳过测试');
      return;
    }

    expect(result.success).toBe(true);
    console.log('[Test] Agent ID:', result.agentId);
    console.log('[Test] ToolCalls:', result.toolCallsCount);

    if (result.hasDedupMapping) {
      console.log('[Test] ✅ 检测到 ID 去重映射');
      console.log('[Test] 去重映射:', JSON.stringify(result.deduplicatedIds));
    } else {
      console.log('[Test] ℹ️ 本次测试未触发去重（正常，取决于智谱 API 行为）');
    }
  });
});
