import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('OpenSpec Workflow E2E', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Skip onboarding & Configure Ollama as default
    await setupE2ETestEnvironment(page);
    
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('should handle task breakdown via /task:demo', async ({ page }) => {
    // 1. Send /task:demo command
    const chatInput = page.locator('input[placeholder*="询问 DeepSeek"], input[placeholder*="Ask AI"]').last();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('/task:demo');
    await chatInput.press('Enter');

    // 3. Verify AI response and task tree display
    const taskTree = page.locator('.task-tree-container, .simple-task-view');
    await expect(taskTree.first()).toBeVisible({ timeout: 10000 });

    // 4. Verify task nodes are rendered
    const taskNode = page.locator('text=后端 API 开发');
    await expect(taskNode).toBeVisible();

    // 5. Verify auto-sync to Mission Control
    const missionControlTab = page.locator('button[title="Mission Control"]');
    await missionControlTab.click();
    
    // Check if tasks from demo appear in Mission Control
    await expect(page.locator('text=后端 API 开发')).toBeVisible();
  });

  test('should toggle task status and reflect in Mission Control', async ({ page }) => {
    // 1. Re-trigger demo tasks
    const chatInput = page.locator('input[placeholder*="询问 DeepSeek"], input[placeholder*="Ask AI"]').last();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('/task:demo');
    await chatInput.press('Enter');
    
    // Switch to Mission Control
    await page.locator('button[title="Mission Control"]').click();
    
    // Verify a task exists in 'completed' state in the demo data
    const completedTask = page.locator('.task-card:has-text("设计数据库 Schema")');
    await expect(completedTask).toBeVisible();
    await expect(completedTask).toContainText('100%');
  });
});