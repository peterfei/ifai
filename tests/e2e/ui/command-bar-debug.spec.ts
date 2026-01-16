import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * 命令栏调试测试
 * 用于诊断 P0 问题：命令栏无法打开
 */

test.describe('CommandBar - Debug', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('Debug-01: Check if CommandBar component exists in DOM', async ({ page }) => {
    const commandBar = page.locator('[data-test-id="quick-command-bar"]');
    const count = await commandBar.count();
    console.log('CommandBar elements found:', count);

    const input = page.locator('[data-test-id="quick-command-input"]');
    const inputCount = await input.count();
    console.log('CommandBar input elements found:', inputCount);

    expect(count).toBeGreaterThan(0);
    expect(inputCount).toBeGreaterThan(0);
  });

  test('Debug-02: Press colon key and check console logs', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      if (text.includes('CommandBar') || text.includes('keyboard')) {
        console.log('Browser console:', text);
      }
    });

    await page.click('body');
    await page.waitForTimeout(100);

    await page.keyboard.press(':');
    await page.waitForTimeout(300);

    console.log('Console logs after pressing ::', logs.filter(log => log.includes('CommandBar')));

    const input = page.locator('[data-test-id="quick-command-input"]');
    const isVisible = await input.isVisible();
    console.log('Input visible after pressing ::', isVisible);
  });
});
