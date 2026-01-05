import { test, expect } from '@playwright/test';

test.describe('Mission Control E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Handle the welcome dialog that blocks interactions
    // The dialog asks about downloading local AI models
    try {
      // Wait for app to initialize and modal to appear
      await page.waitForTimeout(1000);

      // Check if welcome modal is present by looking for its heading
      const modalVisible = await page.locator('h1:has-text("欢迎使用 IfAI Editor"), h1:has-text("Welcome")').isVisible().catch(() => false);

      if (modalVisible) {
        // Look for the skip button "跳过，使用云端" or similar skip options
        const skipButton = page.locator('button:has-text("跳过，使用云端"), button:has-text("稍后提醒我"), button:has-text("Skip"), button:has-text("Remind")').first();

        if (await skipButton.isVisible()) {
          await skipButton.click();
          await page.waitForTimeout(500); // Wait for modal close animation
        } else {
          // Fallback: Try clicking any button that might close the modal
          const anyButton = page.locator('.fixed.inset-0.z-50 button').nth(2);
          await anyButton.click().catch(() => {});
          await page.waitForTimeout(500);
        }

        // Verify modal is closed
        const stillVisible = await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false);
        if (stillVisible) {
          console.log('Warning: Modal may still be visible');
        }
      }
    } catch (e) {
      console.log('Modal handling completed:', e.message);
    }

    // Wait for the app to be interactive
    await page.waitForTimeout(1000);
  });

  test('should open Mission Control and toggle views', async ({ page }) => {
    // 1. Find and click the Mission Control icon in sidebar
    // We use the title attribute which we just updated to "Mission Control"
    const missionControlTab = page.locator('button[title="Mission Control"]');
    await expect(missionControlTab).toBeVisible();
    await missionControlTab.click();

    // 2. Verify the Mission Control panel header is visible
    const header = page.locator('text=Mission Control');
    await expect(header).toBeVisible();

    // 3. Verify initial view is List View (look for Search input placeholder)
    const searchInput = page.locator('input[placeholder="快速过滤..."]');
    await expect(searchInput).toBeVisible();

    // 4. Toggle to Timeline View
    const timelineBtn = page.locator('button[title="Timeline View"]');
    if (await timelineBtn.count() === 0) {
        // Fallback if title is not set as expected: use icon-based selector or index
        await page.locator('button >> svg').nth(5).click(); // Approximate index
    } else {
        await timelineBtn.click();
    }

    // 5. Verify Timeline View content
    // In timeline view, search input should be gone
    await expect(searchInput).not.toBeVisible();
    
    // Check for timeline specific text
    const emptyTimelineText = page.locator('text=No activity recorded yet');
    await expect(emptyTimelineText).toBeVisible();
  });

  test('should handle Snippet Manager integration', async ({ page }) => {
    // Click Snippet Manager tab
    const snippetTab = page.locator('button[title="Snippet Manager"]');
    await snippetTab.click();

    // Verify Snippet Manager header
    await expect(page.locator('text=Snippet Manager')).toBeVisible();

    // Check for search input
    await expect(page.locator('input[placeholder="Search snippets..."]')).toBeVisible();
  });
});
