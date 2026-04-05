/**
 * 测试工具浏览器按钮功能
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Tool Explorer Button', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('[Browser Error]', msg.text());
      }
    });

    await setupE2ETestEnvironment(page, {
      useRealAI: false,
    });
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 清除 localStorage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.reload();
    await page.waitForTimeout(3000);
  });

  test('should display tool explorer button in sidebar', async ({ page }) => {
    // 等待侧边栏加载
    await page.waitForSelector('[data-testid="activity-bar-capsule"]', { timeout: 10000 });

    // 检查工具浏览器按钮是否存在
    const toolButton = page.locator('[data-testid="tool-explorer-button"]');
    await expect(toolButton).toBeVisible();
  });

  test('should toggle tool explorer panel when clicking button', async ({ page }) => {
    // 等待侧边栏加载
    await page.waitForSelector('[data-testid="activity-bar-capsule"]', { timeout: 10000 });

    // 点击工具浏览器按钮
    const toolButton = page.locator('[data-testid="tool-explorer-button"]');
    await toolButton.click();
    await page.waitForTimeout(1000);

    // 验证工具面板打开
    const toolPanel = page.locator('[data-testid="tool-explorer-panel"]');
    await expect(toolPanel).toBeVisible();

    // 再次点击关闭
    await toolButton.click();
    await page.waitForTimeout(1000);

    // 验证工具面板关闭
    await expect(toolPanel).not.toBeVisible();
  });
});
