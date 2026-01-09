import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

/**
 * 场景 3：还原版本号 Hardcode 及 Pro 标识逻辑问题。
 */
test.describe('Reproduction: Version Display and Pro Badge', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('text=IfAI', { timeout: 10000 });
  });

  test('should display dynamic system version and correct Pro badge', async ({ page }) => {
    // 1. 验证版本号是否从 Tauri 获取 (Mock 返回的是 0.2.6)
    const titlebarText = await page.innerText('.titlebar-container, .header-container'); // 假设容器类名
    expect(titlebarText).toContain('v0.2.6');
    expect(titlebarText).not.toContain('v0.1.0'); // 假设之前 hardcode 的是 v0.1.0

    // 2. 模拟商业版本环境
    await page.evaluate(() => {
        // 假设通过此方式判断版本
        (window as any).__IS_PRO_VERSION__ = true;
        // 强制重绘或更新 store
        const settings = (window as any).__settingsStore?.getState();
        if (settings) settings.updateSettings({ edition: 'pro' });
    });
    
    // 验证 Pro 标识显示
    await expect(page.locator('text=Pro')).toBeVisible();

    // 3. 模拟社区版本环境
    await page.evaluate(() => {
        (window as any).__IS_PRO_VERSION__ = false;
        const settings = (window as any).__settingsStore?.getState();
        if (settings) settings.updateSettings({ edition: 'community' });
    });

    // 验证 Pro 标识消失
    await expect(page.locator('text=Pro')).not.toBeVisible();
  });
});
