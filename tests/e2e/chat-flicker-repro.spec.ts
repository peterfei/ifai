import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

/**
 * AI 对话列表闪屏复现测试
 * 场景：生成大块代码或长文本时，监测 DOM 变动频率和布局偏移 (CLS)
 */
test.describe('AI Chat Flickering & Stability', () => {
  test.beforeEach(async ({ page }) => {
    // 初始化 E2E 环境（Mock 状态、配置等）
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    // 等待编辑器或输入框就绪
    await page.waitForSelector('textarea, [contenteditable="true"], input');
  });

  test('should not have excessive flickering or layout shifts during large code streaming', async ({ page }) => {
    // 1. Mock 流式输出接口
    // 模拟发送 100 个数据块，包含一个超长代码块，人为制造高频重绘压力
    await page.route('**/v1/chat/completions', async (route) => {
      const encoder = new TextEncoder();
      const chunks = [
        { choices: [{ delta: { role: 'assistant', content: '好的，这是为您生成的长代码：\n\n```typescript\n' }, index: 0 }] },
      ];

      // 生成 50 行重复代码以构建大块内容
      for (let i = 1; i <= 50; i++) {
        chunks.push({ 
          choices: [{ delta: { content: `function testFlicker${i}() {\n  console.log("Line ${i}: Testing UI stability and rendering performance...");\n}\n` }, index: 0 }]
        });
      }

      chunks.push({ choices: [{ delta: { content: '\n```\n生成完毕。' }, index: 0 }] });
      chunks.push({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] });

      const stream = new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            // 模拟 30ms 的网络间隔，这是最容易产生视觉闪烁的频率
            await new Promise(r => setTimeout(r, 30));
          }
          controller.close();
        }
      });

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: stream,
      });
    });

    // 2. 注入监控脚本：测量布局偏移 (CLS) 和 DOM 波动
    await page.evaluate(() => {
      (window as any)._cumulativeLayoutShift = 0;
      (window as any)._mutationCount = 0;
      (window as any)._lastMutationTime = performance.now();
      (window as any)._flickerBursts = 0;

      // 监听布局偏移
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            (window as any)._cumulativeLayoutShift += (entry as any).value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });

      // 监听 DOM 变动频率
      const observer = new MutationObserver((mutations) => {
        const now = performance.now();
        (window as any)._mutationCount += mutations.length;
        
        // 如果两次变动间隔极短 (< 16ms) 且变动节点多，计入一次潜在闪烁脉冲
        if (now - (window as any)._lastMutationTime < 16 && mutations.length > 5) {
          (window as any)._flickerBursts++;
        }
        (window as any)._lastMutationTime = now;
      });

      const container = document.querySelector('.flex-1.overflow-y-auto') || document.body;
      observer.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });
    });

    // 3. 触发生成
    const input = page.locator('textarea, [contenteditable="true"], input').first();
    await input.fill('请生成一段长代码');
    await page.keyboard.press('Enter');

    // 4. 等待生成完成及状态转换（关键点：流式结束瞬间的渲染器切换）
    await page.waitForTimeout(6000); 

    // 5. 获取并验证性能指标
    const metrics = await page.evaluate(() => {
      return {
        cls: (window as any)._cumulativeLayoutShift,
        flickerBursts: (window as any)._flickerBursts,
        totalMutations: (window as any)._mutationCount
      };
    });

    console.log(`[Stability Metrics] CLS: ${metrics.cls.toFixed(4)}, Flicker Bursts: ${metrics.flickerBursts}`);

    /**
     * 断言标准：
     * 1. CLS (布局偏移) 必须小于 0.1。如果渲染器切换导致整个列表跳动，此值会激增。
     * 2. Flicker Bursts (高频抖动脉冲) 应该控制在较低水平。
     */
    expect(metrics.cls, '检测到明显的布局跳动 (CLS > 0.1)').toBeLessThan(0.1);
    expect(metrics.flickerBursts, '检测到高频渲染抖动，可能存在闪屏').toBeLessThan(20);
  });
});
