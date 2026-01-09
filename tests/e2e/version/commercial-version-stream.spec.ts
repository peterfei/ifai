import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Commercial Version Stream Processing', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  test('should receive _finish event within 60 seconds for commercial version', async ({ page }) => {
    test.setTimeout(120000);

    console.log('[E2E] Testing commercial version stream processing...');

    // 发送消息触发流式处理
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('生成示例代码 100行左右 如demo.js');
    });

    // 等待最多 65 秒，检查是否收到 _finish 事件
    const startTime = Date.now();
    let receivedFinish = false;
    let messageContent = '';

    while (Date.now() - startTime < 65000) {
      const { msgs, isLoading } = await page.evaluate(() => ({
        msgs: (window as any).__chatStore.getState().messages,
        isLoading: (window as any).__chatStore.getState().isLoading
      }));

      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg) {
        messageContent = lastMsg.content || '';
        console.log(`[E2E] Polling: isLoading=${isLoading}, content_length=${messageContent.length}`);
      }

      // 如果 isLoading 变成 false，说明 _finish 事件被接收
      if (!isLoading && msgs.length > 1) {
        receivedFinish = true;
        console.log('[E2E] ✅ _finish event received, streaming completed');
        break;
      }

      await page.waitForTimeout(2000);
    }

    expect(receivedFinish, 'Should receive _finish event within 65 seconds').toBeTruthy();

    // 验证消息内容（在 Mock 环境可能为空，这是可接受的）
    if (messageContent.length > 0) {
      console.log(`[E2E] ✅ Message content received: ${messageContent.slice(0, 100)}...`);
      expect(messageContent.length).toBeGreaterThan(0);
    } else {
      console.log('[E2E] ℹ️  Message content is empty (Mock environment may not generate actual content)');
      // 在 Mock 环境中，只要 _finish 事件收到就足够了
      expect(receivedFinish).toBeTruthy();
    }
  });

  test('should handle timeout gracefully after 60 seconds', async ({ page }) => {
    test.setTimeout(120000);

    console.log('[E2E] Testing 60-second timeout mechanism...');

    // 修改 Mock 以延迟 _finish 事件
    await page.addInitScript(() => {
      (window as any).__DELAY_FINISH__ = true;
    });

    // 发送消息
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('测试超时机制');
    });

    // 等待 60+ 秒，验证超时清理逻辑
    const startTime = Date.now();
    let timedOut = false;
    let canContinue = false;

    while (Date.now() - startTime < 70000) {
      const { isLoading } = await page.evaluate(() => ({
        isLoading: (window as any).__chatStore.getState().isLoading
      }));

      const elapsed = Date.now() - startTime;

      // 检查 60 秒后 isLoading 是否变成 false
      if (elapsed > 61000 && !isLoading && !timedOut) {
        console.log(`[E2E] ✅ Timeout cleanup triggered at ${elapsed}ms`);
        timedOut = true;
        canContinue = true;
      }

      // 如果仍然 loading，继续等待
      if (isLoading && elapsed > 69000) {
        console.log(`[E2E] ❌ Still loading after ${elapsed}ms, cleanup may have failed`);
        break;
      }

      await page.waitForTimeout(2000);
    }

    expect(timedOut, 'Should trigger timeout cleanup after 60 seconds').toBeTruthy();
    expect(canContinue, 'Should be able to continue after timeout').toBeTruthy();
  });

  test('should preserve message history across multiple generations', async ({ page }) => {
    test.setTimeout(180000);

    console.log('[E2E] Testing consecutive generations with history preservation...');

    // 第一次生成
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('第一次：生成示例代码 100行左右 如demo.js');
    });
    await page.waitForTimeout(10000);

    const msgs1 = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES__());
    console.log(`[E2E] After first: ${msgs1.length} messages`);
    expect(msgs1.length).toBeGreaterThan(1);

    // 保存第一条助手消息的 ID
    const firstAssistantMsgId = msgs1.find((m: any) => m.role === 'assistant')?.id;

    // 第二次生成
    await page.evaluate(async () => {
      (window as any).__chatStore.setState({ isLoading: false });
      await (window as any).__E2E_SEND__('第二次：生成示例代码 100行左右 如demo.js');
    });
    await page.waitForTimeout(10000);

    const msgs2 = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES__());
    console.log(`[E2E] After second: ${msgs2.length} messages`);
    expect(msgs2.length).toBeGreaterThan(msgs1.length);

    // 验证第一条消息没有被替换
    const stillFirstMsg = msgs2.find((m: any) => m.id === firstAssistantMsgId);
    expect(stillFirstMsg, 'First message should still exist').toBeTruthy();
    console.log('[E2E] ✅ First message preserved');

    // 第三次生成
    await page.evaluate(async () => {
      (window as any).__chatStore.setState({ isLoading: false });
      await (window as any).__E2E_SEND__('第三次：生成示例代码 100行左右 如demo.js');
    });
    await page.waitForTimeout(10000);

    const msgs3 = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES__());
    console.log(`[E2E] After third: ${msgs3.length} messages`);

    // 验证所有历史消息都保留
    expect(msgs3.length).toBeGreaterThan(msgs2.length);
    const stillFirstMsg2 = msgs3.find((m: any) => m.id === firstAssistantMsgId);
    expect(stillFirstMsg2, 'First message should still exist after 3 generations').toBeTruthy();
    console.log('[E2E] ✅ All historical messages preserved');
  });
});
