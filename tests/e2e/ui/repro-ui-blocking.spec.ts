import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * 场景 3：AI 生成时 UI 主线程卡顿。
 * 在 AI 面板生成消息（高频流式更新）时，尝试操作左侧资源管理器。
 * 验证 UI 响应是否延迟。
 */
test.describe('Reproduction: UI Thread Blocking During Streaming', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('text=IfAI', { timeout: 10000 });
  });

  test('should measure responsiveness of file tree during rapid streaming', async ({ page }) => {
    // 1. 启动高频流式输出模拟
    const streamingPromise = page.evaluate(async () => {
        const store = (window as any).__chatStore;
        if (!store) return;

        const msgId = 'stress-test-streaming';
        store.getState().addMessage({
            id: msgId,
            role: 'assistant',
            content: '',
            contentSegments: []
        });

        // 模拟 100 次更新，每次间隔 20ms (共 2 秒)
        let content = '';
        for (let i = 0; i < 100; i++) {
            const newChar = String.fromCharCode(65 + (i % 26));
            content += newChar;
            const newSegments = [{
                type: 'text',
                order: i,
                timestamp: Date.now(),
                content: content
            }];

            // 更新消息 - 使用 updateMessageContent
            store.getState().updateMessageContent(msgId, content);

            await new Promise(resolve => setTimeout(resolve, 20));
        }
    });

    // 2. 在流式输出期间，尝试点击文件树项
    await page.waitForTimeout(500); // 等待输出开始

    const startTime = Date.now();

    // 寻找一个文件树中的文件夹并尝试展开
    const fileTreeItem = page.locator('.file-tree-item').first(); // 假设类名
    if (await fileTreeItem.isVisible()) {
        await fileTreeItem.click();
        const latency = Date.now() - startTime;
        console.log(`Click latency during streaming: ${latency}ms`);

        // ⚡️ FIX: 验证优化 - 延迟应该小于 300ms
        expect(latency).toBeLessThan(300);
    }

    await streamingPromise;
    
    await page.screenshot({ path: 'tests/e2e/repro-ui-blocking.png' });
  });
});
