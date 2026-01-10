/**
 * v0.2.8 Composer 2.0 真实 UI 交互 E2E 测试
 * 对标 Cursor: 验证多文件 Diff 预览、原子修改与用户决策链路
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../../e2e/setup-utils';

test.describe('Composer 2.0: Realistic UI Interaction', () => {
  const CHAT_INPUT = '[data-testid="chat-input"]';
  const COMPOSER_DIFF_CONTAINER = '.composer-diff-container';
  const ACCEPT_ALL_BTN = 'button:has-text("Accept All"), [data-test-id="accept-all-btn"]';
  const REJECT_ALL_BTN = 'button:has-text("Reject All"), [data-test-id="reject-all-btn"]';

  test.beforeEach(async ({ page }) => {
    // 使用项目标准环境设置
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    // 等待编辑器主界面加载
    await page.waitForSelector('.main-layout-container', { timeout: 10000 });
  });

  test('@commercial should allow user to review and accept multi-file changes', async ({ page }) => {
    // 1. 真实操作：在聊天框输入重构指令
    await page.click(CHAT_INPUT);
    await page.fill(CHAT_INPUT, 'Refactor the Auth service to use the new Logger trait');
    await page.press(CHAT_INPUT, 'Enter');

    // 2. 验证加载状态：UI 应该显示“AI 正在思考/生成”
    await expect(page.locator('.ai-chat-loading-indicator')).toBeVisible();

    // 3. 等待 Composer 生成 Diff 预览 (Commercial Feature)
    // 预期：出现一个包含多个文件的 Diff 区域
    const diffContainer = page.locator(COMPOSER_DIFF_CONTAINER);
    await expect(diffContainer).toBeVisible({ timeout: 30000 });

    // 4. 真实操作：在 Diff 视图中切换文件标签
    const fileTabs = page.locator('.composer-diff-file-tab');
    await expect(fileTabs).toBeVisible();
    const count = await fileTabs.count();
    expect(count).toBeGreaterThan(1); // 至少涉及两个文件（Service 和 Trait）

    await fileTabs.nth(1).click(); // 点击第二个文件标签
    await expect(page.locator('.monaco-diff-editor')).toBeVisible(); // 验证 Monaco Diff 编辑器已挂载

    // 5. 真实操作：点击“全部接受” (Accept All)
    // 预期：触发原子级写入逻辑
    await page.click(ACCEPT_ALL_BTN);

    // 6. 验证：Diff 视图消失，文件树更新
    await expect(diffContainer).not.toBeVisible();
    // 内存验证辅助：检查 Store 状态确认变更已同步
    const isSynced = await page.evaluate(() => {
        const store = (window as any).__E2E_GET_STORE__();
        return store.fileSyncStatus === 'synced';
    });
    expect(isSynced).toBeTruthy();
  });

  test('@commercial should rollback all files when "Reject All" is clicked', async ({ page }) => {
    // 1. 发送修改指令
    await page.fill(CHAT_INPUT, 'Add documentation to all utility functions');
    await page.press(CHAT_INPUT, 'Enter');

    // 2. 等待 Diff 预览出现
    await page.waitForSelector(COMPOSER_DIFF_CONTAINER);

    // 3. 真实操作：点击"拒绝全部"
    await page.click(REJECT_ALL_BTN);

    // 4. 验证：文件内容未发生变化
    // 可以通过读取文件树或内存状态来验证
    await expect(page.locator(COMPOSER_DIFF_CONTAINER)).not.toBeVisible();
    const hasChanges = await page.evaluate(() => (window as any).__E2E_HAS_UNCOMMITTED_CHANGES__());
    expect(hasChanges).toBeFalsy();
  });

  test('@commercial should handle partial acceptance of changes', async ({ page }) => {
    // 1. 触发重构
    await page.fill(CHAT_INPUT, 'Update imports in src/core and src/utils');
    await page.press(CHAT_INPUT, 'Enter');

    // 2. 在 Diff 预览中，只针对第一个文件点击“Accept”
    const firstFileAcceptBtn = page.locator('.composer-file-row').first().locator('.accept-single-file-btn');
    await firstFileAcceptBtn.click();

    // 3. 验证：只有该文件被标记为已应用，预览容器依然存在（因为还有未处理的文件）
    await expect(page.locator(COMPOSER_DIFF_CONTAINER)).toBeVisible();
    await expect(firstFileAcceptBtn).not.toBeVisible(); // 或者变为“已应用”状态
  });
});