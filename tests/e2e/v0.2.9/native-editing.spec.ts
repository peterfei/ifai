import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Native Editing Experience (v0.2.9)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    // 打开一个文件
    await page.keyboard.press('Meta+P');
    await page.keyboard.type('App.tsx');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.monaco-editor');
  });

  test('EDT-E2E-01: 行内编辑 (Cmd+K) 触发及 Diff 显示', async ({ page }) => {
    // 1. 选中编辑器中的几行文本
    // Playwright 很难精确控制 Monaco 选区，这里模拟快捷键触发
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Meta+K');

    // 2. 断言：应该出现行内输入框
    const inlineInput = page.locator('.inline-edit-widget input');
    await expect(inlineInput).toBeVisible();

    // 3. 输入指令并确认
    await inlineInput.fill('Change text to Hello AI');
    await page.keyboard.press('Enter');

    // 4. 断言：应该出现 Diff 对比视图 (Inline Diff Zone)
    const diffZone = page.locator('.monaco-diff-editor');
    await expect(diffZone).toBeVisible();
  });

  test('EDT-E2E-02: 符号级智能补全建议', async ({ page }) => {
    await page.locator('.monaco-editor').click();
    // 移动光标并触发补全
    await page.keyboard.type('use');
    await page.keyboard.press('Control+Space'); // 强制触发建议

    // 断言：补全列表中应该包含 React 的 useEffect (假设已索引)
    const suggestWidget = page.locator('.suggest-widget');
    await expect(suggestWidget).toBeVisible();
    
    // 验证列表中是否有特定的 Icon 或 Label
    await expect(suggestWidget).toContainText('useEffect');
  });
});
