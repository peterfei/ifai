/**
 * E2E 测试：Tool 批准/拒绝流程
 *
 * 验证：
 * 1. Tool 批准流程完整性
 * 2. Tool 拒绝流程完整性
 * 3. 多个工具调用的独立处理
 * 4. 工具状态转换的正确性
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Tool: Approval and Rejection Flow', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('should handle complete tool approval flow', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：完整工具批准流程 ==========');

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      // 创建用户消息
      const userMsgId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '读取 test.txt 文件'
      });

      // 创建助手消息（带有待处理工具）
      const assistantMsgId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      const assistantMessage = {
        id: assistantMsgId,
        role: 'assistant' as const,
        content: '',
        toolCalls: [{
          id: toolCallId,
          tool: 'agent_read_file',
          args: JSON.stringify({ rel_path: 'test.txt' }),
          status: 'pending' as const,
          isPartial: false
        }]
      };

      chatStore.getState().addMessage(assistantMessage);

      // 验证初始状态
      const beforeApproval = chatStore.getState().messages.find(m => m.id === assistantMsgId);
      const initialStatus = beforeApproval?.toolCalls?.[0]?.status;
      const initialArgs = beforeApproval?.toolCalls?.[0]?.args;

      // 批准工具
      chatStore.getState().approveToolCall(assistantMsgId, toolCallId);

      // 验证批准后状态
      const afterApproval = chatStore.getState().messages.find(m => m.id === assistantMsgId);
      const finalStatus = afterApproval?.toolCalls?.[0]?.status;
      const finalArgs = afterApproval?.toolCalls?.[0]?.args;

      return {
        success: true,
        initialStatus,
        finalStatus,
        initialArgs,
        finalArgs,
        argsPreserved: initialArgs === finalArgs,
        statusUpdated: initialStatus !== finalStatus
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.initialStatus).toBe('pending');
    expect(result.argsPreserved).toBe(true);
    // 状态应该从 pending 改变
    expect(result.statusUpdated).toBe(true);

    console.log('[DEBUG] ✅ 工具批准流程正常，参数保持不变');
  });

  test('should handle complete tool rejection flow', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：完整工具拒绝流程 ==========');

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      // 创建用户消息
      const userMsgId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '删除文件'
      });

      // 创建助手消息（带有待处理工具）
      const assistantMsgId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      const assistantMessage = {
        id: assistantMsgId,
        role: 'assistant' as const,
        content: '',
        toolCalls: [{
          id: toolCallId,
          tool: 'agent_delete_file',
          args: JSON.stringify({ rel_path: 'test.txt' }),
          status: 'pending' as const
        }]
      };

      chatStore.getState().addMessage(assistantMessage);

      // 验证初始状态
      const beforeRejection = chatStore.getState().messages.find(m => m.id === assistantMsgId);
      const initialStatus = beforeRejection?.toolCalls?.[0]?.status;

      // 拒绝工具
      chatStore.getState().rejectToolCall(assistantMsgId, toolCallId);

      // 验证拒绝后状态
      const afterRejection = chatStore.getState().messages.find(m => m.id === assistantMsgId);
      const finalStatus = afterRejection?.toolCalls?.[0]?.status;

      return {
        success: true,
        initialStatus,
        finalStatus,
        correctlyRejected: finalStatus === 'rejected'
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.initialStatus).toBe('pending');
    expect(result.correctlyRejected).toBe(true);

    console.log('[DEBUG] ✅ 工具拒绝流程正常');
  });

  test('should handle multiple independent tool calls', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：多个独立工具调用 ==========');

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      // 创建带有多个工具调用的消息
      const assistantMsgId = crypto.randomUUID();
      const toolCallId1 = crypto.randomUUID();
      const toolCallId2 = crypto.randomUUID();
      const toolCallId3 = crypto.randomUUID();

      const assistantMessage = {
        id: assistantMsgId,
        role: 'assistant' as const,
        content: '',
        toolCalls: [
          {
            id: toolCallId1,
            tool: 'agent_read_file',
            args: JSON.stringify({ rel_path: 'file1.txt' }),
            status: 'pending' as const
          },
          {
            id: toolCallId2,
            tool: 'agent_read_file',
            args: JSON.stringify({ rel_path: 'file2.txt' }),
            status: 'pending' as const
          },
          {
            id: toolCallId3,
            tool: 'agent_list_dir',
            args: JSON.stringify({ rel_path: '.' }),
            status: 'pending' as const
          }
        ]
      };

      chatStore.getState().addMessage(assistantMessage);

      // 批准第一个工具
      chatStore.getState().approveToolCall(assistantMsgId, toolCallId1);

      // 拒绝第二个工具
      chatStore.getState().rejectToolCall(assistantMsgId, toolCallId2);

      // 第三个保持 pending

      const message = chatStore.getState().messages.find(m => m.id === assistantMsgId);
      const tool1 = message?.toolCalls?.[0];
      const tool2 = message?.toolCalls?.[1];
      const tool3 = message?.toolCalls?.[2];

      return {
        success: true,
        tool1: { id: tool1?.id, status: tool1?.status },
        tool2: { id: tool2?.id, status: tool2?.status },
        tool3: { id: tool3?.id, status: tool3?.status },
        independentProcessing:
          (tool1?.status !== 'pending') &&
          (tool2?.status === 'rejected') &&
          (tool3?.status === 'pending')
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.tool1.status).not.toBe('pending'); // 已批准
    expect(result.tool2.status).toBe('rejected'); // 已拒绝
    expect(result.tool3.status).toBe('pending'); // 仍待处理
    expect(result.independentProcessing).toBe(true);

    console.log('[DEBUG] ✅ 多个工具调用独立处理正确');
  });

  test('should preserve tool call arguments through flow', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：工具参数完整性 ==========');

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      const originalArgs = JSON.stringify({
        rel_path: 'path/to/file.txt',
        extra_param: 'some_value'
      });

      const assistantMsgId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      const message = {
        id: assistantMsgId,
        role: 'assistant' as const,
        content: '',
        toolCalls: [{
          id: toolCallId,
          tool: 'agent_write_file',
          args: originalArgs,
          status: 'pending' as const
        }]
      };

      chatStore.getState().addMessage(message);

      // 获取批准前的参数
      const before = chatStore.getState().messages.find(m => m.id === assistantMsgId);
      const argsBefore = before?.toolCalls?.[0]?.args;

      // 批准工具
      chatStore.getState().approveToolCall(assistantMsgId, toolCallId);

      // 获取批准后的参数
      const after = chatStore.getState().messages.find(m => m.id === assistantMsgId);
      const argsAfter = after?.toolCalls?.[0]?.args;

      // 解析并比较参数
      const parsedBefore = JSON.parse(argsBefore);
      const parsedAfter = JSON.parse(argsAfter);

      return {
        success: true,
        argsBefore: parsedBefore,
        argsAfter: parsedAfter,
        argsMatch: JSON.stringify(parsedBefore) === JSON.stringify(parsedAfter)
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.argsMatch).toBe(true);
    expect(result.argsBefore).toEqual(result.argsAfter);

    console.log('[DEBUG] ✅ 工具参数在整个流程中保持完整');
  });
});
