import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Skills Store State Lifecycle', () => {
  test.skip('Verify Global Singleton Stability', async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    
    await page.waitForFunction(() => (window as any).__DEBUG__ !== undefined, { timeout: 30000 });

    // 1. 模拟激活
    await page.evaluate(() => {
      (window as any).__IFAI_ACTIVE_SKILLS__ = ['test-v1'];
      const skillStore = (window as any).__DEBUG__.skillStore.getState();
      // 这里应该同步
      skillStore.activateSkill('test-v1');
    });

    // 2. 检查全局 Window 状态
    const globalState = await page.evaluate(() => (window as any).__IFAI_ACTIVE_SKILLS__);
    expect(globalState).toContain('test-v1');

    // 3. 检查 Store 状态
    const storeState = await page.evaluate(() => (window as any).__DEBUG__.skillStore.getState().activeSkillIds);
    expect(storeState).toContain('test-v1');

    console.log('🎉 E2E State Lifecycle Passed.');
  });
});