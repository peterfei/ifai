import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('AI Chat Flickering with Long History (Refined)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(5000);
  });

  test('historical messages should not re-render or flicker', async ({ page }) => {
    // 注入 60 条消息
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        if (store) {
            const messages = [];
            for (let i = 0; i < 60; i++) {
                messages.push({
                    id: `old-msg-${i}`,
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: `History message ${i}`
                });
            }
            store.setState({ messages });
        }
    });

    await page.waitForTimeout(2000);

    // 监控整体 DOM 变动频率，重点关注变动是否随消息数量成比例
    await page.evaluate(() => {
        window.__domChanges = 0;
        const observer = new MutationObserver(() => {
            window.__domChanges++;
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    });

    // 触发新生成
    await page.evaluate(() => (window as any).__E2E_SEND__('Stable test'));

    // 等待流式输出
    await page.waitForTimeout(3000);

    const changes = await page.evaluate(() => window.__domChanges);
    console.log(`[E2E] DOM changes during generation: ${changes}`);
    
    // 如果之前的 Bug 存在，60 条消息同时切换 isStreaming 状态会产生巨大的 DOM 变更量
    // 修复后，变更应该只集中在最后一条消息及其周边的滚动同步上
    expect(changes).toBeLessThan(150); 
  });
});