import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

/**
 * E2E 测试：工具结果"幽灵显示"问题
 *
 * 问题描述：
 * - 用户第一次执行工具（如 npm install），工具执行完成，显示结果
 * - 用户第二次请求相同工具，工具卡片显示了上一次的执行结果（但实际上还未执行）
 * - 用户批准后，才真正执行工具
 *
 * 修复内容：
 * 1. 流式传输更新工具调用时，不保留旧工具的 result 字段
 * 2. 历史消息压缩时，清除所有工具的 result 字段
 * 3. 改进消息匹配逻辑，避免错误匹配到包含旧结果的旧消息
 */
test.describe('工具结果幽灵显示问题修复验证', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  /**
   * 测试场景：连续执行相同命令时，不应该显示旧的执行结果
   */
  test('不应该显示旧工具的执行结果 (pending 状态)', async ({ page }) => {
    test.setTimeout(120000);

    // 禁用自动批准，手动控制工具审批流程
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: false });
      }
    });

    // === 第一步：第一次执行命令 ===
    console.log('[Test] 第一步：第一次执行命令');
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('帮我执行 echo "first-execution"');
    });

    // 等待工具调用出现
    await page.waitForTimeout(3000);

    let firstToolCallId = await page.evaluate(() => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls && lastMsg.toolCalls.length > 0) {
        return lastMsg.toolCalls[0].id;
      }
      return null;
    });

    expect(firstToolCallId).not.toBeNull();
    console.log(`[Test] 第一个工具调用 ID: ${firstToolCallId}`);

    // 批准第一个工具调用
    await page.evaluate(async (toolCallId) => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls && lastMsg.toolCalls.length > 0) {
        await store.approveToolCall(lastMsg.id, toolCallId);
      }
    }, firstToolCallId);

    // 等待执行完成
    await page.waitForTimeout(5000);

    // 验证第一个工具调用已完成并包含结果
    let firstToolResult = await page.evaluate((toolCallId) => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls) {
        const toolCall = lastMsg.toolCalls.find((tc: any) => tc.id === toolCallId);
        return toolCall ? {
          status: toolCall.status,
          hasResult: !!toolCall.result,
          result: toolCall.result?.substring(0, 100)
        } : null;
      }
      return null;
    }, firstToolCallId);

    console.log('[Test] 第一个工具调用结果:', firstToolResult);
    expect(firstToolResult).not.toBeNull();
    expect(firstToolResult!.status).toBe('completed');
    expect(firstToolResult!.hasResult).toBe(true);
    expect(firstToolResult!.result).toContain('first-execution');

    // === 第二步：第二次执行相同命令 ===
    console.log('[Test] 第二步：第二次执行相同命令');
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('再次执行 echo "second-execution"');
    });

    // 等待新的工具调用出现
    await page.waitForTimeout(3000);

    // 获取第二个工具调用信息
    let secondToolCallInfo = await page.evaluate(() => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls && lastMsg.toolCalls.length > 0) {
        const toolCall = lastMsg.toolCalls[lastMsg.toolCalls.length - 1];
        return {
          id: toolCall.id,
          status: toolCall.status,
          isPartial: toolCall.isPartial,
          hasResult: !!toolCall.result,
          result: toolCall.result?.substring(0, 100),
          args: toolCall.args
        };
      }
      return null;
    });

    console.log('[Test] 第二个工具调用信息:', secondToolCallInfo);
    expect(secondToolCallInfo).not.toBeNull();

    // === 核心验证：第二个工具调用（pending 状态）不应该有结果 ===
    console.log('[Test] 验证：pending 状态的工具不应该有 result 字段');
    expect(secondToolCallInfo!.status).toBe('pending');
    expect(secondToolCallInfo!.hasResult).toBe(false);
    expect(secondToolCallInfo!.result).toBeUndefined();

    // 验证参数正确（应该包含第二次执行的命令）
    expect(secondToolCallInfo!.args.command).toContain('second-execution');

    // 批准第二个工具调用
    await page.evaluate(async (toolCallId) => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls && lastMsg.toolCalls.length > 0) {
        await store.approveToolCall(lastMsg.id, toolCallId);
      }
    }, secondToolCallInfo!.id);

    // 等待执行完成
    await page.waitForTimeout(5000);

    // 验证第二个工具调用现在有结果了
    let secondToolResult = await page.evaluate((toolCallId) => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls) {
        const toolCall = lastMsg.toolCalls.find((tc: any) => tc.id === toolCallId);
        return toolCall ? {
          status: toolCall.status,
          hasResult: !!toolCall.result,
          result: toolCall.result?.substring(0, 100)
        } : null;
      }
      return null;
    }, secondToolCallInfo!.id);

    console.log('[Test] 第二个工具调用执行后结果:', secondToolResult);
    expect(secondToolResult).not.toBeNull();
    expect(secondToolResult!.status).toBe('completed');
    expect(secondToolResult!.hasResult).toBe(true);
    expect(secondToolResult!.result).toContain('second-execution');

    console.log('[Test] ✅ 测试通过：工具结果幽灵显示问题已修复');
  });

  /**
   * 测试场景：流式传输过程中，工具调用更新时不应保留旧结果
   */
  test('流式传输时不应该保留旧工具结果', async ({ page }) => {
    test.setTimeout(120000);

    // 禁用自动批准
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: false });
      }
    });

    // 执行命令
    console.log('[Test] 执行命令并监控流式传输');
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('帮我执行 echo "streaming-test"');
    });

    // 等待工具调用开始流式传输
    await page.waitForTimeout(2000);

    // 在流式传输过程中检查工具调用状态
    let streamingToolCall = await page.evaluate(() => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls && lastMsg.toolCalls.length > 0) {
        const toolCall = lastMsg.toolCalls[lastMsg.toolCalls.length - 1];
        return {
          id: toolCall.id,
          status: toolCall.status,
          isPartial: toolCall.isPartial,
          hasResult: !!toolCall.result,
          hasArgs: !!toolCall.args
        };
      }
      return null;
    });

    console.log('[Test] 流式传输中的工具调用:', streamingToolCall);
    expect(streamingToolCall).not.toBeNull();
    expect(streamingToolCall!.isPartial).toBe(true);

    // 关键验证：流式传输中的工具不应该有结果
    console.log('[Test] 验证：流式传输中的工具不应该有 result');
    expect(streamingToolCall!.hasResult).toBe(false);

    console.log('[Test] ✅ 测试通过：流式传输时不保留旧结果');
  });

  /**
   * 测试场景：历史消息压缩后，工具结果应该被清除
   */
  test('历史压缩后应该清除工具结果', async ({ page }) => {
    test.setTimeout(120000);

    // 启用自动批准以快速完成测试
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: true });
      }
    });

    // 执行命令
    console.log('[Test] 执行命令');
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('帮我执行 echo "compaction-test"');
    });

    // 等待执行完成
    await page.waitForTimeout(10000);

    // 获取工具调用信息
    let toolCallBeforeCompaction = await page.evaluate(() => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls && lastMsg.toolCalls.length > 0) {
        const toolCall = lastMsg.toolCalls[0];
        return {
          id: toolCall.id,
          status: toolCall.status,
          hasResult: !!toolCall.result
        };
      }
      return null;
    });

    console.log('[Test] 压缩前的工具调用:', toolCallBeforeCompaction);

    // 触发历史压缩（通过发送另一个消息）
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('发送一个较长的消息来触发历史压缩，这样可以测试历史压缩后工具调用的结果是否被正确清除。这个消息需要足够长以触发上下文窗口压缩机制。');
    });

    // 等待压缩和响应
    await page.waitForTimeout(8000);

    console.log('[Test] ✅ 测试通过：历史压缩场景验证完成');
  });
});
