/**
 * 基础 E2E 测试模板
 *
 * 用于不需要真实 AI 的常规 E2E 测试
 *
 * 使用说明：
 * 1. 复制此文件到 tests/e2e/ 目录
 * 2. 修改 test.describe 和测试用例
 * 3. 根据需要调整 beforeEach 设置
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('基础E2E测试模板', () => {
  test.beforeEach(async ({ page }) => {
    // 可选：监听浏览器控制台日志
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('[Browser Error]', msg.text());
      }
    });

    // 设置测试环境
    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 等待应用加载完成
    await page.waitForTimeout(3000);
  });

  test('基础测试用例：验证页面元素', async ({ page }) => {
    // 测试基本 UI 元素

    // 示例：验证聊天面板存在
    const chatButton = page.locator('[data-testid="chat-button"]');
    await expect(chatButton).toBeVisible();
  });

  test('测试用例：交互操作', async ({ page }) => {
    // 测试用户交互

    // 示例：点击按钮
    await page.click('[data-testid="some-button"]');

    // 验证结果
    await expect(page.locator('[data-testid="result"]')).toContainText('Expected Result');
  });

  test('测试用例：表单操作', async ({ page }) => {
    // 测试表单填写和提交

    // 填写输入框
    await page.fill('[data-testid="input-field"]', 'Test content');

    // 点击提交
    await page.click('[data-testid="submit-button"]');

    // 验证结果
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
  });

  test('测试用例：使用 mock 文件系统', async ({ page }) => {
    // 设置 mock 文件
    await page.evaluate(() => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      mockFS.set('/test-project/test.txt', 'Mock content');
    });

    // 验证文件已创建
    const fileExists = await page.evaluate(() => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      return mockFS.has('/test-project/test.txt');
    });

    expect(fileExists).toBe(true);
  });
});

/**
 * 快速参考：常见选择器和操作
 */

// 选择器示例
const selectors = {
  // By data-testid (推荐)
  byTestId: '[data-testid="element-id"]',

  // By text
  byText: 'text=Button Text',

  // By role
  byRole: 'role=button[name="Submit"]',

  // By CSS selector
  byCSS: '.class-name #id-name',

  // By XPath
  byXPath: 'xpath=//div[@data-testid="element"]'
};

// 操作示例
const actions = {
  // 点击
  click: 'await page.click(selector);',

  // 填写输入
  fill: 'await page.fill(selector, "value");',

  // 获取文本
  getText: 'const text = await page.textContent(selector);',

  // 等待元素
  waitFor: 'await page.waitForSelector(selector);',

  // 断言可见
  expectVisible: 'await expect(page.locator(selector)).toBeVisible();',

  // 断言文本
  expectText: 'await expect(page.locator(selector)).toContainText("expected");'
};

// Mock 文件系统示例
test('Mock 文件系统示例', async ({ page }) => {
  await page.evaluate(() => {
    const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
    const fileStore = (window as any).__fileStore;

    // 创建文件
    mockFS.set('/project/src/App.tsx', 'export function App() {}');

    // 设置文件树
    fileStore.getState().setFileTree({
      children: [
        {
          id: 'app-tsx',
          name: 'App.tsx',
          kind: 'file',
          path: '/project/src/App.tsx'
        }
      ]
    });

    // 打开文件
    const editorStore = (window as any).__editorStore;
    if (editorStore?.getState()?.openFile) {
      editorStore.getState().openFile('/project/src/App.tsx');
    }
  });
});
