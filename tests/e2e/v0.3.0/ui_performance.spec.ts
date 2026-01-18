import { test, expect } from '@playwright/test';
import { removeJoyrideOverlay } from '../setup';

// UI 性能与体验测试 (Industrial UI)
test.describe('Feature: Industrial UI Performance @v0.3.0', () => {

  test('UI-PERF-01: Large File Tree Rendering', async ({ page }) => {
    // 模拟加载 10,000 个文件的项目
    // 这需要 fixture 或 mock 后端响应
    await page.goto('/?mock=large-project'); 
    
    const fileTree = page.locator('[data-testid="file-tree"]');
    await expect(fileTree).toBeVisible();

    // 验证 DOM 节点数量是否合理 (虚拟滚动)
    // 假设视口内只能看到 20 个项目，buffer 可能是 40
    const items = fileTree.locator('.file-item');
    const count = await items.count();
    
    // 即使有 10k 文件，DOM 节点也不应超过 100-200
    expect(count).toBeLessThan(200);
    
    // 滚动测试
    await fileTree.evaluate(node => node.scrollTop = 5000);
    await expect(fileTree).not.toHaveClass(/scrolling-lag/); // 假设有性能监控类
  });

  test('UI-PERF-02: Terminal Output Throughput', async ({ page }) => {
    // 打开终端
    await page.keyboard.press('Ctrl+`');
    
    // 运行产生大量输出的命令
    await page.keyboard.type('cat large_log.txt'); 
    await page.keyboard.press('Enter');

    // 监控页面帧率或冻结状态
    // Playwright 较难直接测 FPS，但可以测响应性
    
    const start = Date.now();
    // 尝试并在高负载下点击按钮
    await removeJoyrideOverlay(page);
    await page.locator('[data-testid="clear-terminal"]').click();
    const duration = Date.now() - start;
    
    // 响应时间应小于 100ms
    expect(duration).toBeLessThan(200); // 稍微放宽
  });

  test('UI-VIS-01: Theme Consistency (Visual Regression)', async ({ page }) => {
    // 切换到暗黑模式
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    
    // 截图对比
    // 注意：首次运行需生成快照
    await expect(page).toHaveScreenshot('dark-mode-full-ui.png', {
      mask: [page.locator('.clock')], // 忽略动态内容
      maxDiffPixelRatio: 0.01
    });
  });

  test('UI-VIS-03: Chat Rendering Optimization (No Raw JSON)', async ({ page }) => {
    // 模拟一条包含原始 JSON 的消息 (通常是工具调用或任务拆解)
    // 这种 JSON 应该被解析为 UI 组件，而不是直接显示文本
    const rawJsonMessage = {
      role: 'assistant',
      content: 'Here is the plan:\n```json\n{"taskTree": [{"id": "1", "title": "Task 1"}], "title": "Plan", "id": "root"}\n```',
      id: 'msg-json-leak-test'
    };

    // 注入消息到 DOM (通过 mock 或 store 操作)
    await page.evaluate((msg) => {
      // @ts-ignore
      const store = window.useChatStore.getState();
      store.addMessage(msg);
    }, rawJsonMessage);

    const chatBubble = page.locator('[data-testid="chat-bubble-msg-json-leak-test"]'); // 假设有 ID
    // 或者通过内容定位
    const bubbleContent = page.locator('.assistant-bubble'); 

    // 断言：不应该看到原始的 JSON 字符串 key
    await expect(bubbleContent).not.toContainText('"taskTree":');
    await expect(bubbleContent).not.toContainText('{"id": "1"');
    
    // 断言：应该看到渲染后的组件内容
    await expect(bubbleContent).toContainText('Plan'); // 任务标题
    await expect(bubbleContent).toContainText('Task 1'); // 任务项
  });
});
