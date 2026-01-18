import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from './setup';

test.describe('Smart Terminal Loop: Error to Fix', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    // 等待应用加载
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  test('@commercial should show "Debug with AI" button when terminal has errors', async ({ page }) => {
    // 1. 模拟终端产生报错输出
    await page.evaluate(() => {
        const event = new CustomEvent('terminal-output', { 
            detail: { data: 'error[E0433]: failed to resolve: use of undeclared type `User`' } 
        });
        window.dispatchEvent(event);
    });

    // 2. 验证修复按钮是否出现在报错行附近或侧边栏
    const debugBtn = page.locator('button:has-text("Debug with AI"), .terminal-fix-hint');
    await page.waitForTimeout(500);
    await expect(debugBtn).toBeVisible();

    // 3. 点击修复
    await removeJoyrideOverlay(page);
    await debugBtn.click();

    // 4. 验证 AI 聊天框是否自动开启，并带入了报错上下文
    const chatInput = page.locator('[data-testid="chat-input"]');
    await expect(chatInput).toContainText('E0433');
  });
});
