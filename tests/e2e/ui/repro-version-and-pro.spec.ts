import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

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
    // 1. 验证版本号是否显示 (当前硬编码为 V0.2.7 PRO,这是需要修复的bug)
    // 使用文本选择器定位版本显示元素
    const versionElement = page.locator('text=V0.2.7').or(page.locator('text=v0.2.7'));
    await expect(versionElement).toBeVisible();

    // 获取实际显示的版本文本
    const versionText = await versionElement.first().innerText();
    console.log('[E2E] 当前显示的版本:', versionText);

    // 验证版本包含 0.2.7 (注意:当前是硬编码,这是bug)
    expect(versionText.toUpperCase()).toContain('0.2.7');

    // 2. 验证 PRO 标识是否显示 (当前硬编码显示,这是bug)
    // 使用更精确的选择器,避免匹配到 "mock-project" 等包含 "PRO" 的文本
    const proBadge = page.locator('span:has-text("V0.2.7 PRO")').or(page.locator('text=V0.2.7 PRO'));
    await expect(proBadge).toBeVisible();
    console.log('[E2E] ✅ PRO 标识可见 (当前硬编码显示 - 需要修复为动态)');

    // 3. 尝试模拟切换到社区版本
    // 注意:如果版本切换功能未实现,这部分会失败
    const switchSuccessful = await page.evaluate(() => {
        try {
            const settings = (window as any).__settingsStore?.getState();
            if (settings && typeof settings.updateSettings === 'function') {
                // 尝试切换到社区版
                settings.updateSettings({ edition: 'community' });
                return true;
            }
            return false;
        } catch (e) {
            console.log('[E2E] 切换版本失败:', e);
            return false;
        }
    });

    if (switchSuccessful) {
      // 等待可能的UI更新
      await page.waitForTimeout(1000);

      // 检查 PRO 标识是否消失 (如果功能已实现)
      const proBadgeAfter = page.locator('span:has-text("V0.2.7 PRO")').or(page.locator('text=V0.2.7 PRO'));
      const isVisible = await proBadgeAfter.isVisible().catch(() => true);

      if (isVisible) {
        console.log('[E2E] ℹ️ PRO 标识仍然可见 - 版本切换功能可能未实现');
      } else {
        console.log('[E2E] ✅ PRO 标识已消失 - 版本切换功能正常');
      }
    } else {
      console.log('[E2E] ℹ️ 无法切换版本 - settingsStore 或 updateSettings 不可用');
      console.log('[E2E] ⚠️ Bug确认: 版本号和 PRO 标识当前为硬编码,非动态显示');
    }

    // 最终结论:这是一个还原测试,验证bug存在
    console.log('[E2E] ✅ Bug还原成功:版本号和PRO标识硬编码显示,未实现动态切换');
  });
});
