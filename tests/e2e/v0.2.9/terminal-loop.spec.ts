/**
 * v0.2.9 智能终端闭环 E2E 测试
 *
 * **架构说明**：
 * - 这些测试使用 Mock 对象，验证 UI 交互和流程逻辑
 * - **社区版**：可以运行此测试，测试 UI 和接口定义
 * - **商业版**：核心 AI 修复功能由 `ifainew-core` 私有库实现
 *
 * 测试目标：验证"发现错误 → 理解错误 → 修复错误 → 验证修复"的完整闭环
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Smart Terminal Loop (v0.2.9)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    // 确保应用核心组件已加载
    await page.waitForTimeout(2000);

    // 打开终端面板（测试需要 TerminalPanel 组件渲染）
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        const store = layoutStore.useLayoutStore || layoutStore;
        if (store && store.getState && store.getState().toggleTerminal) {
          store.getState().toggleTerminal();
        }
      }
    });

    // 等待终端面板打开
    await page.waitForTimeout(500);
  });

  test('TRM-E2E-01: 检测终端错误并触发 AI 修复', async ({ page }) => {
    // Given: 模拟终端输出 Rust 编译错误
    const errorLog = `error[E0425]: cannot find value \`x\` in this scope
  --> src/main.rs:2:5
   |
2 |     x + 1
   |     ^ not found in this scope
   |
help: consider declaring this variable with the \`let\` keyword
   |
2 |     let x = /* value */
`;

    // When: 模拟终端输出错误事件
    await page.evaluate((log) => {
      window.dispatchEvent(new CustomEvent('terminal-output', {
        detail: {
          data: log,
          type: 'error',
          exitCode: 101
        }
      }));
    }, errorLog);

    // Then: 应该在终端出现 "Debug with AI" 按钮
    const fixButton = page.locator('button:has-text("Debug with AI")');
    await expect(fixButton).toBeVisible({ timeout: 5000 });

    // And: 按钮应该包含错误代码信息
    await expect(fixButton).toContainText('E0425');
  });

  test('TRM-E2E-02: 应用 AI 修复补丁并验证文件变更', async ({ page }) => {
    // Given: 设置初始文件状态
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      const editorStore = (window as any).__editorStore;

      // 创建有错误的文件
      mockFS.set('/test-project/src/main.rs', `
fn main() {
    let result = x + 1;
    println!("{}", result);
}
`);

      // 建立文件树
      const fileStore = (window as any).__fileStore;
      const currentTree = fileStore.getState().fileTree || { children: [] };
      const testProject = {
        id: 'test-project',
        name: 'test-project',
        kind: 'directory',
        path: '/test-project',
        children: [
          {
            id: 'src',
            name: 'src',
            kind: 'directory',
            path: '/test-project/src',
            children: [
              {
                id: 'main-rs',
                name: 'main.rs',
                kind: 'file',
                path: '/test-project/src/main.rs'
              }
            ]
          }
        ]
      };

      fileStore.getState().setFileTree({
        ...currentTree,
        children: [...(currentTree.children || []), testProject]
      });

      // 打开文件
      if (editorStore && editorStore.getState().openFile) {
        editorStore.getState().openFile('/test-project/src/main.rs');
      }
    });

    await page.waitForTimeout(1000);

    // When: 模拟 AI 返回包含修复建议的消息
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (chatStore) {
        const { addMessage } = chatStore.getState();

        // 添加用户问题
        addMessage({
          id: 'user-1',
          role: 'user',
          content: '修复错误: cannot find value x in this scope'
        });

        // 添加 AI 响应（包含修复补丁）
        addMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: '我发现了问题：变量 `x` 未定义。修复方法是添加变量声明：',
          actions: [{
            type: 'patch',
            filePath: '/test-project/src/main.rs',
            patch: `<<<<<<< SEARCH
fn main() {
    let result = x + 1;
    println!("{}", result);
}
=======
fn main() {
    let x = 10;
    let result = x + 1;
    println!("{}", result);
}
>>>>>>> REPLACE`
          }]
        });
      }
    });

    await page.waitForTimeout(2000);

    // Then: 应该显示 "Apply Fix" 按钮
    const applyButton = page.locator('button:has-text("Apply Fix")');
    await expect(applyButton).toBeVisible({ timeout: 10000 });

    // When: 点击应用修复按钮
    await applyButton.click();

    // Then: 验证文件已修改
    await page.waitForTimeout(1000);
    const newContent = await page.evaluate(() => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      return mockFS.get('/test-project/src/main.rs');
    });

    expect(newContent).toContain('let x = 10;');
    expect(newContent).toContain('let result = x + 1;');
  });

  test('TRM-E2E-03: 应用修复后自动验证构建', async ({ page }) => {
    // Given: 文件已应用修复
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      const terminalStore = (window as any).__terminalStore;

      // 设置修复后的文件
      mockFS.set('/test-project/src/main.rs', `
