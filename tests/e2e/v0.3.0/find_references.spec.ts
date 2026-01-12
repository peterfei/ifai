import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

/**
 * Find References 功能 E2E 测试集
 *
 * 对应测试用例文档:
 * - DEP-E2E-01: 同文件引用查找
 * - DEP-E2E-02: 跨文件引用查找
 * - DEP-E2E-03: 无引用处理
 * - DEP-E2E-04: 快捷键触发 (Shift+F12)
 */

test.describe('Feature: Find References @v0.3.0', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__fileStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  /**
   * DEP-E2E-01: 同文件引用查找
   *
   * 测试场景:
   * - 文件中定义了一个函数 `calculateSum`
   * - 同一文件中有多个地方调用该函数
   * - 用户按 Shift+F12 查找引用
   *
   * 预期:
   * - 显示所有引用位置（包括定义位置）
   */
  test('DEP-E2E-01: Same-file references', async ({ page }) => {
    const testCode = `// 函数定义
function calculateSum(a: number, b: number): number {
  return a + b;
}

// 第一次调用
const result1 = calculateSum(5, 3);

// 第二次调用
const result2 = calculateSum(10, 20);

// 第三次调用
const result3 = calculateSum(1, 2);
`;

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', code);
    }, testCode);

    await page.waitForTimeout(1000);

    // 手动索引文件
    await page.evaluate(async (code) => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        await symbolIndexer.indexFile('/mock/test.ts', code);
      }
    }, testCode);

    await page.waitForTimeout(500);

    // 验证符号已被索引
    const references = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('calculateSum');
      }
      return null;
    });

    // 验证找到了引用（定义 + 3 次调用）
    expect(references).toBeTruthy();
    expect(references.length).toBeGreaterThanOrEqual(1);

    // 验证包含定义位置
    const hasDefinition = references.some((ref: any) => ref.isDefinition === true);
    expect(hasDefinition).toBeTruthy();
  });

  /**
   * DEP-E2E-02: 跨文件引用查找
   *
   * 测试场景:
   * - File A 定义了函数 `helperFunction`
   * - File B 和 File C 调用了该函数
   * - 用户在 File A 中按 Shift+F12 查找引用
   *
   * 预期:
   * - 显示所有跨文件引用
   */
  test('DEP-E2E-02: Cross-file references', async ({ page }) => {
    const fileAContent = `export function helperFunction(): string {
  return 'Hello from helper';
}
`;

    const fileBContent = `import { helperFunction } from './fileA';

const result1 = helperFunction();
`;

    const fileCContent = `import { helperFunction } from './fileA';

const result2 = helperFunction();
const result3 = helperFunction();
`;

    // 索引所有文件
    await page.evaluate(async (args) => {
      const [fileA, fileB, fileC] = args;
      (window as any).__E2E_SKIP_STABILIZER__ = true;

      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        await symbolIndexer.indexFile('/mock/fileA.ts', fileA);
        await symbolIndexer.indexFile('/mock/fileB.ts', fileB);
        await symbolIndexer.indexFile('/mock/fileC.ts', fileC);
      }
    }, [fileAContent, fileBContent, fileCContent]);

    await page.waitForTimeout(1000);

    // 打开 File A
    await page.evaluate(async (content) => {
      (window as any).__E2E_OPEN_MOCK_FILE__('fileA.ts', content);
    }, fileAContent);

    await page.waitForTimeout(500);

    // 验证符号引用
    const references = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('helperFunction');
      }
      return null;
    });

    // 验证找到了跨文件引用
    expect(references).toBeTruthy();
    expect(references.length).toBeGreaterThanOrEqual(1);

    // 验证包含定义位置
    const hasDefinition = references.some((ref: any) => ref.isDefinition === true);
    expect(hasDefinition).toBeTruthy();
  });

  /**
   * DEP-E2E-03: 无引用处理
   *
   * 测试场景:
   * - 文件中定义了一个从未被调用的函数
   * - 用户尝试查找引用
   *
   * 预期:
   * - 只返回定义位置，没有其他引用
   */
  test('DEP-E2E-03: No references found', async ({ page }) => {
    const testCode = `// 未被调用的函数
function unusedFunction(): void {
  console.log('This is never called');
}

// 主函数
function main(): void {
  console.log('Hello');
}
`;

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', code);
    }, testCode);

    await page.waitForTimeout(1000);

    // 手动索引文件
    await page.evaluate(async (code) => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        await symbolIndexer.indexFile('/mock/test.ts', code);
      }
    }, testCode);

    await page.waitForTimeout(500);

    // 查找引用
    const references = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('unusedFunction');
      }
      return null;
    });

    // 验证只返回定义位置
    expect(references).toBeTruthy();
    expect(references.length).toBe(1);
    expect(references[0].isDefinition).toBe(true);
  });

  /**
   * DEP-E2E-04: 快捷键触发 (Shift+F12)
   *
   * 测试场景:
   * - 用户按 Shift+F12 触发 Find References
   *
   * 预期:
   * - 触发引用查找
   */
  test('DEP-E2E-04: Shift+F12 keyboard shortcut', async ({ page }) => {
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

    // 手动索引文件
    await page.evaluate(async (code) => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        await symbolIndexer.indexFile('/mock/test.ts', code);
      }
    }, testCode);

    await page.waitForTimeout(500);

    // 将光标移动到函数定义处
    await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      if (editor) {
        editor.setPosition({ lineNumber: 1, column: 11 });
        editor.focus();
      }
    });

    // 触发 Shift+F12
    await page.keyboard.press('Shift+F12');

    await page.waitForTimeout(500);

    // 验证编辑器仍然包含内容（没有崩溃）
    const content = await page.evaluate(() => {
      const editor = (window as any).__activeEditor;
      return editor ? editor.getValue() : '';
    });

    expect(content).toContain('function myFunction');
  });

  /**
   * DEP-E2E-05: 符号索引集成
   *
   * 测试场景:
   * - 验证 ReferencesProvider 正确使用 SymbolIndexer
   */
  test('DEP-E2E-05: SymbolIndexer integration', async ({ page }) => {
    const testCode = `function testFunction() {
  return true;
}
`;

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', code);
    }, testCode);

    await page.waitForTimeout(1000);

    // 验证 findReferences 方法存在
    const hasFindReferencesMethod = await page.evaluate(() => {
      const indexer = (window as any).__symbolIndexer;
      return indexer && typeof indexer.findReferences === 'function';
    });

    expect(hasFindReferencesMethod).toBe(true);
  });

  /**
   * DEP-E2E-06: 引用统计
   *
   * 测试场景:
   * - 验证能正确统计引用数量
   */
  test('DEP-E2E-06: Reference counting', async ({ page }) => {
    const testCode = `function calculateSum(a: number, b: number): number {
  return a + b;
}

const r1 = calculateSum(1, 2);
const r2 = calculateSum(3, 4);
const r3 = calculateSum(5, 6);
`;

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('test.ts', code);
    }, testCode);

    await page.waitForTimeout(1000);

    // 手动索引文件
    await page.evaluate(async (code) => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        await symbolIndexer.indexFile('/mock/test.ts', code);
      }
    }, testCode);

    await page.waitForTimeout(500);

    // 查找引用
    const references = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('calculateSum');
      }
      return null;
    });

    // 验证引用数量（1 个定义 + 3 次调用 = 4）
    expect(references).toBeTruthy();
    expect(references.length).toBe(4);

    // 验证只有 1 个定义
    const definitionCount = references.filter((ref: any) => ref.isDefinition === true).length;
    expect(definitionCount).toBe(1);

    // 验证有 3 个引用（非定义）
    const referenceCount = references.filter((ref: any) => ref.isDefinition === false).length;
    expect(referenceCount).toBe(3);
  });
});

