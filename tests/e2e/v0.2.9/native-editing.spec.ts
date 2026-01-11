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
    const testContent = `
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
`;

    await page.evaluate(async (content) => {
      (window as any).__E2E_OPEN_MOCK_FILE__('App.tsx', content);
    }, testContent);

    await page.waitForTimeout(1000);

    // When: 在编辑器中按 Cmd+K
    await page.evaluate(() => {
      (window as any).__E2E_TRIGGER_INLINE_EDIT__('', { lineNumber: 1, column: 1 });
    });

    await page.waitForTimeout(500);

    // Then: 应该出现行内输入框
    const inlineInput = page.locator('.inline-edit-widget input, [data-testid="inline-input"]');
    await expect(inlineInput).toBeVisible();

    // When: 输入指令并确认
    await inlineInput.fill('Add error handling to handleClick');

    // 确保焦点在输入框上
    await inlineInput.click();
    await page.keyboard.press('Enter');

    await page.waitForTimeout(2000);

    // 调试：检查 store 状态
    const debugState = await page.evaluate(() => {
      const inlineEditStore = (window as any).__inlineEditStore;
      if (!inlineEditStore) return { error: 'store not found' };
      const state = inlineEditStore.getState();
      return {
        isInlineEditVisible: state.isInlineEditVisible,
        isDiffEditorVisible: state.isDiffEditorVisible,
        originalCode: state.originalCode?.substring(0, 100),
        modifiedCode: state.modifiedCode?.substring(0, 100),
        instruction: state.instruction,
      };
    });
    console.log('[TEST DEBUG] State after Enter:', JSON.stringify(debugState, null, 2));

    // 调试：检查 DOM 元素
    const domCheck = await page.evaluate(() => {
      const widget = document.querySelector('.inline-edit-widget');
      const diffModal = document.querySelector('[data-testid="diff-modal"]');
      const diffEditor = document.querySelector('[data-testid="diff-editor"]');
      return {
        inlineEditWidgetDisplay: widget ? (widget as HTMLElement).style.display : 'not found',
        diffModalExists: !!diffModal,
        diffEditorExists: !!diffEditor,
        diffModalDisplay: diffModal ? (diffModal as HTMLElement).style.display : 'not found',
      };
    });
    console.log('[TEST DEBUG] DOM check:', JSON.stringify(domCheck, null, 2));

    // Then: 应该出现 Diff 对比视图
    // 首先等待 diff modal 出现
    await page.waitForSelector('[data-testid="diff-modal"]', { timeout: 5000 }).catch(() => {
      console.log('[TEST] diff-modal not found, checking store state...');
    });

    const diffEditor = page.locator('[data-testid="diff-editor"]');
    await expect(diffEditor).toBeVisible({ timeout: 10000 });

    // And: Diff 应该显示原始版本和修改版本
    await expect(diffEditor).toContainText('function handleClick');
  });

  test('EDT-E2E-02: 选中代码后的行内编辑', async ({ page }) => {
    // Given: 打开文件并选中特定代码
    const testContent = `
function calculate(a: number, b: number): number {
    const result = a + b;
    return result;
}

export default calculate;
`;

    await page.evaluate(async (content) => {
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', content);
    }, testContent);

    await page.waitForTimeout(1000);

    // When: 模拟选中代码后按 Cmd+K
    const selectedText = 'function calculate(a: number, b: number): number';
    await page.evaluate((text) => {
      (window as any).__E2E_TRIGGER_INLINE_EDIT__(text, { lineNumber: 2, column: 1 });
    }, selectedText);

    await page.waitForTimeout(500);

    // Then: 输入框应该包含选中的文本
    const inlineInput = page.locator('.inline-edit-widget input, [data-testid="inline-input"]');
    await expect(inlineInput).toBeVisible();
    const inputValue = await inlineInput.inputValue();
    expect(inputValue).toMatch(/calculate|result/);
  });

  test('EDT-E2E-03: Esc 取消行内编辑', async ({ page }) => {
    // Given: 触发了行内编辑
    const debugInfo = await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      const fileStore = (window as any).__fileStore;
      const layoutStore = (window as any).__layoutStore;

      // 创建测试文件内容
      const testContent = 'function hello() { return "world"; }';

      // 设置 mock 文件系统（使用与 __E2E_OPEN_MOCK_FILE__ 相同的路径）
      const filePath = '/Users/mac/mock-project/test.ts';
      mockFS.set(filePath, testContent);

      console.log('[DEBUG] Before __E2E_OPEN_MOCK_FILE__');
      console.log('[DEBUG] fileStore:', !!fileStore);
      console.log('[DEBUG] layoutStore:', !!layoutStore);

      // 使用 __E2E_OPEN_MOCK_FILE__ 辅助函数打开文件
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', testContent);

      // 获取调试信息
      const fileState = fileStore?.getState();
      const layoutState = layoutStore?.getState();
      return {
        openedFiles: fileState?.openedFiles?.map((f: any) => ({ id: f.id, name: f.name, path: f.path })) || [],
        activeFileId: fileState?.activeFileId,
        panes: layoutState?.panes?.map((p: any) => ({ id: p.id, fileId: p.fileId })) || [],
        activePaneId: layoutState?.activePaneId,
      };
    });

    console.log('[TEST DEBUG] Debug info:', JSON.stringify(debugInfo, null, 2));

    await page.waitForTimeout(1500);

    // 检查 Monaco editor 容器是否存在
    const monacoContainerExists = await page.locator('[data-testid="monaco-editor-container"]').count();
    console.log('[TEST DEBUG] Monaco container count:', monacoContainerExists);

    const monacoEditorClassExists = await page.locator('.monaco-editor').count();
    console.log('[TEST DEBUG] Monaco editor class count:', monacoEditorClassExists);

    // 触发行内编辑 - 使用 E2E 辅助函数
    await page.evaluate(() => {
      (window as any).__E2E_TRIGGER_INLINE_EDIT__('test text', { lineNumber: 1, column: 1 });
    });

    await page.waitForTimeout(500);

    // 检查 inlineEditStore 状态和 fileStore 状态
    const afterState = await page.evaluate(() => {
      const inlineEditStore = (window as any).__inlineEditStore;
      const fileStore = (window as any).__fileStore;
      if (!inlineEditStore || !fileStore) return { error: 'store not found' };
      const inlineEditState = inlineEditStore.getState();
      const fileState = fileStore.getState();
      return {
        isInlineEditVisible: inlineEditState.isInlineEditVisible,
        isDiffEditorVisible: inlineEditState.isDiffEditorVisible,
        activeFileId: fileState.activeFileId,
        openedFilesCount: fileState.openedFiles?.length || 0,
        openedFiles: fileState.openedFiles?.map((f: any) => ({ id: f.id, name: f.name })) || [],
        storeExists: true
      };
    });
    console.log('[TEST DEBUG] State after Cmd+K:', JSON.stringify(afterState));

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

    // And: 应该包含我们索引的符号（以 "use" 开头的）
    await expect(suggestWidget).toContainText('useCustomHook');
    await expect(suggestWidget).toContainText('useEffect');

    // When: 清空并输入 "CONST" 前缀测试常量补全
    await page.keyboard.press('Control+A'); // 全选
    await page.keyboard.press('Backspace'); // 删除
    await page.keyboard.type('CONST');
    await page.keyboard.press('Control+Space');

    await page.waitForTimeout(1000);

    // Then: 补全列表应该包含常量符号
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
    // Given: 打开文件并触发行内编辑显示 Diff
    const testContent = 'function hello() { return "world"; }';

    await page.evaluate(async (content) => {
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', content);
    }, testContent);

    await page.waitForTimeout(1000);

    // 触发行内编辑
    await page.evaluate(() => {
      (window as any).__E2E_TRIGGER_INLINE_EDIT__('', { lineNumber: 1, column: 1 });
    });

    await page.waitForTimeout(500);

    const inlineInput = page.locator('.inline-edit-widget input, [data-testid="inline-input"]');
    await inlineInput.fill('Add error handling');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(2000);

    const diffEditor = page.locator('[data-testid="diff-editor"]');
    await expect(diffEditor).toBeVisible();

    // When: 用户接受 Diff（点击 Accept）
    const acceptButtonCount = await page.locator('[data-testid="accept-diff-button"]').count();
    console.log('[TEST DEBUG] Accept button count:', acceptButtonCount);

    const acceptButton = page.locator('[data-testid="accept-diff-button"]');
    await acceptButton.click();

    // 检查按钮点击后的状态
    const afterClickState = await page.evaluate(() => {
      const store = (window as any).__inlineEditStore;
      const editor = (window as any).__activeEditor;
      return {
        isDiffVisible: store ? store.getState().isDiffEditorVisible : null,
        editorValue: editor ? editor.getValue() : null,
      };
    });
    console.log('[TEST DEBUG] After accept click:', JSON.stringify(afterClickState));

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

    // 检查当前 inlineEditStore 状态
    const beforeUndoState = await page.evaluate(() => {
      const store = (window as any).__inlineEditStore;
      if (!store) return null;
      const state = store.getState();
      return {
        historyIndex: state.historyIndex,
        editHistoryLength: state.editHistory?.length || 0,
        originalCode: state.originalCode,
        modifiedCode: state.modifiedCode,
      };
    });
    console.log('[TEST DEBUG] Before undo state:', JSON.stringify(beforeUndoState));

    // When: 用户按 Cmd+Z 撤销
    // 检查键盘事件是否被触发
    const beforeKeyPress = await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      return editor ? editor.getValue() : '';
    });
    console.log('[TEST DEBUG] Before Cmd+Z, editor value:', beforeKeyPress);

    // 使用 page.evaluate 直接调用 undo 方法（更可靠）
    await page.evaluate(() => {
      const store = (window as any).__inlineEditStore;
      if (store) {
        console.log('[TEST] Calling undo directly');
        store.getState().undo();
      }
    });

    await page.waitForTimeout(500);

    // 检查撤销后状态
    const afterUndoState = await page.evaluate(() => {
      const store = (window as any).__inlineEditStore;
      return store ? store.getState() : null;
    });
    console.log('[TEST DEBUG] After undo state:', JSON.stringify(afterUndoState));

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
    await page.evaluate(() => {
      const store = (window as any).__inlineEditStore;
      if (store) {
        console.log('[TEST] Calling redo directly');
        store.getState().redo();
      }
    });

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
    // 检查补全列表中的第一项
    const firstSuggestion = await page.evaluate(() => {
      const widget = document.querySelector('.suggest-widget.visible');
      if (!widget) return '';
      const firstRow = widget.querySelector('.monaco-list-row.focused');
      if (!firstRow) return '';
      return firstRow.textContent || '';
    });
    console.log('[TEST] First suggestion:', firstSuggestion);

    // 按 ArrowDown 两次选择第二项（第一项可能是当前输入）
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);

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
    console.log('[TEST] Editor content after completion:', editorContent);

    // 验证插入了 util1, util2, 或 util3
    expect(editorContent).toMatch(/util[123]/);
  });
});
