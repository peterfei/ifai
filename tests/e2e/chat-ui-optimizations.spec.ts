import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Chat UI Optimizations (Deep Injection)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(5000);
  });

  test('should filter out </think> tags from assistant messages', async ({ page }) => {
    // 直接向 Store 注入包含思考标记的消息
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        if (store) {
            store.getState().addMessage({
                id: 'think-test',
                role: 'assistant',
                content: 'Hello. <think>Hidden thought</think> This is the visible part.</think>'
            });
        }
    });

    await page.waitForTimeout(1000);
    const bodyText = await page.innerText('body');
    
    // 验证标记被过滤掉
    expect(bodyText).not.toContain('<think>');
    expect(bodyText).not.toContain('</think>');
    expect(bodyText).toContain('This is the visible part');
  });

  test('should display tree view for agent_batch_read tool call', async ({ page }) => {
    // 注入包含批量读取工具的消息
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        if (store) {
            store.getState().addMessage({
                id: 'tree-test',
                role: 'assistant',
                content: 'I found these files:',
                toolCalls: [{
                    id: 'call-1',
                    tool: 'agent_batch_read',
                    args: { paths: ['src/App.tsx', 'src/main.tsx', 'public/index.html'] },
                    status: 'completed',
                    result: '["src/App.tsx", "src/main.tsx", "public/index.html"]'
                }]
            });
        }
    });

    await page.waitForTimeout(2000);
    const bodyText = await page.innerText('body');
    
    // 验证“文件结构”树状视图
    expect(bodyText).toContain('文件结构');
    expect(bodyText).toContain('src');
    expect(bodyText).toContain('App.tsx');
  });

  test('should show read(path) format for single file read', async ({ page }) => {
    // 注入单文件读取工具
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        if (store) {
            store.getState().addMessage({
                id: 'read-test',
                role: 'assistant',
                content: 'Reading file...',
                toolCalls: [{
                    id: 'call-2',
                    tool: 'agent_read_file',
                    args: { rel_path: 'package.json' },
                    status: 'pending'
                }]
            });
        }
    });

    await page.waitForTimeout(2000);
    const bodyText = await page.innerText('body');
    
    // 验证新格式 read(path)
    expect(bodyText).toContain('read(package.json)');
  });
});