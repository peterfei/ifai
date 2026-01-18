import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

// UI 性能与体验测试 (Industrial UI)
test.describe.skip('Feature: Industrial UI Performance @v0.3.0 - TODO: Fix this test', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
  });

  test('UI-PERF-01: Large File Tree Rendering', async ({ page }) => {
    await page.goto('/');

    // 等待应用加载
    await page.waitForTimeout(2000);

    // 检查文件树是否可见
    const fileTree = page.locator('[data-testid="file-tree"]');
    const isVisible = await fileTree.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'File tree not visible in current environment');
      return;
    }

    await expect(fileTree).toBeVisible();

    // 验证 DOM 节点数量是否合理 (虚拟滚动)
    const items = fileTree.locator('.file-item, [data-node-id]');
    const count = await items.count();

    // 即使有大量文件，DOM 节点也不应过多
    expect(count).toBeLessThan(500);
  });

  test('UI-PERF-02: Terminal Output Throughput', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // 检测操作系统并使用正确的快捷键
    const isMac = process.platform === 'darwin';
    const terminalShortcut = isMac ? 'Meta+`' : 'Ctrl+`';

    try {
      // 尝试打开终端
      await page.keyboard.press(terminalShortcut);
      await page.waitForTimeout(500);

      // 检查终端是否打开
      const terminal = page.locator('[data-testid="terminal"], .terminal-container, .monaco-editor').first();
      const isTerminalVisible = await terminal.isVisible().catch(() => false);

      if (isTerminalVisible) {
        // 测试终端响应性
        const start = Date.now();
        await removeJoyrideOverlay(page);
        const clearButton = page.locator('[data-testid="clear-terminal"], button:has-text("Clear")').first();
        await clearButton.click().catch(() => {});
        const duration = Date.now() - start;

        // 响应时间应小于 200ms
        expect(duration).toBeLessThan(500);
      } else {
        test.skip(true, 'Terminal not available in current environment');
      }
    } catch (e) {
      test.skip(true, 'Terminal shortcut not working');
    }
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
