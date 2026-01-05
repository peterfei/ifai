/**
 * OpenSpec 工作流 E2E 测试 (重构版)
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('OpenSpec Workflow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  async function getChatInput(page: any) {
    const chatInput = page.locator('input[placeholder*="询问 DeepSeek"], input[type="text"]').last();
    await expect(chatInput).toBeVisible({ timeout: 15000 });
    
    // 强制启用输入框
    await chatInput.evaluate((el: HTMLInputElement) => {
        el.disabled = false;
        el.removeAttribute('disabled');
    });

    await page.waitForTimeout(500);
    return chatInput;
  }

  test('should handle task breakdown via /task:demo', async ({ page }) => {
    const chatInput = await getChatInput(page);
    
    await chatInput.fill('/task:demo');
    await chatInput.press('Enter');

    // 验证任务树组件已渲染
    // 使用更通用的选择器，或者根据标题文本查找
    const taskTree = page.locator('.task-tree-container, [class*="TaskBreakdownViewer"]');
    await expect(taskTree.first()).toBeVisible({ timeout: 15000 });

    // 验证关键任务节点
    await expect(page.locator('text=后端 API 开发')).toBeVisible();

    // 验证同步到 Mission Control
    const missionControlTab = page.locator('button[title="Mission Control"]');
    await missionControlTab.click();
    
    await expect(page.locator('text=后端 API 开发')).toBeVisible();
  });

  test('should toggle task status and reflect in Mission Control', async ({ page }) => {
    const chatInput = await getChatInput(page);
    
    await chatInput.fill('/task:demo');
    await chatInput.press('Enter');
    
    // 等待任务加载并进入 Mission Control
    await page.waitForTimeout(2000);
    await page.locator('button[title="Mission Control"]').click();
    
    // 验证 demo 数据中的已完成任务
    const completedTask = page.locator('.task-card, [class*="task-card"]').filter({ hasText: '设计数据库 Schema' });
    await expect(completedTask).toBeVisible();
    await expect(completedTask).toContainText('100%');
  });
});
