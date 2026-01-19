/**
 * E2E 测试：Tool 终端状态保护
 *
 * 验证：
 * 1. 已完成的工具调用不会被覆盖
 * 2. 已失败的工具调用不会被覆盖
 * 3. 已拒绝的工具调用不会被覆盖
 * 4. 批准后状态正确更新
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Tool: Terminal State Protection', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('should not override completed tool status', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：不覆盖已完成的工具 ==========');

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      // 创建一个带有已完成工具的消息
      const messageId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      const message = {
        id: messageId,
        role: 'assistant' as const,
        content: 'I have read the file',
        toolCalls: [{
          id: toolCallId,
          tool: 'agent_read_file',
          args: JSON.stringify({ rel_path: 'test.txt' }),
          status: 'completed' as const,
          result: JSON.stringify({ success: true, content: 'file content' })
        }]
      };

      // 添加消息到 store
      chatStore.getState().addMessage(message);

      // 尝试批准已完成的工具
      const beforeApproval = chatStore.getState().messages.find(m => m.id === messageId);
      const statusBefore = beforeApproval?.toolCalls?.[0]?.status;

      // 调用 approveToolCall (应该被保护，不改变状态)
      chatStore.getState().approveToolCall(messageId, toolCallId);

      const afterApproval = chatStore.getState().messages.find(m => m.id === messageId);
      const statusAfter = afterApproval?.toolCalls?.[0]?.status;

      return {
        success: true,
        statusBefore,
        statusAfter,
        statusUnchanged: statusBefore === statusAfter,
        toolCallId
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.statusBefore).toBe('completed');
    expect(result.statusAfter).toBe('completed');
    expect(result.statusUnchanged).toBe(true);

    console.log('[DEBUG] ✅ 已完成的工具状态不会被覆盖');
  });

  test('should not override failed tool status', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：不覆盖已失败的工具 ==========');

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      const messageId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      const message = {
        id: messageId,
        role: 'assistant' as const,
        content: 'Tool execution failed',
        toolCalls: [{
          id: toolCallId,
          tool: 'agent_read_file',
          args: JSON.stringify({ rel_path: 'nonexistent.txt' }),
          status: 'failed' as const,
          result: JSON.stringify({ success: false, error: 'File not found' })
        }]
      };

      chatStore.getState().addMessage(message);

      const beforeApproval = chatStore.getState().messages.find(m => m.id === messageId);
      const statusBefore = beforeApproval?.toolCalls?.[0]?.status;

      // 尝试批准已失败的工具
      chatStore.getState().approveToolCall(messageId, toolCallId);

      const afterApproval = chatStore.getState().messages.find(m => m.id === messageId);
      const statusAfter = afterApproval?.toolCalls?.[0]?.status;

      return {
        success: true,
        statusBefore,
        statusAfter,
        statusUnchanged: statusBefore === statusAfter
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.statusBefore).toBe('failed');
    expect(result.statusAfter).toBe('failed');
    expect(result.statusUnchanged).toBe(true);

    console.log('[DEBUG] ✅ 已失败的工具状态不会被覆盖');
  });

  test('should not override rejected tool status', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：不覆盖已拒绝的工具 ==========');

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      const messageId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      const message = {
        id: messageId,
        role: 'assistant' as const,
        content: 'I need to read a file',
        toolCalls: [{
          id: toolCallId,
          tool: 'agent_read_file',
          args: JSON.stringify({ rel_path: 'test.txt' }),
          status: 'rejected' as const
        }]
      };

      chatStore.getState().addMessage(message);

      const beforeApproval = chatStore.getState().messages.find(m => m.id === messageId);
      const statusBefore = beforeApproval?.toolCalls?.[0]?.status;

      // 尝试批准已拒绝的工具
      chatStore.getState().approveToolCall(messageId, toolCallId);

      const afterApproval = chatStore.getState().messages.find(m => m.id === messageId);
      const statusAfter = afterApproval?.toolCalls?.[0]?.status;

      return {
        success: true,
        statusBefore,
        statusAfter,
        statusUnchanged: statusBefore === statusAfter
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.statusBefore).toBe('rejected');
    expect(result.statusAfter).toBe('rejected');
    expect(result.statusUnchanged).toBe(true);

    console.log('[DEBUG] ✅ 已拒绝的工具状态不会被覆盖');
  });

  test('should correctly approve pending tool', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：正确批准待处理工具 ==========');

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      const messageId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      const message = {
        id: messageId,
        role: 'assistant' as const,
        content: 'I will read a file',
        toolCalls: [{
          id: toolCallId,
          tool: 'agent_read_file',
          args: JSON.stringify({ rel_path: 'test.txt' }),
          status: 'pending' as const
        }]
      };

      chatStore.getState().addMessage(message);

      const beforeApproval = chatStore.getState().messages.find(m => m.id === messageId);
      const statusBefore = beforeApproval?.toolCalls?.[0]?.status;

      // 批准待处理的工具（由于没有实际执行，状态可能不会立即变为 completed）
      chatStore.getState().approveToolCall(messageId, toolCallId);

      const afterApproval = chatStore.getState().messages.find(m => m.id === messageId);
      const statusAfter = afterApproval?.toolCalls?.[0]?.status;

      return {
        success: true,
        statusBefore,
        statusAfter,
        statusChanged: statusBefore !== statusAfter
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.statusBefore).toBe('pending');
    // 状态应该改变（可能是 approved 或 completed，取决于实现）
    expect(result.statusChanged).toBe(true);

    console.log('[DEBUG] ✅ 待处理工具可以被正确批准');
  });

  test('should not override rejected tool when calling reject again', async ({ page }) => {
    console.log('[DEBUG] ========== 测试：重复拒绝已拒绝的工具 ==========');

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      const messageId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      const message = {
        id: messageId,
        role: 'assistant' as const,
        content: 'Tool call',
        toolCalls: [{
          id: toolCallId,
          tool: 'agent_read_file',
          args: JSON.stringify({ rel_path: 'test.txt' }),
          status: 'rejected' as const
        }]
      };

      chatStore.getState().addMessage(message);

      const beforeReject = chatStore.getState().messages.find(m => m.id === messageId);
      const statusBefore = beforeReject?.toolCalls?.[0]?.status;

      // 尝试再次拒绝已拒绝的工具
      chatStore.getState().rejectToolCall(messageId, toolCallId);

      const afterReject = chatStore.getState().messages.find(m => m.id === messageId);
      const statusAfter = afterReject?.toolCalls?.[0]?.status;

      return {
        success: true,
        statusBefore,
        statusAfter,
        statusUnchanged: statusBefore === statusAfter
      };
    });

    console.log('[DEBUG] 测试结果:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.statusBefore).toBe('rejected');
    expect(result.statusAfter).toBe('rejected');
    expect(result.statusUnchanged).toBe(true);

    console.log('[DEBUG] ✅ 重复拒绝已拒绝的工具，状态保持不变');
  });
});
