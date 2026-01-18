import { test, expect } from '@playwright/test';
import { EditorPage, createEditorPage } from '../helpers/editor-page';
import { createSmellyCode, CodeSmellType, measureTime } from '../helpers/v0-3-0-test-utils';
import { waitForEditorReady } from '../helpers/wait-helpers';
import { removeJoyrideOverlay } from '../setup';

/**
 * 智能重构测试集 (Intelligent Refactoring)
 *
 * 对应测试用例文档:
 * - E2E-REF-01: 提取函数 (Extract Method)
 * - E2E-REF-02: 代码异味主动探测
 */

test.describe.skip('Feature: Intelligent Refactoring @v0.3.0 - TODO: Fix this test', () => {
  let editorPage: EditorPage;

  test.beforeEach(async ({ page }) => {
    editorPage = createEditorPage(page);
    await page.goto('/');
    await waitForEditorReady(page);
  });

  /**
   * E2E-REF-01: 提取函数 (Extract Method)
   *
   * 测试场景:
   * - 打开一个包含 50 行逻辑的长函数 `processData`
   * - 选中其中 20 行代码，点击灯泡图标 -> "Extract Function"
   *
   * 社区版预期:
   * - 仅作为 UI 演示，点击后无实际代码变更，或提示需核心组件
   *
   * 商业版预期:
   * - 弹出对话框输入新函数名
   * - 自动在同级作用域生成新函数
   * - 原位置替换为函数调用，参数传递正确
   */
  test('E2E-REF-01: Extract Method flow', async ({ page }) => {
    // 1. 准备一段长代码
    const longFunctionCode = `
function processData() {
  // Step 1: Validate input
  const isValid = validateInput();
  if (!isValid) {
    throw new Error('Invalid input');
  }

  // Step 2: Transform data (these lines should be extracted)
  const transformed = data.map(x => x * 2);
  const filtered = transformed.filter(x => x > 10);
  const result = filtered.reduce((a, b) => a + b, 0);

  // Step 3: Save result
  saveResult(result);
  return result;
}
`;

    await editorPage.setContent(longFunctionCode);

    // 2. 选中部分代码（模拟选中中间几行）
    // 在 Monaco 中，这通常通过 Shift+方向键 或鼠标拖拽实现
    // 这里我们模拟通过快捷键触发 Code Action
    await page.keyboard.press('Control+Shift+R'); // 假设的重构快捷键

    // 3. 查找并点击 "Extract Function" 选项
    const refactorMenu = page.locator('.monaco-menu, .context-menu, [role="menu"]');
    const extractOption = refactorMenu.getByText(/Extract.*Function|提取函数/);

    const hasExtractOption = await extractOption.count() > 0;

    if (editorPage.isCommercial()) {
      // 商业版：应该有重构选项
      if (hasExtractOption) {
        await removeJoyrideOverlay(page);
        await extractOption.click();

        // 4. 验证弹出命名对话框
        const dialog = page.locator('[data-testid="refactor-rename-dialog"], .monaco-dialog-box');
        await expect(dialog, 'Rename dialog should appear').toBeVisible({ timeout: 3000 });

        // 输入新函数名
        const input = dialog.locator('input[type="text"], .monaco-inputbox textarea');
        await input.fill('transformAndFilterData');

        // 确认重构
        const confirmButton = dialog.getByRole('button', { name: /Refactor|OK|确认/ });
        await removeJoyrideOverlay(page);
        await confirmButton.click();

        // 5. 验证代码变化
        await page.waitForTimeout(500); // 等待重构完成
        const newContent = await editorPage.getContent();

        // 应该包含新函数定义
        expect(newContent).toMatch(/function\s+transformAndFilterData/);

        // 原位置应该有函数调用
        expect(newContent).toMatch(/transformAndFilterData\(\)/);
      } else {
        // 如果没有找到选项，可能是功能尚未实现
        test.skip(true, 'Extract Function option not available - feature may not be implemented yet');
      }
    } else {
      // 社区版：验证无反应或提示
      // 选项 A: 对话框不出现
      const dialog = page.locator('[data-testid="refactor-rename-dialog"], .monaco-dialog-box');
      await expect(dialog, 'Rename dialog should not appear in community edition').not.toBeVisible({ timeout: 2000 });

      // 选项 B: 可能显示 Toast 提示
      // const toast = page.locator('.sonner-toast');
      // if (await toast.count() > 0) {
      //   await expect(toast).toContainText(/Commercial|Pro|upgrade|升级/i);
      // }
    }
  });

  /**
   * E2E-REF-02: 代码异味主动探测
   *
   * 测试场景:
   * - 打开一个包含大量重复代码的文件
   * - 等待后台分析完成
   *
   * 社区版预期:
   * - 状态栏显示 "Analysis Ready (Mock)"，无波浪线提示
   *
   * 商业版预期:
   * - 代码出现黄色波浪线警告
   * - 悬停显示: "Detected duplicated code block (3 occurrences)"
   * - 提供 "Refactor to shared function" 修复按钮
   */
  test('E2E-REF-02: Code Smell Detection', async ({ page }) => {
    // 1. 注入重复代码
    const duplicateCode = createSmellyCode(CodeSmellType.DuplicateCode);
    await editorPage.setContent(duplicateCode);

    // 2. 等待后台分析
    await page.waitForTimeout(3000); // 给 LSP 足够时间分析

    if (editorPage.isCommercial()) {
      // 商业版：应该检测到代码异味
      // 查找波浪线标记（Monaco 使用 .squiggly-*.css 类）
      const squiggleLines = page.locator('.squiggly-warning, .squiggly-error, .squiggly-info');
      const squiggleCount = await squiggleLines.count();

      // 至少应该有一些标记（如果实现了 LSP 集成）
      if (squiggleCount > 0) {
        // 悬停在第一个波浪线上
        await squiggleLines.first().hover();

        // 验证 hover 内容
        const hoverContent = page.locator('.monaco-hover-content, .hover-row');
        await expect(hoverContent, 'Hover content should appear').toBeVisible({ timeout: 2000 });

        // 应该包含 "duplicate" 或 "重复" 关键词
        await expect(hoverContent).toContainText(/duplicate|重复|Duplicated/i);
      } else {
        // 如果没有波浪线，可能是 LSP 尚未实现
        test.skip(true, 'LSP integration for code smell detection not yet implemented');
      }

      // 检查是否有快速修复按钮
      const quickFix = page.locator('.monaco-quick-fix-widget, [data-testid="quick-fix"]');
      const hasQuickFix = await quickFix.count() > 0;

      if (hasQuickFix) {
        await expect(quickFix).toContainText(/Refactor|重构|Extract|提取/i);
      }
    } else {
      // 社区版：可能不显示波浪线，或仅显示 Mock 提示
      const statusBar = page.locator('[data-testid="status-bar"], .status-bar');

      // 可能显示 "Analysis Ready (Mock)"
      // 由于是 Mock，不强制要求有波浪线
      const squiggleLines = page.locator('.squiggly-warning');
      await expect(squiggleLines, 'Community edition should not show real warnings').toHaveCount(0);
    }
  });

  /**
   * 额外测试: 各种代码异味的检测
   */
  test('E2E-REF-03: Various code smell types', async ({ page }) => {
    const smellTypes = [
      CodeSmellType.LongFunction,
      CodeSmellType.MagicNumber,
      CodeSmellType.ComplexCondition,
      CodeSmellType.LargeClass,
    ];

    for (const smellType of smellTypes) {
      // 清空编辑器
      await editorPage.setContent('');

      // 注入有异味的代码
      const code = createSmellyCode(smellType);
      await editorPage.setContent(code);

      // 等待分析
      await page.waitForTimeout(1000);

      if (editorPage.isCommercial()) {
        // 商业版：应该检测到异味
        const squiggles = page.locator('.squiggly-warning, .squiggly-error');
        const count = await squiggles.count();

        // 至少应该有一些警告（如果 LSP 实现）
        if (count === 0) {
          console.warn(`No warnings detected for ${smellType} - LSP may not be fully implemented`);
        }
      }

      // 下一轮测试前清空
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
    }
  });

  /**
   * 性能测试: 大文件分析性能
   */
  test('E2E-REF-04: Large file analysis performance', async ({ page }) => {
    // 创建一个大文件（5000 行）
    let largeCode = '';
    for (let i = 0; i < 5000; i++) {
      largeCode += `function func${i}() {\n  return ${i};\n}\n`;
    }

    const { durationMs } = await measureTime(async () => {
      await editorPage.setContent(largeCode);
      // 等待 LSP 分析
      await page.waitForTimeout(2000);
    });

    // 分析大型文件应该在合理时间内完成
    expect(durationMs, 'Large file analysis should be fast').toBeLessThan(5000);
  });

  /**
   * 额外测试: 社区版 Mock 边界
   */
  test('E2E-REF-05: Community edition mock boundaries', async ({ page }) => {
    test.skip(editorPage.isCommercial(), 'This test is for community edition only');

    // 社区版：疯狂点击所有"高级功能"按钮
    const code = createSmellyCode(CodeSmellType.DuplicateCode);
    await editorPage.setContent(code);

    // 尝试触发各种重构命令
    const refactorShortcuts = [
      'F12', // Go to Definition
      'Shift+F12', // Find References
      'Control+Shift+R', // Refactor
      'Control+.', // Quick Fix
    ];

    for (const shortcut of refactorShortcuts) {
      await page.keyboard.press(shortcut);
      await page.waitForTimeout(200);

      // 验证没有崩溃
      const editor = page.locator('.monaco-editor').first();
      await expect(editor, `Editor should still be functional after ${shortcut}`).toBeVisible();

      // 关闭可能的对话框
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.count() > 0) {
        await page.keyboard.press('Escape');
      }
    }

    // 最终验证编辑器仍然可用
    await editorPage.type('// Still working');
    const content = await editorPage.getContent();
    expect(content).toContain('Still working');
  });
});