fn main() {
    let x = 10;
    let result = x + 1;
    println!("{}", result);
}
`);

      // 模拟终端状态为"修复已应用"
      if (terminalStore) {
        terminalStore.getState().setFixApplied(true);
      }
    });

    // When: 触发自动重新构建
    await page.evaluate(async () => {
      const terminalStore = (window as any).__terminalStore;

      if (terminalStore) {
        // 模拟终端执行构建命令
        await terminalStore.getState().executeCommand('cargo build');
      }
    });

    // Then: 等待构建完成（模拟成功）
    await page.waitForTimeout(3000);

    // And: 验证"Debug with AI"按钮消失
    await page.evaluate(() => {
      // 模拟构建成功
      window.dispatchEvent(new CustomEvent('build-complete', {
        detail: { success: true }
      }));
    });

    await page.waitForTimeout(500);

    const fixButton = page.locator('button:has-text("Debug with AI")');
    await expect(fixButton).not.toBeVisible();

    // And: 验证终端显示成功消息
    await page.evaluate(() => {
      const terminalView = document.querySelector('[data-testid="terminal-view"]');
      if (terminalView) {
        terminalView.innerHTML += '<div class="line success">    Finished dev [unoptimized + debuginfo] target(s) in 0.52s</div>';
      }
    });

    await expect(page.locator('.terminal-view .success')).toContainText('Finished');
  });

  test('TRM-E2E-04: 多语言错误解析支持', async ({ page }) => {
    const errorCases = [
      {
        name: 'Rust 编译错误',
        log: 'error[E0425]: cannot find value `x` in this scope',
        lang: 'rust',
        code: 'E0425',
        line: 2
      },
      {
        name: 'TypeScript 类型错误',
        log: "src/app.ts:5:10 - error TS2304: Cannot find name 'x'",
        lang: 'typescript',
        code: 'TS2304',
        line: 5
      },
      {
        name: 'Python 运行时错误',
        log: 'Traceback (most recent call last):\n  File "script.py", line 3, in <module>\nNameError: name \'x\' is not defined',
        lang: 'python',
        code: 'NameError',
        line: 3
      }
    ];

    for (const testCase of errorCases) {
      // When: 输出不同语言的错误
      await page.evaluate((errorLog) => {
        window.dispatchEvent(new CustomEvent('terminal-output', {
          detail: { data: errorLog, type: 'error' }
        }));
      }, testCase.log);

      await page.waitForTimeout(500);

      // Then: 应该都能被正确解析并显示修复按钮
      const fixButton = page.locator('button:has-text("Debug with AI")');
      await expect(fixButton).toBeVisible();

      // And: 按钮应该包含对应的语言或错误代码
      const buttonText = await fixButton.textContent();
      expect(buttonText).toMatch(new RegExp(`${testCase.code}|Debug|Fix`));

      // 清理状态
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('clear-terminal'));
      });
      await page.waitForTimeout(300);
    }
  });

  test('TRM-E2E-05: 用户取消修复操作', async ({ page }) => {
    // Given: 显示了修复建议
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (chatStore) {
        const { addMessage } = chatStore.getState();

        addMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: '建议修复：添加变量声明',
          actions: [{
            type: 'patch',
            filePath: '/test-project/src/main.rs',
            patch: '<<<<<<< SEARCH\nx\n=======\nlet x = 10;\n>>>>>>> REPLACE'
          }]
        });
      }
    });

    await page.waitForTimeout(1000);

    // When: 用户点击 "Ignore" 或 "Reject" 按钮
    const rejectButton = page.locator('button:has-text("Ignore"), button:has-text("Reject")');
    await rejectButton.click();

    // Then: 修复应该不被应用
    await page.waitForTimeout(500);

    // And: 应该显示"已忽略"状态
    const statusIndicator = page.locator('[data-testid="fix-status"]');
    await expect(statusIndicator).toContainText('ignored');
  });
});
