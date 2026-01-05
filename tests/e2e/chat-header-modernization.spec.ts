import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Chat UI Industrial Grade Header (Deep Stabilized)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    
    // 强力锁定 Store 状态，确保界面切换到聊天面板
    await page.evaluate(() => {
        const layoutStore = (window as any).__layoutStore;
        if (layoutStore) {
            layoutStore.setState({ isChatOpen: true, isSidebarOpen: true });
        }
        const chatStore = (window as any).__chatStore;
        if (chatStore) {
            chatStore.getState().addMessage({
                id: 'header-sync-msg',
                role: 'assistant',
                content: 'Syncing UI...'
            });
        }
    });
    
    await page.waitForTimeout(5000);
  });

  test('should show modernized industrial header UI', async ({ page }) => {
    // 使用全量源码验证 (Point 2)
    const content = await page.content();
    
    // 1. 验证高级版本徽章
    expect(content).toContain('V0.2.6 PRO');
    expect(content).toContain('IfAI Editor');

    // 2. 验证现代质感类名
    expect(content).toContain('backdrop-blur-md');
    
    // 3. 验证选择器图标容器
    const selectors = page.locator('[class*="group/select"]');
    // 在 E2E 下至少应该能匹配到一个 (Provider 或 Model)
    await expect(selectors.first()).toBeVisible({ timeout: 15000 });
  });

  test('should verify settings accessibility', async ({ page }) => {
    // 验证新版布局下的设置按钮
    const settingsBtn = page.locator('button[title="AI Settings"]');
    await expect(settingsBtn.first()).toBeVisible({ timeout: 15000 });
  });
});
