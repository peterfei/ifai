import { test, expect } from '@playwright/test';
import { EditorPage, createEditorPage } from '../helpers/editor-page';
import { createTestCodeWithImport, LanguageType } from '../helpers/v0-3-0-test-utils';
import { waitForEditorReady } from '../helpers/wait-helpers';

/**
 * 跨仓库依赖分析测试集 (Dependency Analysis)
 *
 * 对应测试用例文档:
 * - E2E-DEP-01: 跨文件定义跳转
 * - E2E-DEP-02: 影响面分析面板
 */

test.describe('Feature: Cross-Repo Dependency Analysis @v0.3.0', () => {
  let editorPage: EditorPage;

  test.beforeEach(async ({ page }) => {
    editorPage = createEditorPage(page);
    await page.goto('/');
    await waitForEditorReady(page);
  });

  /**
   * E2E-DEP-01: 跨文件定义跳转
   *
   * 测试场景:
   * - 打开包含 `import { User } from '../shared/models'` 的 TS 项目
   * - 用户按住 Ctrl/Cmd 点击 `User` 符号或按 F12
   *
   * 社区版预期:
   * - 显示 Toast: "跨文件精准分析仅在完整版可用"
   * - 或跳转到 Mock 的定义位置（如果实现了简单的正则匹配）
   *
   * 商业版预期:
   * - 准确打开 `../shared/models/User.ts` 文件
   * - 光标定位到 `class User` 定义处
   */
  test('E2E-DEP-01: Cross-file definition jump (Community vs Commercial)', async ({ page }) => {
    // 1. 准备测试代码：包含导入语句
    const testCode = createTestCodeWithImport('../shared/models', 'User', LanguageType.TypeScript);
    await editorPage.setContent(testCode);

    // 2. 触发 "Go to Definition" 动作 (F12)
    await editorPage.goToDefinition();

    // 3. 验证行为差异
    if (editorPage.isCommercial()) {
      // 商业版：应该打开新文件
      const userTab = page.locator('.tab-label').filter({ hasText: /User/i });
      await expect(userTab, 'User.ts tab should be visible in commercial edition').toBeVisible({ timeout: 5000 });

      // 验证文件内容包含 class User 定义
      const editorContent = await editorPage.getContent();
      expect(editorContent).toMatch(/class\s+User/i);
    } else {
      // 社区版：验证不跳转或显示提示
      const userTab = page.locator('.tab-label').filter({ hasText: /User/i });

      // 选项 A: 不应该跳转到新文件
      await expect(userTab, 'User.ts tab should not be visible in community edition').not.toBeVisible({ timeout: 2000 });

      // 选项 B: 可能显示 Toast 提示（如果实现了）
      // const toast = page.locator('.sonner-toast, [data-testid="toast"]');
      // if (await toast.count() > 0) {
      //   await expect(toast).toContainText(/Community|免费版|upgrade/i);
      // }
    }
  });

  /**
   * E2E-DEP-02: 影响面分析面板
   *
   * 测试场景:
   * - 修改某个 API 后，自动识别所有受影响的调用点
   *
   * 社区版预期:
   * - 返回空列表或仅返回当前文件的引用
   *
   * 商业版预期:
   * - 侧边栏展示所有引用了该符号的文件列表（包括跨仓库的引用）
   * - 支持一键预览修改建议
   */
  test('E2E-DEP-02: Impact Analysis Panel', async ({ page }) => {
    // 如果是社区版，跳过此测试或测试降级行为
    test.skip(!editorPage.isCommercial(), 'Impact Analysis is a commercial-only feature');

    // 1. 准备测试场景：在多个文件中使用同一个符号
    const testCode = `
import { User } from '../shared/models';

const user1 = new User();
const user2 = new User();
const user3 = new User();
`;
    await editorPage.setContent(testCode);

    // 2. 打开引用查找/影响面分析面板
    // 假设快捷键是 Alt+Shift+F12 (VS Code 风格)
    await page.keyboard.press('Alt+Shift+F12');

    // 3. 验证面板出现
    const panel = page.locator('[data-testid="impact-analysis-panel"], .reference-panel');
    await expect(panel, 'Impact analysis panel should be visible').toBeVisible({ timeout: 5000 });

    // 4. 验证是否列出了引用
    // 商业版应该显示引用位置
    const referenceItems = panel.locator('.reference-item, .file-reference');
    const count = await referenceItems.count();

    expect(count, 'Should have at least one reference').toBeGreaterThan(0);

    // 5. 验证跨仓库引用（如果存在）
    const hasCrossRepo = await panel.getByText(/\.\.\/|sibling-repo/).count();
    if (hasCrossRepo > 0) {
      await expect(panel).toContainText(/\.\.\/sibling-repo/);
    }
  });

  /**
   * 额外测试: 社区版降级行为验证
   */
  test('E2E-DEP-03: Community edition graceful degradation', async ({ page }) => {
    test.skip(editorPage.isCommercial(), 'This test is for community edition only');

    // 社区版：尝试调用高级功能不应崩溃
    const testCode = createTestCodeWithImport('../shared/models', 'User');
    await editorPage.setContent(testCode);

    // 尝试触发跳转
    await editorPage.goToDefinition();

    // 验证应用没有崩溃（编辑器仍然可交互）
    const editor = page.locator('.monaco-editor').first();
    await expect(editor, 'Editor should still be functional').toBeVisible();

    // 验证可以继续编辑
    await editorPage.type('// Still can edit in community mode');
    const content = await editorPage.getContent();
    expect(content).toContain('Still can edit');
  });

  /**
   * 额外测试: 批量符号索引
   */
  test('E2E-DEP-04: Batch file indexing', async ({ page }) => {
    // 测试同时索引多个文件时的性能
    const startTime = Date.now();

    // 模拟打开多个文件
    const testFiles = ['file1.ts', 'file2.ts', 'file3.ts'];
    for (const file of testFiles) {
      await editorPage.setContent(`// ${file} content`);
      // 给索引器一些时间
      await page.waitForTimeout(100);
    }

    const duration = Date.now() - startTime;

    // 索引操作应该在合理时间内完成
    expect(duration, 'Batch indexing should complete quickly').toBeLessThan(5000);
  });
});
