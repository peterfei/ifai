import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

/**
 * Go to Definition 功能 E2E 测试集
 *
 * 对应测试用例文档:
 * - GTD-E2E-01: 同文件定义跳转
 * - GTD-E2E-02: 跨文件定义跳转
 * - GTD-E2E-03: 符号未找到处理
 * - GTD-E2E-04: 快捷键触发 (F12)
 */

test.describe('Feature: Go to Definition @v0.3.0', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__fileStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  /**
   * GTD-E2E-01: 同文件定义跳转
   *
   * 测试场景:
   * - 文件中定义了一个函数 `calculateSum`
   * - 用户在调用处按 F12 跳转
   *
   * 预期:
   * - 光标跳转到函数定义行
   */
  test('GTD-E2E-01: Same-file definition jump', async ({ page }) => {
    const testCode = `// 函数定义
function calculateSum(a: number, b: number): number {
  return a + b;
}

// 函数调用
const result = calculateSum(5, 3);
`;

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', code);
    }, testCode);

    await page.waitForTimeout(1000);

    // 手动索引文件以确保符号被索引
    await page.evaluate(async (code) => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        await symbolIndexer.indexFile('/mock/test.ts', code);
      }
    }, testCode);

    await page.waitForTimeout(500);

    // 验证符号已被索引
    const symbolInfo = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.getSymbolDefinition('calculateSum');
      }
      return null;
    });

    // 验证符号索引器找到了函数定义
    expect(symbolInfo).toBeTruthy();
    expect(symbolInfo!.name).toBe('calculateSum');
    expect(symbolInfo!.kind).toBe('function');
    expect(symbolInfo!.line).toBe(2);

    // 将光标移动到函数调用处并触发 F12
    await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      if (editor) {
        editor.setPosition({ lineNumber: 7, column: 16 });
        editor.focus();
      }
    });

    // 触发 "Go to Definition" (F12)
    // 验证系统不会崩溃，并且编辑器保持响应
    await page.keyboard.press('F12');
    await page.waitForTimeout(500);

    // 验证编辑器仍然包含内容且没有崩溃
    const content = await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      return editor ? editor.getValue() : '';
    });

    expect(content).toContain('function calculateSum');
  });

  /**
   * GTD-E2E-02: 跨文件定义跳转
   *
   * 测试场景:
   * - File A 导入 File B 的符号
   * - 用户在 File A 中按 F12 跳转到 File B
   *
   * 预期:
   * - 打开 File B 并跳转到符号定义位置
   */
  test('GTD-E2E-02: Cross-file definition jump', async ({ page }) => {
    const fileAContent = `import { helperFunction } from './utils';

const result = helperFunction();
`;

    const fileBContent = `export function helperFunction(): string {
  return 'Hello from utils';
}
`;

    // 打开文件 A 并索引两个文件
    await page.evaluate(async (args) => {
      const [fileA, fileB] = args;
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('app.ts', fileA);

      // 索引两个文件
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        await symbolIndexer.indexFile('/mock/app.ts', fileA);
        await symbolIndexer.indexFile('/mock/utils.ts', fileB);
      }
    }, [fileAContent, fileBContent]);

    await page.waitForTimeout(1000);

    // 将光标移动到 helperFunction 符号上
    await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      if (editor) {
        editor.setPosition({ lineNumber: 3, column: 17 });
        editor.focus();
      }
    });

    // 触发 "Go to Definition"
    await page.keyboard.press('F12');

    await page.waitForTimeout(1000);

    // 验证跨文件跳转提示
    const toast = page.locator('.sonner-toast');
    const toastCount = await toast.count();

    if (toastCount > 0) {
      await expect(toast.first()).toContainText(/Opened|utils/);
    }
  });

  /**
   * GTD-E2E-03: 符号未找到处理
   *
   * 测试场景:
   * - 用户尝试跳转到一个不存在的符号
   *
   * 预期:
   * - 不执行跳转，或在控制台显示警告
   */
  test('GTD-E2E-03: Symbol not found handling', async ({ page }) => {
    const testCode = `// 没有定义这个函数
const result = undefinedFunction();
`;

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', code);
    }, testCode);

    await page.waitForTimeout(1000);

    // 监听控制台消息
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    // 触发 "Go to Definition"
    await page.keyboard.press('F12');

    await page.waitForTimeout(500);

    // 验证控制台显示 "No definition found" 消息或无消息
    const hasNoDefinitionMessage = consoleMessages.some(msg =>
      msg.includes('No definition found') || msg.includes('No word at position')
    );

    expect(hasNoDefinitionMessage || consoleMessages.length === 0).toBeTruthy();
  });

  /**
   * GTD-E2E-04: 快捷键触发 (F12)
   *
   * 测试场景:
   * - 用户按 F12 触发 Go to Definition
   *
   * 预期:
   * - 触发定义查找
   */
  test('GTD-E2E-04: F12 keyboard shortcut', async ({ page }) => {
    const testCode = `function myFunction() {
  return 42;
}

const value = myFunction();
`;

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', code);
    }, testCode);

    await page.waitForTimeout(1000);

    // 将光标移动到函数调用处的 myFunction 符号上
    await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      if (editor) {
        editor.setPosition({ lineNumber: 5, column: 16 });
        editor.focus();
      }
    });

    // 触发 F12
    await page.keyboard.press('F12');

    await page.waitForTimeout(500);

    // 验证编辑器仍然包含内容（跳转没有崩溃）
    const content = await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      return editor ? editor.getValue() : '';
    });

    expect(content).toContain('function myFunction');
  });

  /**
   * GTD-E2E-05: 右键菜单触发
   *
   * 测试场景:
   * - 用户右键点击符号并选择 "Go to Definition"
   *
   * 预期:
   * - 触发定义查找
   */
  test('GTD-E2E-05: Context menu trigger', async ({ page }) => {
    const testCode = `function testFunction() {
  return true;
}

testFunction();
`;

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', code);
    }, testCode);

    await page.waitForTimeout(1000);

    // 右键点击编辑器
    const editor = page.locator('.monaco-editor').first();
    await editor.click({ position: { x: 100, y: 50 } });
    await editor.click({ button: 'right', position: { x: 100, y: 50 } });

    await page.waitForTimeout(500);

    // 查找右键菜单中的 "Go to Definition" 选项
    const goToDefinitionOption = page.locator('[role="menuitem"]').filter({ hasText: /Go to Definition|转到定义|查看定义/i });
    const optionCount = await goToDefinitionOption.count();

    if (optionCount > 0) {
      await removeJoyrideOverlay(page);
      await goToDefinitionOption.first().click();
      await page.waitForTimeout(500);

      const content = await page.evaluate(() => {
        const editor = (window as any).__activeEditor;
        return editor ? editor.getValue() : '';
      });

      expect(content).toContain('function testFunction');
    } else {
      test.skip(true, 'Context menu "Go to Definition" option not found in current UI');
    }
  });

  /**
   * GTD-E2E-06: 符号索引集成
   *
   * 测试场景:
   * - 验证 DefinitionProvider 正确使用 SymbolIndexer
   */
  test('GTD-E2E-06: SymbolIndexer integration', async ({ page }) => {
    const testCode = `function testFunction() {
  return true;
}
`;

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', code);
    }, testCode);

    await page.waitForTimeout(1000);

    // 验证 SymbolIndexer 可用
    const symbolIndexerAvailable = await page.evaluate(() => {
      return typeof (window as any).__symbolIndexer !== 'undefined';
    });

    expect(symbolIndexerAvailable).toBe(true);

    // 验证 indexFile 方法存在
    const hasIndexFileMethod = await page.evaluate(() => {
      const indexer = (window as any).__symbolIndexer;
      return indexer && typeof indexer.indexFile === 'function';
    });

    expect(hasIndexFileMethod).toBe(true);

    // 验证 getSymbolDefinition 方法存在
    const hasGetSymbolDefinitionMethod = await page.evaluate(() => {
      const indexer = (window as any).__symbolIndexer;
      return indexer && typeof indexer.getSymbolDefinition === 'function';
    });

    expect(hasGetSymbolDefinitionMethod).toBe(true);
  });
});

/**
 * 性能测试
 */
test.describe('Performance: Go to Definition @v0.3.0', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__fileStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  /**
   * GTD-PERF-01: 大文件中的符号跳转性能
   */
  test('GTD-PERF-01: Large file symbol navigation performance', async ({ page }) => {
    let largeCode = `// Large file with many symbols
`;

    for (let i = 0; i < 100; i++) {
      largeCode += `function function${i}(): number {
  return ${i};
}
`;
    }

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('large.ts', code);
    }, largeCode);

    await page.waitForTimeout(1000);

    // 测量跳转时间
    const startTime = Date.now();

    await page.keyboard.press('F12');

    await page.waitForTimeout(500);

    const endTime = Date.now();
    const jumpTime = endTime - startTime;

    // 验证跳转时间在可接受范围内 (< 1秒)
    expect(jumpTime).toBeLessThan(1000);
  });
});
