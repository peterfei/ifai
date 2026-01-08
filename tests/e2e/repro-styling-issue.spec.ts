import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

/**
 * 场景 1：重现消息样式混乱。
 * 模拟 AI 在流式输出过程中产生的极端碎片化 ContentSegments，
 * 检查 DOM 是否因为过多的 Markdown 容器而导致布局塌陷或性能下降。
 */
test.describe('Reproduction: Chat Styling Mess', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    // 等待应用加载
    await page.waitForSelector('text=IfAI', { timeout: 10000 });
  });

  test('should reproduce messy styling when message is highly fragmented', async ({ page }) => {
    // 注入一个高度碎片化的消息
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        if (!store) return;

        const segments = [];
        const text = "这是一段测试文字，用于模拟高度碎片化的流式输出。每一个字都是一个独立的段落。";
        for (let i = 0; i < text.length; i++) {
            segments.push({
                type: 'text',
                order: i,
                timestamp: Date.now(),
                content: text[i]
            });
        }

        store.getState().addMessage({
            id: 'fragmented-msg',
            role: 'assistant',
            content: text,
            contentSegments: segments
        });
    });

    // 等待渲染
    await page.waitForTimeout(1000);

    // 检查是否有大量的 _markdownContent 容器
    const markdownContainers = page.locator('div[class*="_markdownContent"]');
    const count = await markdownContainers.count();
    console.log(`Found ${count} markdown containers for a ${"这是一段测试文字，用于模拟高度碎片化的流式输出。每一个字都是一个独立的段落。".length} character message.`);

    // ⚡️ FIX: 验证修复 - 相邻的文本片段应该被合并，容器数量应该很少
    // 38 个字符应该合并为 1-2 个容器（而不是 38 个）
    expect(count).toBeLessThanOrEqual(5);

    // 检查布局是否错乱（例如检查这些容器是否没有垂直排列，而是挤在一起，或者高度异常）
    const firstBox = await markdownContainers.first().boundingBox();
    const lastBox = await markdownContainers.last().boundingBox();

    if (firstBox && lastBox) {
        // 在正常的 Markdown 渲染中，简单的文本应该在同一个块内。
        // 如果它们被分成了几十个 div，我们要确保它们至少在视觉上是连续的。
        // 截图显示的是每个字符占了一行或者有奇怪的间距。
        console.log(`First box: ${JSON.stringify(firstBox)}`);
        console.log(`Last box: ${JSON.stringify(lastBox)}`);
    }
    
    // 允许用户通过视觉检查截图
    await page.screenshot({ path: 'tests/e2e/repro-styling-issue.png' });
  });
});
