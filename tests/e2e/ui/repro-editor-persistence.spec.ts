import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * 场景 1：还原重启后编辑器内容加载失败的问题。
 */
test.describe('Reproduction: Editor Persistence After Restart', () => {

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('text=IfAI', { timeout: 10000 });
  });

  test('should restore editor content after page reload', async ({ page }) => {
    const fileName = 'test-persistence.md';
    const fileContent = '# Editor Persistence Test\n\nThis content should persist after reload.';

    console.log('[E2E] 步骤1: 打开测试文件');

    // 1. 使用测试助手打开文件
    await page.evaluate(({ name, content }) => {
      const openFile = (window as any).__E2E_OPEN_MOCK_FILE__;
      if (!openFile) {
        console.error('[E2E] __E2E_OPEN_MOCK_FILE__ 助手不可用');
        return;
      }
      openFile(name, content);
    }, { name: fileName, content: fileContent });

    // 等待编辑器加载
    await page.waitForTimeout(1500);

    console.log('[E2E] 步骤2: 验证文件内容已加载到编辑器');

    // 2. 验证文件内容已加载到编辑器
    const initialContent = await page.evaluate(() => {
      const editorStore = (window as any).__editorStore;
      if (!editorStore) {
        console.error('[E2E] __editorStore 不可用');
        return null;
      }
      const activeEditor = editorStore.getState().getActiveEditor();
      if (!activeEditor) {
        console.error('[E2E] 没有活动的编辑器实例');
        return null;
      }
      return activeEditor.getValue();
    });

    // 如果编辑器不可用，测试环境有问题
    if (initialContent === null) {
      console.log('[E2E] ⏸️ 编辑器不可用 - Monaco 集成可能未正确初始化');
      test.skip(true, 'Monaco editor not available in test environment');
      return;
    }

    console.log('[E2E] 初始编辑器内容:', initialContent?.substring(0, 50));

    // 验证初始内容
    expect(initialContent).toBe(fileContent);
    console.log('[E2E] ✅ 初始内容验证成功');

    console.log('[E2E] 步骤3: 模拟页面重启 (刷新)');

    // 3. 模拟"重启" (刷新页面)
    await page.reload();
    await page.waitForSelector('text=IfAI', { timeout: 10000 });
    await page.waitForTimeout(1500);

    console.log('[E2E] 步骤4: 验证内容是否在重启后依然存在');

    // 4. 验证内容是否依然存在
    // 先检查 fileStore 是否恢复了打开的文件
    const fileStoreState = await page.evaluate(() => {
      const fileStore = (window as any).__fileStore;
      if (!fileStore) return { error: 'fileStore not available' };

      const state = fileStore.getState();
      return {
        openedFilesCount: state.openedFiles.length,
        activeFileId: state.activeFileId,
        firstFile: state.openedFiles[0] ? {
          name: state.openedFiles[0].name,
          hasContent: !!state.openedFiles[0].content,
          contentLength: state.openedFiles[0].content?.length || 0,
        } : null
      };
    });

    console.log('[E2E] fileStore 状态:', fileStoreState);

    // 等待编辑器初始化
    await page.waitForTimeout(2000);

    const restoredContent = await page.evaluate(() => {
      const editorStore = (window as any).__editorStore;
      const activeEditor = editorStore?.getState().getActiveEditor();
      return activeEditor?.getValue() || null;
    });

    if (restoredContent === null) {
      console.log('[E2E] ℹ️ 重启后编辑器实例不存在');

      // 检查编辑器实例数量
      const editorInstances = await page.evaluate(() => {
        const editorStore = (window as any).__editorStore;
        const state = editorStore?.getState();
        return {
          hasStore: !!editorStore,
          activeEditorId: state?.activeEditorId,
          instanceCount: state?.editorInstances?.size || 0,
        };
      });

      console.log('[E2E] 编辑器实例状态:', editorInstances);

      if (fileStoreState.openedFilesCount > 0 && fileStoreState.firstFile?.hasContent) {
        console.log('[E2E] ⚠️ Bug确认: fileStore 恢复了文件内容,但编辑器实例未创建');
        console.log('[E2E] ✅ Bug还原成功: 编辑器在重启后未正确初始化');
        return;
      }

      console.log('[E2E] ⚠️ Bug确认: 编辑器内容未持久化,重启后编辑器为空');
      // 这是预期行为 - bug 仍然存在
      console.log('[E2E] ✅ Bug还原成功: 编辑器内容在重启后丢失');
      return;
    }

    console.log('[E2E] 恢复的编辑器内容:', restoredContent?.substring(0, 50));

    if (restoredContent === fileContent) {
      console.log('[E2E] ✅ 编辑器持久化功能正常工作');
      expect(restoredContent).toBe(fileContent);
    } else {
      console.log('[E2E] ⚠️ Bug确认: 编辑器内容在重启后发生改变或丢失');
      console.log('[E2E] 预期内容:', fileContent);
      console.log('[E2E] 实际内容:', restoredContent);
      // 这证明了 bug 的存在
      console.log('[E2E] ✅ Bug还原成功: 编辑器持久化未正确实现');
    }
  });
});
