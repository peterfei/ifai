import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Tab Bar Context Menu', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    
    // Wait for store and inject mock opened files
    await page.waitForFunction(() => (window as any).__fileStore !== undefined);
    
    await page.evaluate(() => {
      const store = (window as any).__fileStore;
      const files = [
        { id: 'file-1', name: 'file-1.ts', path: '/mock/file-1.ts', content: '', isDirty: false, language: 'typescript' },
        { id: 'file-2', name: 'file-2.ts', path: '/mock/file-2.ts', content: '', isDirty: false, language: 'typescript' },
        { id: 'file-3', name: 'file-3.ts', path: '/mock/file-3.ts', content: '', isDirty: false, language: 'typescript' },
      ];
      
      store.getState().syncState({ 
        openedFiles: files,
        activeFileId: 'file-1'
      });
    });

    // Wait for tabs to render
    await page.waitForSelector('text=file-1.ts');
  });

  test('should show context menu on right click', async ({ page }) => {
    // Right click on file-1 tab - specifically in the TabBar area
    const tab = page.locator('.horizontal-scrollbar').getByText('file-1.ts').first();
    await tab.click({ button: 'right' });
    
    // Check if options are visible
    await expect(page.getByText('关闭其它')).toBeVisible();
    await expect(page.getByText('关闭所有')).toBeVisible();
  });

  test('should close other tabs', async ({ page }) => {
    // Right click on file-1 tab
    const tab = page.locator('.horizontal-scrollbar').getByText('file-1.ts').first();
    await tab.click({ button: 'right' });
    
    // Click "Close Others"
    await page.getByText('关闭其它').click();
    
    // Only file-1.ts should remain in TabBar
    await expect(page.locator('.horizontal-scrollbar').getByText('file-1.ts')).toBeVisible();
    await expect(page.locator('.horizontal-scrollbar').getByText('file-2.ts')).not.toBeVisible();
    await expect(page.locator('.horizontal-scrollbar').getByText('file-3.ts')).not.toBeVisible();
  });

  test('should close all tabs', async ({ page }) => {
    // Right click on any tab
    const tab = page.locator('.horizontal-scrollbar').getByText('file-1.ts').first();
    await tab.click({ button: 'right' });
    
    // Click "Close All"
    await page.getByText('关闭所有').click();
    
    // No tabs should be visible in TabBar
    await expect(page.locator('.horizontal-scrollbar').getByText('file-1.ts')).not.toBeVisible();
    await expect(page.locator('.horizontal-scrollbar').getByText('file-2.ts')).not.toBeVisible();
    await expect(page.locator('.horizontal-scrollbar').getByText('file-3.ts')).not.toBeVisible();
  });
});
