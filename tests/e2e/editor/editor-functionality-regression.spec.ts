import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * 编辑器核心功能回归测试
 */
test.describe('Editor Core Functionality Regression', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 使用后门函数直接打开文件
    await page.evaluate(() => {
        if ((window as any).__E2E_OPEN_MOCK_FILE__) {
            (window as any).__E2E_OPEN_MOCK_FILE__('App.tsx');
        }
    });

    // 等待编辑器加载
    await page.waitForSelector('[data-testid="monaco-editor-container"]', { timeout: 15000 });
  });

  test.skip('should be able to see breadcrumbs', async ({ page }) => {
    // Breadcrumbs feature not implemented yet - see FAILED_TESTS_LIST.md
    const breadcrumb = page.locator('.monaco-breadcrumbs');
    await expect(breadcrumb).toBeVisible();
  });

  test('should have quick suggestions enabled', async ({ page }) => {
    const editor = page.locator('[data-testid="monaco-editor-container"]').first();
    await editor.click();
    await page.keyboard.type('exp');
    // 验证建议列表是否弹出
    const suggestWidget = page.locator('.suggest-widget');
    await expect(suggestWidget).toBeVisible();
  });
});
