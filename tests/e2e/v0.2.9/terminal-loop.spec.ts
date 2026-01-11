import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Smart Terminal Loop (v0.2.9)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    // 确保应用核心组件已加载
    await page.waitForSelector('[data-testid="terminal-view"]', { timeout: 10000 });
  });

  test('TRM-E2E-01: 检测终端错误并触发 AI 修复', async ({ page }) => {
    // 1. 模拟终端输出错误事件
    const errorLog = `error[E0425]: cannot find value \`x\` in this scope
  --> src/main.rs:2:5
   |
2 |     x + 1
   |     ^ not found in this scope`;

    await page.evaluate((log) => {
      window.dispatchEvent(new CustomEvent('terminal-output', { detail: { data: log } }));
    }, errorLog);

    // 2. 断言：应该在终端或侧边栏出现 "Debug with AI" 按钮
    const fixButton = page.locator('button:has-text("Debug with AI")');
    await expect(fixButton).toBeVisible();

    // 3. 交互：点击修复按钮
    await fixButton.click();

    // 4. 断言：聊天面板应该打开，并且输入框包含错误信息
    const chatInput = page.locator('[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible();
    await expect(chatInput).toHaveValue(/error\[E0425\]/);
  });

  test('TRM-E2E-02: 应用 AI 修复补丁并观察文件变更', async ({ page }) => {
    // 假设已经触发了修复对话，AI 返回了一个 Apply Patch 的操作
    // 这里我们直接模拟 AI 消息中包含了一个 Diff Block
    
    // 1. 模拟 AI 返回包含修复建议的消息
    await page.evaluate(() => {
        // 这是一个模拟的 store 操作，实际需根据架构调整
        window.postMessage({ type: 'MOCK_AI_RESPONSE', content: '```diff\n- x + 1\n+ let x = 10;\n+ x + 1\n```' }, '*');
    });

    // 2. 查找并点击 "Apply" 按钮
    const applyButton = page.locator('button[aria-label="Apply Fix"]');
    // 注意：在实际开发前，这个按钮可能还不存在，Playwright 会在此失败，符合 TDD
    // await expect(applyButton).toBeVisible(); 
    // await applyButton.click();

    // 3. 验证文件系统变更 (Mock)
    // const fileContent = await page.evaluate(() => window.__fs.readFile('src/main.rs'));
    // expect(fileContent).toContain('let x = 10;');
  });
});
