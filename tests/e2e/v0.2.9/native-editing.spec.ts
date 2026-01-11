/**
 * v0.2.9 原生编辑体验 E2E 测试

 * **架构说明**：
 * - 这些测试使用 Mock 对象，验证 UI 交互和流程逻辑
 * - **社区版**：可以运行此测试，测试 UI 和接口定义
 * - **商业版**：核心功能由 `ifainew-core` 私有库实现
 *
 * 测试目标：验证行内编辑 (Cmd+K) 和符号级智能补全功能
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Native Editing Experience (v0.2.9)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('EDT-E2E-01: 行内编辑 (Cmd+K) 触发及 Diff 显示', async ({ page }) => {
    // Given: 打开一个测试文件
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      const editorStore = (window as any).__editorStore;
      const fileStore = (window as any).__fileStore;

      // 创建测试文件
      mockFS.set('/test-project/src/App.tsx', `
import React, { useState } from 'react';

export function App() {
    const [count, setCount] = useState(0);

    function handleClick() {
        setCount(count + 1);
    }

    return (
        <div>
            <h1>Count: {count}</h1>
            <button onClick={handleClick}>Increment</button>
        </div>
    );
}
`);

      // 建立文件树
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
                id: 'app-tsx',
                name: 'App.tsx',
                kind: 'file',
                path: '/test-project/src/App.tsx'
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
        editorStore.getState().openFile('/test-project/src/App.tsx');
      }
    });

    await page.waitForTimeout(1000);

    // When: 在编辑器中按 Cmd+K
    await page.locator('.monaco-editor, .editor').click();
    await page.keyboard.press('Meta+K');

    await page.waitForTimeout(500);

    // Then: 应该出现行内输入框
    const inlineInput = page.locator('.inline-edit-widget input, [data-testid="inline-input"]');
    await expect(inlineInput).toBeVisible();

    // When: 输入指令并确认
    await inlineInput.fill('Add error handling to handleClick');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(2000);

    // Then: 应该出现 Diff 对比视图
    const diffEditor = page.locator('.monaco-diff-editor, .diff-editor, [data-testid="diff-editor"]');
    await expect(diffEditor).toBeVisible({ timeout: 10000 });

    // And: Diff 应该显示原始版本和修改版本
    await expect(diffEditor).toContainText('function handleClick');
  });

  test('EDT-E2E-02: 选中代码后的行内编辑', async ({ page }) => {
    // Given: 打开文件并选中特定代码
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      const editorStore = (window as any).__editorStore;
      const fileStore = (window as any).__fileStore;

      mockFS.set('/test.ts', `
function calculate(a: number, b: number): number {
    const result = a + b;
    return result;
}

export default calculate;
`);

      const currentTree = fileStore.getState().fileTree || { children: [] };
      fileStore.getState().setFileTree({
        ...currentTree,
        children: [...(currentTree.children || []), {
          id: 'test-project',
          name: 'test-project',
          kind: 'directory',
          path: '/test-project',
          children: [{
            id: 'test-ts',
            name: 'test.ts',
            kind: 'file',
            path: '/test-project/test.ts'
          }]
        }]
      });

      if (editorStore && editorStore.getState().openFile) {
        editorStore.getState().openFile('/test-project/test.ts');
      }
    });

    await page.waitForTimeout(1000);

    // When: 选中几行代码（模拟 Shift+↓）
    await page.locator('.monaco-editor, .editor').click();
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.up('Shift');

    await page.waitForTimeout(300);

    // 然后按 Cmd+K
    await page.keyboard.press('Meta+K');

    await page.waitForTimeout(500);

    // Then: 输入框应该包含选中的文本
    const inlineInput = page.locator('.inline-edit-widget input, [data-testid="inline-input"]');
    await expect(inlineInput).toBeVisible();
    const inputValue = await inlineInput.inputValue();
    expect(inputValue).toMatch(/calculate|result/);
  });

  test('EDT-E2E-03: Esc 取消行内编辑', async ({ page }) => {
    // Given: 触发了行内编辑
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      const editorStore = (window as any).__editorStore;
      const fileStore = (window as any).__fileStore;

      mockFS.set('/test.ts', 'function hello() { return "world"; }');

      const currentTree = fileStore.getState().fileTree || { children: [] };
      fileStore.getState().setFileTree({
        ...currentTree,
        children: [...(currentTree.children || []), {
          id: 'test-project',
          name: 'test-project',
          kind: 'directory',
          path: '/test-project',
          children: [{
            id: 'test-ts',
            name: 'test.ts',
            kind: 'file',
            path: '/test-project/test.ts'
          }]
        }]
      });

      if (editorStore && editorStore.getState().openFile) {
        editorStore.getState().openFile('/test-project/test.ts');
      }
    });

    await page.waitForTimeout(1000);

    // 触发行内编辑
    await page.locator('.monaco-editor, .editor').click();
    await page.keyboard.press('Meta+K');

    await page.waitForTimeout(500);

    const inlineInput = page.locator('.inline-edit-widget input, [data-testid="inline-input"]');
    await expect(inlineInput).toBeVisible();

    // When: 用户输入一些内容后按 Esc 取消
    await inlineInput.fill('some instruction');
    await page.keyboard.press('Escape');

    await page.waitForTimeout(500);

    // Then: 输入框应该消失
    await expect(inlineInput).not.toBeVisible();

    // And: 编辑器内容应该保持不变（未应用修改）
    const editorContent = await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      if (editor) {
        return editor.getValue();
      }
      return '';
    });

    expect(editorContent).toContain('function hello()');
    expect(editorContent).not.toContain('some instruction');
  });

  test('EDT-E2E-04: 符号级智能补全 - 来自索引的符号', async ({ page }) => {
    // Given: 准备已索引的符号
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      const symbolIndexer = (window as any).__symbolIndexer;
      const editorStore = (window as any).__editorStore;
      const fileStore = (window as any).__fileStore;

      // 创建定义文件
      mockFS.set('/hooks/useCustom.ts', `
import { useState, useEffect } from 'react';

export function useCustomHook(initialValue: number) {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        // setup logic
        return () => {
            // cleanup logic
        };
    }, []);

    return { value, setValue };
}

export const CONSTANT_VALUE = 42;
`);

      // 建立符号索引
      if (symbolIndexer) {
        await symbolIndexer.indexFile('/hooks/useCustom.ts', mockFS.get('/hooks/useCustom.ts'));
      }

      // 创建使用文件
      mockFS.set('/consumer.ts', '');

      // 建立文件树
      const currentTree = fileStore.getState().fileTree || { children: [] };
      const testProject = {
        id: 'test-project',
        name: 'test-project',
        kind: 'directory',
        path: '/test-project',
        children: [
          {
            id: 'hooks',
            name: 'hooks',
            kind: 'directory',
            path: '/test-project/hooks',
            children: [{
              id: 'use-custom-ts',
              name: 'useCustom.ts',
              kind: 'file',
              path: '/test-project/hooks/useCustom.ts'
            }]
          },
          {
            id: 'consumer-ts',
            name: 'consumer.ts',
            kind: 'file',
            path: '/test-project/consumer.ts'
          }
        ]
      };

      fileStore.getState().setFileTree({
        ...currentTree,
        children: [...(currentTree.children || []), testProject]
      });

      // 打开使用文件
      if (editorStore && editorStore.getState().openFile) {
        editorStore.getState().openFile('/test-project/consumer.ts');
      }
    });

    await page.waitForTimeout(1000);

    // When: 输入符号前缀并触发补全
    await page.locator('.monaco-editor, .editor').click();
    await page.keyboard.type('use');
    await page.keyboard.press('Control+Space'); // 强制触发补全

    await page.waitForTimeout(1000);

    // Then: 补全列表应该包含来自符号索引的建议
    const suggestWidget = page.locator('.suggest-widget, [data-testid="suggest-widget"]');
    await expect(suggestWidget).toBeVisible();

    // And: 应该包含我们索引的符号
    await expect(suggestWidget).toContainText('useCustomHook');
    await expect(suggestWidget).toContainText('useEffect');
    await expect(suggestWidget).toContainText('CONSTANT_VALUE');

    // And: 补全项应该显示来源文件
    await expect(suggestWidget).toContainText('useCustom.ts');
  });

  test('EDT-E2E-05: 基于最近打开文件的上下文补全', async ({ page }) => {
    // Given: 按顺序打开几个文件
    const files = [
      {
        path: '/components/Button.tsx',
        content: `export function Button({ children, onClick }) {
  return <button onClick={onClick}>{children}</button>;
}`
      },
      {
        path: '/components/Input.tsx',
        content: `export function Input({ value, onChange }) {
  return <input value={value} onChange={onChange} />;
}`
      },
      {
        path: '/pages/Home.tsx',
        content: `// Home page content`
      }
    ];

    await page.evaluate(async (fileList) => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      const editorStore = (window as any).__editorStore;
      const fileStore = (window as any).__fileStore;

      // 创建所有文件
      fileList.forEach(f => {
        mockFS.set(f.path, f.content);
      });

      // 建立文件树
      const currentTree = fileStore.getState().fileTree || { children: [] };
      const testProject = {
        id: 'test-project',
        name: 'test-project',
        kind: 'directory',
        path: '/test-project',
        children: [
          {
            id: 'components',
            name: 'components',
            kind: 'directory',
            path: '/test-project/components',
            children: [
              {
                id: 'button-tsx',
                name: 'Button.tsx',
                kind: 'file',
                path: '/test-project/components/Button.tsx'
              },
              {
                id: 'input-tsx',
                name: 'Input.tsx',
                kind: 'file',
                path: '/test-project/components/Input.tsx'
              }
            ]
          },
          {
            id: 'pages',
            name: 'pages',
            kind: 'directory',
            path: '/test-project/pages',
            children: [
              {
                id: 'home-tsx',
                name: 'Home.tsx',
                kind: 'file',
                path: '/test-project/pages/Home.tsx'
              }
            ]
          }
        ]
      };

      fileStore.getState().setFileTree({
        ...currentTree,
        children: [...(currentTree.children || []), testProject]
      });

      // 按顺序打开文件（建立 LRU 历史）
      if (editorStore && editorStore.getState().openFile) {
        for (const file of fileList) {
          editorStore.getState().openFile(file.path);
          await new Promise(r => setTimeout(r, 100)); // 模拟延迟
        }
      }
    }, files);

    await page.waitForTimeout(500);

    // When: 打开新文件并输入前缀
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      const editorStore = (window as any).__editorStore;

      mockFS.set('/test-project/NewComponent.tsx', '');

      if (editorStore && editorStore.getState().openFile) {
        editorStore.getState().openFile('/test-project/NewComponent.tsx');
      }
    });

    await page.waitForTimeout(500);

    await page.locator('.monaco-editor, .editor').click();
    await page.keyboard.type('But'); // 输入 Button 的前缀
    await page.keyboard.press('Control+Space');

    await page.waitForTimeout(1000);

    // Then: 补全建议应该优先显示最近打开文件中的符号
    const suggestWidget = page.locator('.suggest-widget, [data-testid="suggest-widget"]');
    await expect(suggestWidget).toBeVisible();

    // And: 应该包含 Button (来自 Button.tsx)
    await expect(suggestWidget).toContainText('Button');
  });

  test('EDT-E2E-06: Diff 后的 Undo/Redo', async ({ page }) => {
    // Given: 显示了 Diff 编辑器
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      const editorStore = (window as any).__editorStore;
      const fileStore = (window as any).__fileStore;

      mockFS.set('/test.ts', 'function hello() { return "world"; }');

      const currentTree = fileStore.getState().fileTree || { children: [] };
      fileStore.getState().setFileTree({
        ...currentTree,
        children: [...(currentTree.children || []), {
          id: 'test-project',
          name: 'test-project',
          kind: 'directory',
          path: '/test-project',
          children: [{
            id: 'test-ts',
            name: 'test.ts',
            kind: 'file',
            path: '/test-project/test.ts'
          }]
        }]
      });

      if (editorStore && editorStore.getState().openFile) {
        editorStore.getState().openFile('/test-project/test.ts');
      }
    });

    await page.waitForTimeout(1000);

    // 触发行内编辑并显示 Diff
    await page.locator('.monaco-editor, .editor').click();
    await page.keyboard.press('Meta+K');
    await page.waitForTimeout(500);

    const inlineInput = page.locator('.inline-edit-widget input, [data-testid="inline-input"]');
    await inlineInput.fill('Add error handling');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(2000);

    const diffEditor = page.locator('.monaco-diff-editor, .diff-editor');
    await expect(diffEditor).toBeVisible();

    // When: 用户接受 Diff（点击 Accept）
    const acceptButton = page.locator('button:has-text("Accept"), button:has-text("接受")');
    await acceptButton.click();

    await page.waitForTimeout(1000);

    // Then: 编辑器应该显示新内容
    const editorContent = await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      if (editor) {
        return editor.getValue();
      }
      return '';
    });

    expect(editorContent).toMatch(/error|Error/);

    // When: 用户按 Cmd+Z 撤销
    await page.keyboard.press('Meta+Z');
    await page.waitForTimeout(500);

    // Then: 编辑器应该恢复到原始内容
    const undoneContent = await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      if (editor) {
        return editor.getValue();
      }
      return '';
    });

    expect(undoneContent).toContain('function hello()');
    expect(undoneContent).not.toMatch(/error|Error/);

    // When: 用户按 Cmd+Shift+Z 重做
    await page.keyboard.press('Meta+Shift+Z');
    await page.waitForTimeout(500);

    // Then: 编辑器应该再次显示修改后的内容
    const redoneContent = await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      if (editor) {
        return editor.getValue();
      }
      return '';
    });

    expect(redoneContent).toMatch(/error|Error/);
  });

  test('EDT-E2E-07: 补全列表的键盘导航', async ({ page }) => {
    // Given: 触发了补全列表
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      const symbolIndexer = (window as any).__symbolIndexer;
      const editorStore = (window as any).__editorStore;
      const fileStore = (window as any).__fileStore;

      mockFS.set('/utils.ts', `
export function util1() {}
export function util2() {}
export function util3() {}
`);

      if (symbolIndexer) {
        await symbolIndexer.indexFile('/utils.ts', mockFS.get('/utils.ts'));
      }

      mockFS.set('/test.ts', '');

      const currentTree = fileStore.getState().fileTree || { children: [] };
      fileStore.getState().setFileTree({
        ...currentTree,
        children: [...(currentTree.children || []), {
          id: 'test-project',
          name: 'test-project',
          kind: 'directory',
          path: '/test-project',
          children: [
            {
              id: 'utils-ts',
              name: 'utils.ts',
              kind: 'file',
              path: '/test-project/utils.ts'
            },
            {
              id: 'test-ts',
              name: 'test.ts',
              kind: 'file',
              path: '/test-project/test.ts'
            }
          ]
        }]
      });

      if (editorStore && editorStore.getState().openFile) {
        editorStore.getState().openFile('/test-project/test.ts');
      }
    });

    await page.waitForTimeout(1000);

    // 触发补全
    await page.locator('.monaco-editor, .editor').click();
    await page.keyboard.type('util');
    await page.keyboard.press('Control+Space');

    await page.waitForTimeout(1000);

    const suggestWidget = page.locator('.suggest-widget, [data-testid="suggest-widget"]');
    await expect(suggestWidget).toBeVisible();

    // When: 使用键盘导航
    // 按 ArrowDown 选择第二项
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);

    // 按 Enter 确认选择
    await page.keyboard.press('Enter');

    await page.waitForTimeout(500);

    // Then: 编辑器应该插入选中的补全
    const editorContent = await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      if (editor) {
        return editor.getValue();
      }
      return '';
    });

    expect(editorContent).toMatch(/util2|Util2/);
  });
});
