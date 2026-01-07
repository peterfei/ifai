import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

/**
 * E2E 测试：工具结果幽灵显示与重复执行问题完整验证
 *
 * 测试场景：
 * 1. 工具结果错误显示问题
 * 2. 审批后重复执行问题
 * 3. 工具状态流转验证
 */
test.describe('工具结果幽灵显示与重复执行完整测试', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  /**
   * 测试 1：验证工具审批流程不会重复执行
   */
  test('审批后不应该重复执行命令', async ({ page }) => {
    test.setTimeout(120000);

    console.log('[Test] 开始测试：审批后不应该重复执行命令');

    // 禁用自动批准，手动控制审批流程
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: false });
      }
    });

    // 发送命令
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('帮我执行 echo "test-no-duplicate"');
    });

    // 等待工具调用出现
    await page.waitForTimeout(3000);

    // 获取工具调用信息
    let toolCallInfo = await page.evaluate(() => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls && lastMsg.toolCalls.length > 0) {
        const toolCall = lastMsg.toolCalls[0];
        return {
          id: toolCall.id,
          status: toolCall.status,
          hasResult: !!toolCall.result,
          result: toolCall.result?.substring(0, 100)
        };
      }
      return null;
    });

    console.log('[Test] 工具调用初始状态:', toolCallInfo);
    expect(toolCallInfo).not.toBeNull();
    expect(toolCallInfo!.status).toBe('pending');

    // 记录执行前的消息数量
    let messageCountBefore = await page.evaluate(() => {
      return (window as any).__chatStore.getState().messages.length;
    });
    console.log('[Test] 执行前消息数量:', messageCountBefore);

    // 批准工具调用
    console.log('[Test] 批准工具调用');
    await page.evaluate(async (toolCallId) => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls && lastMsg.toolCalls.length > 0) {
        await store.approveToolCall(lastMsg.id, toolCallId);
      }
    }, toolCallInfo!.id);

    // 等待执行完成
    await page.waitForTimeout(5000);

    // 获取执行后的状态
    let toolCallAfterApproval = await page.evaluate((toolCallId) => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls) {
        const toolCall = lastMsg.toolCalls.find((tc: any) => tc.id === toolCallId);
        return toolCall ? {
          id: toolCall.id,
          status: toolCall.status,
          hasResult: !!toolCall.result,
          result: toolCall.result?.substring(0, 100)
        } : null;
      }
      return null;
    }, toolCallInfo!.id);

    console.log('[Test] 批准后工具状态:', toolCallAfterApproval);
    expect(toolCallAfterApproval).not.toBeNull();
    expect(toolCallAfterApproval!.status).toBe('completed');
    expect(toolCallAfterApproval!.hasResult).toBe(true);
    expect(toolCallAfterApproval!.result).toContain('test-no-duplicate');

    // 检查消息数量 - 不应该有重复的执行
    let messageCountAfter = await page.evaluate(() => {
      return (window as any).__chatStore.getState().messages.length;
    });
    console.log('[Test] 执行后消息数量:', messageCountAfter);

    // 验证：消息数量应该增加（AI 响应 + 工具结果消息），但不应该有重复的执行
    const messageCountDiff = messageCountAfter - messageCountBefore;
    console.log('[Test] 新增消息数量:', messageCountDiff);
    expect(messageCountDiff).toBeGreaterThan(0);
    expect(messageCountDiff).toBeLessThan(5); // 不应该有太多新消息（避免重复执行）

    console.log('[Test] ✅ 测试通过：审批后没有重复执行');
  });

  /**
   * 测试 2：验证连续执行相同命令时不显示旧结果
   */
  test('连续执行相同命令时不应该显示旧结果', async ({ page }) => {
    test.setTimeout(120000);

    console.log('[Test] 开始测试：连续执行相同命令时不显示旧结果');

    // 启用自动批准以快速完成第一次执行
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: true });
      }
    });

    // 第一次执行
    console.log('[Test] 第一次执行命令');
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('帮我执行 echo "first-execution"');
    });

    // 等待执行完成
    await page.waitForTimeout(8000);

    // 获取第一个工具调用的结果
    let firstToolResult = await page.evaluate(() => {
      const store = (window as any).__chatStore.getState();
      const messages = store.messages;
      // 找到最后一个包含工具调用的消息
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const toolCall = msg.toolCalls[msg.toolCalls.length - 1];
          return {
            id: toolCall.id,
            status: toolCall.status,
            hasResult: !!toolCall.result,
            result: toolCall.result?.substring(0, 100)
          };
        }
      }
      return null;
    });

    console.log('[Test] 第一次执行结果:', firstToolResult);
    expect(firstToolResult).not.toBeNull();
    expect(firstToolResult!.status).toBe('completed');
    expect(firstToolResult!.result).toContain('first-execution');

    // 禁用自动批准，手动控制第二次执行
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: false });
      }
    });

    // 第二次执行相同命令（不同参数）
    console.log('[Test] 第二次执行命令（不同参数）');
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('帮我执行 echo "second-execution"');
    });

    // 等待工具调用出现
    await page.waitForTimeout(3000);

    // 获取第二个工具调用的信息（执行前）
    let secondToolCallBeforeApproval = await page.evaluate(() => {
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

    console.log('[Test] 第二次工具调用（批准前）:', secondToolCallBeforeApproval);
    expect(secondToolCallBeforeApproval).not.toBeNull();

    // 核心验证：pending 状态的工具不应该有 result
    console.log('[Test] 验证：pending 状态的工具不应该有 result');
    expect(secondToolCallBeforeApproval!.status).toBe('pending');
    expect(secondToolCallBeforeApproval!.hasResult).toBe(false);
    expect(secondToolCallBeforeApproval!.result).toBeUndefined();

    // 批准第二次执行
    await page.evaluate(async (toolCallId) => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls && lastMsg.toolCalls.length > 0) {
        await store.approveToolCall(lastMsg.id, toolCallId);
      }
    }, secondToolCallBeforeApproval!.id);

    // 等待执行完成
    await page.waitForTimeout(5000);

    // 获取第二次执行的结果
    let secondToolCallAfterApproval = await page.evaluate((toolCallId) => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls) {
        const toolCall = lastMsg.toolCalls.find((tc: any) => tc.id === toolCallId);
        return toolCall ? {
          id: toolCall.id,
          status: toolCall.status,
          hasResult: !!toolCall.result,
          result: toolCall.result?.substring(0, 100)
        } : null;
      }
      return null;
    }, secondToolCallBeforeApproval!.id);

    console.log('[Test] 第二次执行结果:', secondToolCallAfterApproval);
    expect(secondToolCallAfterApproval).not.toBeNull();
    expect(secondToolCallAfterApproval!.status).toBe('completed');
    expect(secondToolCallAfterApproval!.hasResult).toBe(true);
    expect(secondToolCallAfterApproval!.result).toContain('second-execution');

    console.log('[Test] ✅ 测试通过：连续执行相同命令时不显示旧结果');
  });

  /**
   * 测试 3：验证工具状态流转
   */
  test('验证工具状态正确流转', async ({ page }) => {
    test.setTimeout(120000);

    console.log('[Test] 开始测试：验证工具状态正确流转');

    // 禁用自动批准
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: false });
      }
    });

    // 发送命令
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('帮我执行 echo "status-test"');
    });

    // 等待工具调用出现
    await page.waitForTimeout(3000);

    // 检查初始状态
    let initialStatus = await page.evaluate(() => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls && lastMsg.toolCalls.length > 0) {
        return {
          status: lastMsg.toolCalls[0].status,
          isPartial: lastMsg.toolCalls[0].isPartial
        };
      }
      return null;
    });

    console.log('[Test] 初始状态:', initialStatus);
    expect(initialStatus).not.toBeNull();
    expect(initialStatus!.status).toBe('pending');

    // 获取工具调用 ID
    let toolCallId = await page.evaluate(() => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      return lastMsg?.toolCalls?.[0]?.id || null;
    });

    // 批准执行
    await page.evaluate(async (id) => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls && lastMsg.toolCalls.length > 0) {
        await store.approveToolCall(lastMsg.id, id);
      }
    }, toolCallId);

    // 等待一小段时间，检查中间状态（可能是 approved 或 running）
    await page.waitForTimeout(1000);

    let middleStatus = await page.evaluate((id) => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls) {
        const toolCall = lastMsg.toolCalls.find((tc: any) => tc.id === id);
        return toolCall ? { status: toolCall.status } : null;
      }
      return null;
    }, toolCallId);

    console.log('[Test] 中间状态:', middleStatus);

    // 等待执行完成
    await page.waitForTimeout(5000);

    // 检查最终状态
    let finalStatus = await page.evaluate((id) => {
      const store = (window as any).__chatStore.getState();
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg?.toolCalls) {
        const toolCall = lastMsg.toolCalls.find((tc: any) => tc.id === id);
        return toolCall ? {
          status: toolCall.status,
          hasResult: !!toolCall.result
        } : null;
      }
      return null;
    }, toolCallId);

    console.log('[Test] 最终状态:', finalStatus);
    expect(finalStatus).not.toBeNull();
    expect(finalStatus!.status).toBe('completed');
    expect(finalStatus!.hasResult).toBe(true);

    console.log('[Test] ✅ 测试通过：工具状态正确流转');
  });
});
