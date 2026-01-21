import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from './setup-utils';

test.describe('Editor Performance Regression', () => {
  test('confirm app render count increases on asynchronous file updates', async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    
    await page.waitForLoadState('networkidle');
    await removeJoyrideOverlay(page);
    await page.waitForTimeout(5000);

    // 1. 获取初始渲染次数
    const beforeUpdateCount = await page.evaluate(() => (window as any).__appRenderCount || 0);
    console.log(`Before update: ${beforeUpdateCount}`);

    // 2. 模拟 10 次异步更新，规避 React 的同步批处理
    await page.evaluate(async () => {
      const fileStore = (window as any).__fileStore.getState();
      const activeFileId = fileStore.activeFileId;
      
      for (let i = 0; i < 10; i++) {
        fileStore.updateFileContent(activeFileId, `content ${i}`);
        // 关键：等待一小段时间让 React 完成本次渲染循环
        await new Promise(r => setTimeout(r, 100));
      }
    });

    // 3. 检查渲染次数增量
    const afterUpdateCount = await page.evaluate(() => (window as any).__appRenderCount || 0);
    const renderDelta = afterUpdateCount - beforeUpdateCount;
    
    console.log(`Delta after 10 async updates: ${renderDelta}`);

    // 预期：Delta 应该接近 10
    // 断言失败以确认问题
    expect(renderDelta).toBeLessThan(3);
  });
});
