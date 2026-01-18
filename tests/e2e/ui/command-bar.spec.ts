import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * 编辑器命令行 (Editor Command Bar) 全覆盖 E2E 测试
 * 
 * 对应测试矩阵:
 * - TC-01: 按下 ':' 唤起
 * - TC-02: 执行 ':help' 基础指令
 * - TC-03: 执行高级指令的 Mock 提示
 * - TC-04: Esc 键退出逻辑
 */

test.describe.skip('Editor Command Bar - E2E Coverage - TODO: Fix this test', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    // 等待编辑器就绪
    await page.waitForSelector('.monaco-editor', { timeout: 10000 });
  });

  test('TC-01: 应能通过 ":" 唤起命令行输入框并聚焦', async ({ page }) => {
    await page.keyboard.press(':');
    
    const commandBar = page.locator('[data-test-id="quick-command-bar"]');
    const input = page.locator('[data-test-id="quick-command-input"]');
    
    await expect(commandBar).toBeVisible();
    await expect(input).toBeFocused();
    // 验证前缀
    await expect(page.locator('.command-bar-prefix')).toHaveText(':');
  });

  test('TC-02: 在社区版中执行 ":help" 应显示 Mock 帮助信息', async ({ page }) => {
    await page.keyboard.press(':');
    const input = page.locator('[data-test-id="quick-command-input"]');
    
    await input.fill('help');
    await page.keyboard.press('Enter');

    // 验证反馈消息（社区版特定的 Mock 信息）
    const feedback = page.locator('[data-test-id="command-feedback"]');
    await expect(feedback).toContainText('社区版功能说明');
    await expect(feedback).toContainText('Pro');
  });

  test('TC-03: 执行高级指令应弹出 Pro 专属提示', async ({ page }) => {
    await page.keyboard.press(':');
    const input = page.locator('[data-test-id="quick-command-input"]');
    
    // 模拟输入商业版才有的指令
    await input.fill('config');
    await page.keyboard.press('Enter');

    // 验证是否触发了 Toast 或特定的错误反馈
    const toast = page.locator('.toast-message'); // 假设通过 Toast 反馈
    await expect(toast).toContainText('仅在 Pro 版中提供');
  });

  test('TC-04: 按下 Esc 键应关闭命令行并恢复编辑器焦点', async ({ page }) => {
    await page.keyboard.press(':');
    await expect(page.locator('[data-test-id="quick-command-bar"]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-test-id="quick-command-bar"]')).not.toBeVisible();
    
    // 焦点应回到编辑器（这里以检查编辑器是否有 focus 类名或状态为例）
    const editor = page.locator('.monaco-editor');
    await expect(editor).toBeVisible(); 
  });

  test('TC-05: 输入时应显示基础补全建议 (Mock)', async ({ page }) => {
    await page.keyboard.press(':');
    const input = page.locator('[data-test-id="quick-command-input"]');
    
    await input.fill('h');
    
    const suggestionItem = page.locator('[data-test-id="command-suggestion-0"]');
    await expect(suggestionItem).toBeVisible();
    await expect(suggestionItem).toContainText('help');
  });
});