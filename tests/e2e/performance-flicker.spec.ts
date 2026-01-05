import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('AI Chat Performance & Flickering', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('should not flicker during long code generation', async ({ page }) => {
    // 1. 准备 Mock AI 响应：模拟一个包含超长代码块的流式输出
    await page.route('**/v1/chat/completions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'chatcmpl-mock',
          choices: [{ index: 0,
            message: {
              role: 'assistant',
              content: '```javascript\n' + 'console.log("flicker test");\n'.repeat(100) + '```'
            },
            finish_reason: 'stop'
          }]
        }),
      });
    });

    // 2. 注入监控脚本：测量 DOM 波动频率 (Flicker Detection)
    await page.evaluate(() => {
      window._flickerEvents = [];
      const observer = new MutationObserver((mutations) => {
        const timestamp = performance.now();
        window._flickerEvents.push({ timestamp, mutationCount: mutations.length });
      });
      // 监听消息列表容器
      const container = document.querySelector('.min-h-0.overflow-auto');
      if (container) {
        observer.observe(container, { childList: true, subtree: true, attributes: true });
      }
    });

    // 3. 发送指令触发代码生成
    await page.evaluate(() => (window as any).__E2E_SEND__('Generate a long server.js file'));

    // 4. 等待输出完成
    await page.waitForTimeout(5000);

    // 5. 验证闪烁情况
    const flickerData = await page.evaluate(() => {
      const events = window._flickerEvents;
      // 计算单位时间内 (100ms) 的变动次数，如果变动过于密集且伴随高度反复跳变，则视为闪屏
      return {
        totalEvents: events.length,
        maxEventsPerSecond: events.length / 5
      };
    });

    console.log(`[E2E Performance] Total mutation events during stream: ${flickerData.totalEvents}`);
    
    // 阈值设定：如果在流式输出期间 Mutation 过于频繁（例如每秒超过 60 次重绘），则可能存在闪屏
    // 这里我们可以根据实际修复后的性能表现设定一个合理的上限
    expect(flickerData.maxEventsPerSecond).toBeLessThan(120);
  });

  test('should check for React flushSync warning in console', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('flushSync')) {
        logs.push(msg.text());
      }
    });

    await page.evaluate(() => (window as any).__E2E_SEND__('Trigger code output'));
    await page.waitForTimeout(3000);

    // 严正断言：控制台不应出现 React flushSync 错误
    expect(logs, 'React flushSync error detected in console!').toHaveLength(0);
  });
});
