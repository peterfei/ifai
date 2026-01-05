import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Chat UI Advanced Optimizations', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(5000);
  });

  test('should show advanced typewriter effect during streaming write', async ({ page }) => {
    // 注入正在生成的写入工具
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        if (store) {
            store.getState().addMessage({
                id: 'streaming-write-test',
                role: 'assistant',
                content: 'Generating code...', 
                toolCalls: [{
                    id: 'call-streaming',
                    tool: 'agent_write_file',
                    args: { rel_path: 'app.py', content: 'import os\nprint("Hello")' },
                    status: 'pending',
                    isPartial: true
                }]
            });
        }
    });

    await page.waitForTimeout(1000);
    const bodyText = await page.innerText('body');
    
    // 验证新版 UI 元素（不区分大小写匹配）
    expect(bodyText.toUpperCase()).toContain('STREAMING'); 
    expect(bodyText).toContain('app.py');
    
    // 使用属性选择器避开斜杠转义问题
    const typewriter = page.locator('[class*="group/typewriter"]');
    await expect(typewriter).toBeVisible();
  });

  test('should display modernized tool call container', async ({ page }) => {
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        if (store) {
            store.getState().addMessage({
                id: 'ui-test',
                role: 'assistant',
                content: 'Running tool...', 
                toolCalls: [{
                    id: 'call-ui',
                    tool: 'agent_execute_command',
                    args: { command: 'ls -la' },
                    status: 'completed',
                    result: 'total 0\ndrwxr-xr-x  2 user  staff  64'
                }]
            });
        }
    });

    await page.waitForTimeout(1000);
    
    // 使用更健壮的属性选择器
    const toolContainer = page.locator('[class*="group/tool"]');
    await expect(toolContainer).toBeVisible();
    
    const bodyText = await page.innerText('body').then(t => t.toUpperCase());
    expect(bodyText).toContain('OUTPUT RESULT');
  });

  test('should filter out all think tags', async ({ page }) => {
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        if (store) {
            store.getState().addMessage({
                id: 'think-test-2',
                role: 'assistant',
                content: 'Start. <think>Internal logic</think> End.'
            });
        }
    });

    await page.waitForTimeout(1000);
    const bodyText = await page.innerText('body');
    expect(bodyText).not.toContain('<think>');
    // 模糊匹配，忽略多余空格
    expect(bodyText.replace(/\s+/g, ' ')).toContain('Start. End.');
  });
});