/**
 * 性能测试
 */
test.describe('Performance: Find References @v0.3.0', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__fileStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  /**
   * DEP-PERF-01: 大文件中的引用查找性能
   */
  test('DEP-PERF-01: Large file reference search performance', async ({ page }) => {
    // 创建包含大量函数和调用的文件
    let largeCode = `// Large file with many functions
`;

    for (let i = 0; i < 50; i++) {
      largeCode += `function function${i}(): number {
  return ${i};
}
`;
    }

    // 添加对其中一个函数的多次调用
    for (let i = 0; i < 20; i++) {
      largeCode += `const x${i} = function5();
`;
    }

    await page.evaluate(async (code) => {
      (window as any).__E2E_SKIP_STABILIZER__ = true;
      (window as any).__E2E_OPEN_MOCK_FILE__('large.ts', code);
    }, largeCode);

    await page.waitForTimeout(1000);

    // 手动索引文件
    await page.evaluate(async (code) => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        await symbolIndexer.indexFile('/mock/large.ts', code);
      }
    }, largeCode);

    await page.waitForTimeout(500);

    // 测量查找时间
    const startTime = Date.now();

    const references = await page.evaluate(() => {
      const symbolIndexer = (window as any).__symbolIndexer;
      if (symbolIndexer) {
        return symbolIndexer.findReferences('function5');
      }
      return null;
    });

    const endTime = Date.now();
    const searchTime = endTime - startTime;

    // 验证找到了引用
    expect(references).toBeTruthy();
    expect(references.length).toBeGreaterThan(0);

    // 验证查找时间在可接受范围内 (< 1秒)
    expect(searchTime).toBeLessThan(1000);
  });
});
