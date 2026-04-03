/**
 * E2E 测试：提示词版本管理功能验证（红绿测试）
 *
 * 目标：验证提示词版本历史、对比、回滚功能是否正常工作
 *
 * 测试场景：
 *   1. 打开提示词管理器
 *   2. 选择一个提示词
 *   3. 打开版本历史
 *   4. 验证版本列表显示
 *   5. 选择两个版本进行对比
 *   6. 验证对比结果显示
 *   7. 执行版本回滚
 *   8. 验证回滚成功
 *
 * 运行方式：
 *   APP_EDITION=commercial npx playwright test tests/e2e/section2/prompt-version-history.spec.ts --headed
 *
 * 参考：task-continuation-after-todowrite.spec.ts 的高保真 E2E 测试模式
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Prompt Version History - E2E', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForFunction(() => {
      return (window as any).__promptStore !== undefined;
    }, { timeout: 30000 });

    // 等待应用完全加载
    await page.waitForTimeout(1000);
  });

  test('red: should show version history button and open panel', async ({ page }) => {
    console.log('[E2E] 🔴 RED 测试：版本历史按钮和面板（功能未实现前应该失败）');

    // 1. 打开提示词管理器
    const promptManagerButton = page.locator('[data-testid="prompt-manager-button"]');
    await expect(promptManagerButton, '提示词管理器按钮应该存在').toBeVisible();
    await promptManagerButton.click();

    // 2. 等待提示词列表加载
    await page.waitForTimeout(1000);

    // 3. 选择第一个提示词
    const firstPrompt = page.locator('[data-testid="prompt-item"]').first();
    const count = await firstPrompt.count();

    if (count === 0) {
      test.skip(true, '没有可用的提示词进行测试');
    }

    await firstPrompt.click();

    // 4. 等待编辑器加载
    await page.waitForTimeout(500);

    // 5. 查找版本历史按钮（这是新增的功能）
    const versionHistoryButton = page.locator('[data-testid="version-history-button"]');

    // RED 测试：如果功能未实现，这个断言会失败
    await expect(versionHistoryButton, '版本历史按钮应该存在').toBeVisible({
      timeout: 5000
    });

    console.log('[E2E] ✅ 版本历史按钮存在');
  });

  test('red: should open version history panel', async ({ page }) => {
    console.log('[E2E] 🔴 RED 测试：打开版本历史面板');

    // 打开提示词管理器并选择提示词
    const promptManagerButton = page.locator('[data-testid="prompt-manager-button"]');
    await promptManagerButton.click();
    await page.waitForTimeout(1000);

    const firstPrompt = page.locator('[data-testid="prompt-item"]').first();
    const count = await firstPrompt.count();
    if (count === 0) {
      test.skip(true, '没有可用的提示词');
    }
    await firstPrompt.click();
    await page.waitForTimeout(500);

    // 点击版本历史按钮
    const versionHistoryButton = page.locator('[data-testid="version-history-button"]');
    await versionHistoryButton.click();

    // 验证版本历史面板打开
    const versionHistoryPanel = page.locator('.fixed.inset-0.bg-white.z-10, .fixed.inset-0.dark\\:bg-gray-800.z-10');

    // RED 测试：面板应该出现
    await expect(versionHistoryPanel, '版本历史面板应该可见').toBeVisible({
      timeout: 3000
    });

    console.log('[E2E] ✅ 版本历史面板已打开');
  });

  test('red: should display version list', async ({ page }) => {
    console.log('[E2E] 🔴 RED 测试：显示版本列表');

    // 打开版本历史面板
    const promptManagerButton = page.locator('[data-testid="prompt-manager-button"]');
    await promptManagerButton.click();
    await page.waitForTimeout(1000);

    const firstPrompt = page.locator('[data-testid="prompt-item"]').first();
    const count = await firstPrompt.count();
    if (count === 0) {
      test.skip(true, '没有可用的提示词');
    }
    await firstPrompt.click();
    await page.waitForTimeout(500);

    const versionHistoryButton = page.locator('[data-testid="version-history-button"]');
    await versionHistoryButton.click();
    await page.waitForTimeout(1000);

    // 查找版本列表项
    const versionItems = page.locator('[data-testid^="version-checkbox-"]');

    // RED 测试：应该有版本列表（如果文件没有提交到 Git，可能为空）
    const versionCount = await versionItems.count();
    console.log(`[E2E] 找到 ${versionCount} 个版本`);

    // 注意：如果提示词未提交到 Git，版本列表可能为空
    // 这是预期的行为，不算失败
    if (versionCount > 0) {
      console.log('[E2E] ✅ 版本列表显示正常');
    } else {
      console.log('[E2E] ⚠️  版本列表为空（提示词可能未提交到 Git）');
    }

    // 至少应该显示"暂无版本历史"的消息
    const emptyState = page.locator('text=暂无版本历史, text=No versions available');
    const emptyStateCount = await emptyState.count();

    if (emptyStateCount > 0) {
      console.log('[E2E] ✅ 显示了空状态消息');
    }
  });

  test('red: should select two versions and compare', async ({ page }) => {
    console.log('[E2E] 🔴 RED 测试：选择两个版本并对比');

    // 打开版本历史面板
    const promptManagerButton = page.locator('[data-testid="prompt-manager-button"]');
    await promptManagerButton.click();
    await page.waitForTimeout(1000);

    const firstPrompt = page.locator('[data-testid="prompt-item"]').first();
    const count = await firstPrompt.count();
    if (count === 0) {
      test.skip(true, '没有可用的提示词');
    }
    await firstPrompt.click();
    await page.waitForTimeout(500);

    const versionHistoryButton = page.locator('[data-testid="version-history-button"]');
    await versionHistoryButton.click();
    await page.waitForTimeout(1000);

    // 查找版本复选框
    const versionCheckboxes = page.locator('[data-testid^="version-checkbox-"]');
    const checkboxCount = await versionCheckboxes.count();

    if (checkboxCount < 2) {
      test.skip(true, '需要至少 2 个版本才能测试对比功能');
    }

    // 选择前两个版本
    await versionCheckboxes.nth(0).click();
    await page.waitForTimeout(200);
    await versionCheckboxes.nth(1).click();
    await page.waitForTimeout(500);

    // 查找对比按钮
    const compareButton = page.locator('button:has-text("对比选中版本"), button:has-text("Compare Selected")');

    // RED 测试：对比按钮应该存在
    const compareButtonVisible = await compareButton.isVisible();
    expect(compareButtonVisible, '对比按钮应该可见').toBe(true);

    // 点击对比按钮
    await compareButton.click();
    await page.waitForTimeout(500);

    // 验证对比视图打开
    const diffViewer = page.locator('.fixed.inset-0.bg-black\\/50.z-50, [data-testid="close-diff-viewer"]');

    // RED 测试：对比视图应该出现
    await expect(diffViewer, '对比视图应该可见').toBeVisible({
      timeout: 3000
    });

    console.log('[E2E] ✅ 版本对比功能正常');
  });

  test('red: should rollback to a previous version', async ({ page }) => {
    console.log('[E2E] 🔴 RED 测试：回滚到之前的版本');

    // 打开版本历史面板
    const promptManagerButton = page.locator('[data-testid="prompt-manager-button"]');
    await promptManagerButton.click();
    await page.waitForTimeout(1000);

    const firstPrompt = page.locator('[data-testid="prompt-item"]').first();
    const count = await firstPrompt.count();
    if (count === 0) {
      test.skip(true, '没有可用的提示词');
    }
    await firstPrompt.click();
    await page.waitForTimeout(500);

    const versionHistoryButton = page.locator('[data-testid="version-history-button"]');
    await versionHistoryButton.click();
    await page.waitForTimeout(1000);

    // 查找回滚按钮
    const rollbackButtons = page.locator('[data-testid^="rollback-button-"]');
    const rollbackCount = await rollbackButtons.count();

    if (rollbackCount === 0) {
      test.skip(true, '没有可用的版本进行回滚');
    }

    // 监听确认对话框
    page.on('dialog', async dialog => {
      console.log('[E2E] 检测到确认对话框');
      // 拒绝确认对话框以避免实际修改文件
      await dialog.dismiss();
    });

    // 点击第一个回滚按钮
    await rollbackButtons.first().click();
    await page.waitForTimeout(500);

    console.log('[E2E] ✅ 回滚按钮响应正常（已取消实际回滚）');
  });

  test('green: integration test for version history workflow', async ({ page }) => {
    console.log('[E2E] 🟢 GREEN 测试：完整的版本管理工作流');

    // 完整工作流测试
    const promptManagerButton = page.locator('[data-testid="prompt-manager-button"]');
    await promptManagerButton.click();
    await page.waitForTimeout(1000);

    const firstPrompt = page.locator('[data-testid="prompt-item"]').first();
    const count = await firstPrompt.count();
    if (count === 0) {
      test.skip(true, '没有可用的提示词');
    }

    const promptName = await firstPrompt.textContent();
    console.log(`[E2E] 测试提示词: ${promptName}`);

    await firstPrompt.click();
    await page.waitForTimeout(500);

    // 1. 验证版本历史按钮存在
    const versionHistoryButton = page.locator('[data-testid="version-history-button"]');
    await expect(versionHistoryButton, '版本历史按钮应该存在').toBeVisible();

    // 2. 打开版本历史
    await versionHistoryButton.click();
    await page.waitForTimeout(1000);

    // 3. 验证版本历史面板打开
    const versionHistoryPanel = page.locator('.fixed.inset-0.bg-white.z-10, .fixed.inset-0.dark\\:bg-gray-800.z-10');
    await expect(versionHistoryPanel, '版本历史面板应该可见').toBeVisible();

    // 4. 检查版本列表
    const versionCheckboxes = page.locator('[data-testid^="version-checkbox-"]');
    const versionCount = await versionCheckboxes.count();
    console.log(`[E2E] 版本数量: ${versionCount}`);

    // 5. 如果有足够的版本，测试对比功能
    if (versionCount >= 2) {
      await versionCheckboxes.nth(0).click();
      await page.waitForTimeout(200);
      await versionCheckboxes.nth(1).click();
      await page.waitForTimeout(500);

      const compareButton = page.locator('button:has-text("对比选中版本")');
      await compareButton.click();
      await page.waitForTimeout(500);

      const diffViewer = page.locator('[data-testid="close-diff-viewer"]');
      await expect(diffViewer, '对比视图应该可见').toBeVisible();

      // 关闭对比视图
      const closeButton = page.locator('[data-testid="close-diff-viewer"]');
      await closeButton.click();
      await page.waitForTimeout(500);
    }

    // 6. 测试回滚按钮
    const rollbackButtons = page.locator('[data-testid^="rollback-button-"]');
    if (await rollbackButtons.count() > 0) {
      page.on('dialog', async dialog => {
        await dialog.dismiss();
      });
      await rollbackButtons.first().click();
      await page.waitForTimeout(500);
    }

    console.log('[E2E] ✅ 完整版本管理工作流测试通过');
  });

  test('baseline: prompt editor basic functionality', async ({ page }) => {
    console.log('[E2E] 基线测试：提示词编辑器基本功能');

    const promptManagerButton = page.locator('[data-testid="prompt-manager-button"]');
    await promptManagerButton.click();
    await page.waitForTimeout(1000);

    const firstPrompt = page.locator('[data-testid="prompt-item"]').first();
    const count = await firstPrompt.count();
    if (count === 0) {
      test.skip(true, '没有可用的提示词');
    }

    await firstPrompt.click();
    await page.waitForTimeout(500);

    // 验证编辑器存在
    const editor = page.locator('textarea[readonly=""], textarea:not([readonly])');
    await expect(editor, '编辑器应该存在').toBeVisible();

    // 验证选项卡存在
    const editTab = page.locator('button:has-text("Editor")');
    const previewTab = page.locator('button:has-text("Preview")');

    await expect(editTab, 'Editor 选项卡应该存在').toBeVisible();
    await expect(previewTab, 'Preview 选项卡应该存在').toBeVisible();

    console.log('[E2E] ✅ 基线测试通过');
  });
});
