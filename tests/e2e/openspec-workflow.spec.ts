import { test, expect } from '@playwright/test';

test.describe('OpenSpec Workflow E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Inject localStorage to skip onboarding
    await page.addInitScript(() => {
      const state = {
        completed: true,
        skipped: true,
        remindCount: 0,
        lastRemindDate: null,
      };
      window.localStorage.setItem('ifai_onboarding_state', JSON.stringify(state));
    });

    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('should handle task breakdown via /task:demo', async ({ page }) => {
    // 1. Open AI Chat panel first
    const aiChatButton = page.locator('button[title*="若爱助手"], button[title*="AI Chat"], button:has-text("若爱助手")');
    if (await aiChatButton.isVisible()) {
        await aiChatButton.click();
    } else {
        await page.keyboard.press('Control+l');
    }
    await page.waitForTimeout(500);

    // 2. Send /task:demo command
    const chatInput = page.locator('input[placeholder*="询问 DeepSeek"], input[placeholder*="Ask AI"]').last();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('/task:demo');
    await chatInput.press('Enter');

    // 2. Verify AI response and task tree display
    // The /task:demo command is handled in AIChat.tsx and renders a TaskBreakdownViewer
    const taskTree = page.locator('.task-tree-container, .simple-task-view');
    await expect(taskTree.first()).toBeVisible({ timeout: 10000 });

    // 3. Verify task nodes are rendered
    const taskNode = page.locator('text=后端 API 开发');
    await expect(taskNode).toBeVisible();

    // 4. Verify auto-sync to Mission Control
    const missionControlTab = page.locator('button[title="Mission Control"]');
    await missionControlTab.click();
    
    // Check if tasks from demo appear in Mission Control
    await expect(page.locator('text=后端 API 开发')).toBeVisible();
  });

  test('should toggle task status and reflect in Mission Control', async ({ page }) => {
    // 1. Open AI Chat panel first
    const aiChatButton = page.locator('button[title*="若爱助手"], button[title*="AI Chat"], button:has-text("若爱助手")');
    if (await aiChatButton.isVisible()) {
        await aiChatButton.click();
    } else {
        await page.keyboard.press('Control+l');
    }
    await page.waitForTimeout(500);

    // 2. Re-trigger demo tasks
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
