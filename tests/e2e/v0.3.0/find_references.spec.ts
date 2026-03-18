import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, setupMockFileSystem } from '../setup';

/**
 * Find References 功能 E2E 测试集 (高保真 Mock 版)
 */

test.describe.skip('Feature: Find References @v0.3.0', () => {
  test.beforeEach(async ({ page }) => {
    // setupE2ETestEnvironment 内部已经处理了 goto('/') 和 store 等待
    await setupE2ETestEnvironment(page, { skipWelcome: true });
  });

  /**
   * DEP-E2E-01: 同文件引用查找
   */
  test('DEP-E2E-01: Same-file references', async ({ page }) => {
    const fileName = 'test.ts';
    const filePath = `/Users/mac/mock-project/${fileName}`;
    const testCode = `function calculateSum(a, b) { return a + b; }
const r1 = calculateSum(5, 3);
const r2 = calculateSum(10, 20);`;

    // 🏆 核心：通过 setupMockFileSystem 注入符号 Mock 数据
    // 这将拦截 Tauri 命令 'find_references'
    await setupMockFileSystem(page, {
      [fileName]: testCode
    }, {
      references: {
        'calculateSum': [
          { path: filePath, line: 1, character: 10, isDefinition: true },
          { path: filePath, line: 2, character: 12, isDefinition: false },
          { path: filePath, line: 3, character: 12, isDefinition: false }
        ]
      }
    });

    // 打开文件
    await page.evaluate((name) => {
      window.__E2E_OPEN_MOCK_FILE__(name);
    }, fileName);

    await page.waitForTimeout(1000);

    // 验证拦截器是否工作
    const references = await page.evaluate(async () => {
      // @ts-ignore
      return await window.__TAURI_INTERNALS__.invoke('find_references', { symbolName: 'calculateSum' });
    });

    expect(references).toBeTruthy();
    expect(references.length).toBe(3);
    expect(references[0].isDefinition).toBe(true);
    
    console.log('[E2E] ✅ Mock references verified successfully');
  });

  /**
   * DEP-E2E-02: 跨文件引用查找
   */
  test('DEP-E2E-02: Cross-file references', async ({ page }) => {
    const fileA = 'fileA.ts';
    const fileB = 'fileB.ts';
    const pathA = `/Users/mac/mock-project/${fileA}`;
    const pathB = `/Users/mac/mock-project/${fileB}`;

    await setupMockFileSystem(page, {
      [fileA]: `export function helper() {}`,
      [fileB]: `import { helper } from './fileA'; helper();`
    }, {
      references: {
        'helper': [
          { path: pathA, line: 1, character: 17, isDefinition: true },
          { path: pathB, line: 1, character: 33, isDefinition: false }
        ]
      }
    });

    // 验证
    const references = await page.evaluate(async () => {
      // @ts-ignore
      return await window.__TAURI_INTERNALS__.invoke('find_references', { symbolName: 'helper' });
    });

    expect(references.length).toBe(2);
    const crossFile = references.find((r: any) => r.path.includes('fileB.ts'));
    expect(crossFile).toBeTruthy();
    
    console.log('[E2E] ✅ Cross-file mock references verified');
  });
});
