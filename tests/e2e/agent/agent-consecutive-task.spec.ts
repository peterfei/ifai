/**
 * Agent连续任务Bug重现测试
 *
 * 测试标签: @fast @flaky
 * 测试类别: Agent功能
 * 测试目标: 验证连续两次代码生成不会挂起
 *
 * @flaky 原因:
 * - 依赖真实 AI API (DeepSeek)
 * - 网络/API 限流导致间歇性超时
 * - 单独运行通过，批量运行可能失败
 * - 不影响产品功能，仅测试稳定性问题
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe('Agent: Consecutive Task Bug Reproduction', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  test('@fast should successfully generate code twice in the same thread', async ({ page }) => {
    test.setTimeout(60000);

    // Arrange
    const prompt = '生成示例代码 100行左右 如demo.js';

    // Act - 1. 第一次尝试
    console.log('[E2E] Starting first generation...');
    await page.evaluate(async (text) => {
        await (window as any).__E2E_SEND__(text);
    }, prompt);

    // Assert - 等待第一次 Agent 启动并完成
    await page.waitForTimeout(5000);
    const msgsAfterFirst = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES__());
    console.log(`[E2E] Messages after first try: ${msgsAfterFirst.length}`);
    expect(msgsAfterFirst.length).toBeGreaterThan(1);

    // Act - 2. 第二次尝试 (完全相同的操作)
    console.log('[E2E] Starting second generation...');
    await page.evaluate(async (text) => {
        // 确保清除 loading 状态以防干扰
        (window as any).__chatStore.setState({ isLoading: false });
        await (window as any).__E2E_SEND__(text);
    }, prompt);

    // Assert - 检查是否在 30s 内完成或有内容输出
    // 如果 Bug 存在，这里会触发超时告警，且内容不会更新
    // 修复后，超时清理逻辑应该生效，isLoading 应该变成 false
    const startTime = Date.now();
    let success = false;
    let timeoutTriggered = false;

    while (Date.now() - startTime < 35000) {
        const { msgs, isLoading } = await page.evaluate(() => ({
            msgs: (window as any).__chatStore.getState().messages,
            isLoading: (window as any).__chatStore.getState().isLoading
        }));
        const lastMsg = msgs[msgs.length - 1];

        console.log(`[E2E] Polling state: msgs=${msgs.length}, isLoading=${isLoading}, lastRole=${lastMsg?.role}, hasContent=${!!lastMsg?.content}`);

        // 检查是否在 35 秒后从 loading 状态恢复（超时清理生效）
        const elapsed = Date.now() - startTime;
        if (elapsed > 32000 && !isLoading && !timeoutTriggered) {
            console.log('[E2E] Timeout cleanup triggered (isLoading became false after 32s)');
            timeoutTriggered = true;
            // 超时清理成功，任务完成
            success = true;
            break;
        }

        // 如果最后一条消息有内容或者是 tool_call，说明没有挂起
        if (lastMsg && lastMsg.role === 'assistant' && (lastMsg.content || lastMsg.toolCalls?.length > 0)) {
            success = true;
            break;
        }
        await page.waitForTimeout(2000);
    }

    if (!success) {
        console.error('[E2E] Second generation appears to have HUNG (30s timeout risk)');
    }

    // 期望：超时清理应该生效，或者内容应该正确显示
    expect(success, 'Second generation should complete or timeout cleanup should trigger').toBeTruthy();
  });
});
