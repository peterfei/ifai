import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Chat UI Refined Optimizations', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(5000);
  });

  test('should show professional labels for directory listing', async ({ page }) => {
    // 注入列目录工具
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        if (store) {
            store.getState().addMessage({
                id: 'list-dir-test',
                role: 'assistant',
                content: 'Checking current folder.',
                toolCalls: [{
                    id: 'call-list',
                    tool: 'agent_list_dir',
                    args: { rel_path: '.' },
                    status: 'completed',
                    result: '["src", "package.json"]'
                }]
            });
        }
    });

    await page.waitForTimeout(1000);
    const bodyText = await page.innerText('body');
    
    // 验证专业标签 (Point 2)
    expect(bodyText.toUpperCase()).toContain('TARGET DIRECTORY');
    expect(bodyText).toContain('.');
  });

  test('should show semantic accessing label in header', async ({ page }) => {
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        if (store) {
            store.getState().addMessage({
                id: 'header-test',
                role: 'assistant',
                content: 'Reading...',
                toolCalls: [{
                    id: 'call-header',
                    tool: 'agent_read_file',
                    args: { rel_path: 'README.md' },
                    status: 'pending'
                }]
            });
        }
    });

    await page.waitForTimeout(1000);
    const bodyText = await page.innerText('body');
    
    // 验证头部语义描述 (Point 2)
    expect(bodyText).toContain('Accessing README.md');
  });

  test('should verify no overlap margin in tool header', async ({ page }) => {
    // 注入任意工具以检查头部样式
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        if (store) {
            store.getState().addMessage({
                id: 'style-test',
                role: 'assistant',
                content: 'Style check',
                toolCalls: [{
                    id: 'call-style',
                    tool: 'agent_execute_command',
                    args: { command: 'npm start' },
                    status: 'pending'
                }]
            });
        }
    });

    await page.waitForTimeout(1000);
    
    // 验证头部是否包含防止遮挡的内边距 (Point 1)
    const header = page.locator('.flex.items-center.gap-3.pr-12').first();
    await expect(header).toBeVisible();
  });
});
