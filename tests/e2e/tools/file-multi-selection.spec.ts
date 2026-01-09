import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('File Tree Multi-selection', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    
    // Wait for React to render something
    await page.waitForFunction(() => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    }, { timeout: 15000 });

    // Wait for the store to be available
    await page.waitForFunction(() => (window as any).__fileStore !== undefined, { timeout: 15000 });
    
    // Inject a mock file tree with several files
    await page.evaluate(() => {
      const store = (window as any).__fileStore;
      const mockTree = {
        id: 'root',
        name: 'mock-project',
        path: '/mock/project',
        kind: 'directory',
        children: [
          { id: 'file-1', name: 'file-1.ts', path: '/mock/project/file-1.ts', kind: 'file' },
          { id: 'file-2', name: 'file-2.ts', path: '/mock/project/file-2.ts', kind: 'file' },
          { id: 'file-3', name: 'file-3.ts', path: '/mock/project/file-3.ts', kind: 'file' },
          { id: 'file-4', name: 'file-4.ts', path: '/mock/project/file-4.ts', kind: 'file' },
        ]
      };
      
      store.getState().setFileTree(mockTree);
      store.getState().setExpandedNodes(new Set(['root']));
      store.getState().setSelectedNodeIds([]);
      store.getState().setLastSelectedNodeId(null);
    });

    // Wait for the file tree to render
    await page.waitForSelector('text=file-1.ts', { timeout: 10000 });
  });

  test('should select multiple files with Command/Control key', async ({ page }) => {
    const isMac = process.platform === 'darwin';
    const modifier = isMac ? 'Meta' : 'Control';

    // Click file-1
    await page.getByText('file-1.ts', { exact: true }).click();
    
    // Check if file-1 is selected
    const file1 = page.locator('[data-node-id="file-1"]');
    await expect(file1).toHaveAttribute('data-selected', 'true');

    // Command/Control + Click file-3
    await page.keyboard.down(modifier);
    await page.getByText('file-3.ts', { exact: true }).click();
    await page.keyboard.up(modifier);

    // Both file-1 and file-3 should be selected
    const file3 = page.locator('[data-node-id="file-3"]');
    await expect(file1).toHaveAttribute('data-selected', 'true');
    await expect(file3).toHaveAttribute('data-selected', 'true');
    
    // file-2 should NOT be selected
    const file2 = page.locator('[data-node-id="file-2"]');
    await expect(file2).toHaveAttribute('data-selected', 'false');
  });

  test('should select a range of files with Shift key', async ({ page }) => {
    // Click file-1
    await page.getByText('file-1.ts', { exact: true }).click();
    
    // Shift + Click file-3
    await page.keyboard.down('Shift');
    await page.getByText('file-3.ts', { exact: true }).click();
    await page.keyboard.up('Shift');

    // file-1, file-2, and file-3 should be selected
    const file1 = page.locator('[data-node-id="file-1"]');
    const file2 = page.locator('[data-node-id="file-2"]');
    const file3 = page.locator('[data-node-id="file-3"]');
    
    await expect(file1).toHaveAttribute('data-selected', 'true');
    await expect(file2).toHaveAttribute('data-selected', 'true');
    await expect(file3).toHaveAttribute('data-selected', 'true');
    
        // file-4 should NOT be selected
    
        const file4 = page.locator('[data-node-id="file-4"]');
    
        await expect(file4).toHaveAttribute('data-selected', 'false');
    
      });
    
    
    
        test('should delete multiple files via context menu', async ({ page }) => {
    
    
    
          const isMac = process.platform === 'darwin';
    
    
    
          const modifier = isMac ? 'Meta' : 'Control';
    
    
    
      
    
    
    
          const getTreeItem = (name: string) => page.locator('[data-testid="file-tree-item"]').filter({ hasText: name });
    
    
    
      
    
    
    
          // 1. Select file-1 and file-2
    
    
    
          await getTreeItem('file-1.ts').click();
    
    
    
          await page.keyboard.down(modifier);
    
    
    
          await getTreeItem('file-2.ts').click();
    
    
    
          await page.keyboard.up(modifier);
    
    
    
      
    
    
    
          // 2. Mock window.confirm to auto-accept
    
    
    
          page.on('dialog', async dialog => {
    
    
    
            console.log('DIALOG MESSAGE:', dialog.message());
    
    
    
            expect(dialog.message()).toContain('2'); // Should mention '2' items
    
    
    
            await dialog.accept();
    
    
    
          });
    
    
    
      
    
    
    
          // 3. Right-click on one of the selected files
    
    
    
          await getTreeItem('file-1.ts').click({ button: 'right' });
    
    
    
      
    
    
    
          // 4. Click 'Delete' in context menu
    
    
    
          await page.getByText('删除').click();
    
    
    
      
    
    
    
          // 5. Verify context menu closes
    
    
    
          await expect(page.getByText('删除')).not.toBeVisible();
    
    
    
        });
    
    
    
      
    
    });
    
    