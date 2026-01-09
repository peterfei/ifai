import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

/**
 * 场景 2：还原多会话输入框禁用未隔离的问题。
 */
test.describe('Reproduction: Chat Thread Input Isolation', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('text=IfAI', { timeout: 10000 });
  });

  test('should keep other threads enabled when one thread is loading', async ({ page }) => {
    // 1. 创建两个会话
    await page.evaluate(() => {
        const threadStore = (window as any).__threadStore.getState();
        threadStore.createNewThread(); // Thread 1
        threadStore.createNewThread(); // Thread 2
    });

    const threads = await page.evaluate(() => (window as any).__threadStore.getState().threads);
    const thread1Id = threads[0].id;
    const thread2Id = threads[1].id;

    // 2. 在 Thread 1 中模拟加载状态
    await page.evaluate((id) => {
        const chatStore = (window as any).__chatStore.getState();
        const threadStore = (window as any).__threadStore.getState();
        
        threadStore.switchThread(id);
        chatStore.setIsLoading(true); // 模拟 Thread 1 正在交互
    }, thread1Id);

    // 验证 Thread 1 输入框被禁用
    const input1 = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="Ask"]');
    await expect(input1).toBeDisabled();

    // 3. 切换到 Thread 2
    await page.evaluate((id) => {
        const threadStore = (window as any).__threadStore.getState();
        threadStore.switchThread(id);
    }, thread2Id);

    // 4. 验证 Thread 2 的输入框是否可用
    // 如果存在 bug，由于 isLoading 是全局共享的，这里也会被禁用
    const input2 = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="Ask"]');
    await expect(input2).toBeEnabled();
  });
});
