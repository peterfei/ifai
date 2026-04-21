import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe('Mission Control E2E', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Skip onboarding & Configure Ollama as default
    await setupE2ETestEnvironment(page);
    
    await page.goto('/');
    
    // Wait for the app to be interactive
    await page.waitForTimeout(1000);
  });

  test('should open Mission Control and toggle views', async ({ page }) => {
    await removeJoyrideOverlay(page);

    // 1. Find and click the Mission Control icon in sidebar
    const missionControlTab = page.locator('button[title="Mission Control"]');
    await expect(missionControlTab).toBeVisible();
    await missionControlTab.click();

    // 2. Verify the Mission Control panel header is visible
    const header = page.locator('text=Mission Control');
    await expect(header).toBeVisible();

    // 3. Verify initial view is List View (look for Search input placeholder)
    const searchInput = page.locator('input[placeholder="Quick filter..."]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // 4. Toggle to Timeline View
    const timelineBtn = page.locator('button[title="Timeline view"], button[title="Timeline View"]');
    if (await timelineBtn.count() === 0) {
        // Fallback: click by visible text
        await page.locator('button:has-text("Timeline")').click();
    } else {
        await timelineBtn.first().click();
    }

    // 5. Verify Timeline View content
    // In timeline view, search input should be gone
    await expect(searchInput).not.toBeVisible();

    // Check for timeline specific text (may vary by i18n)
    const emptyTimelineText = page.locator('text=No activity recorded yet').or(page.locator('text=No task history'));
    await expect(emptyTimelineText).toBeVisible();
  });

  test('should handle Snippet Manager integration', async ({ page }) => {
    await removeJoyrideOverlay(page);

    // Click Snippet Manager tab
    const snippetTab = page.locator('button[title="Snippet Manager"]');
    await snippetTab.click();

    // Verify Snippet Manager header
    await expect(page.locator('text=Snippet Manager')).toBeVisible();

    // Check for search input
    await expect(page.locator('input[placeholder="Search snippets..."]')).toBeVisible();
  });
});