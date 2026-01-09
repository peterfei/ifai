import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

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
    const fileName = 'README.md';
    const fileContent = '# Welcome to IfAI';

    // 1. 打开一个文件
    await page.evaluate(({ name, content }) => {
      (window as any).__E2E_OPEN_MOCK_FILE__(name, content);
    }, { name: fileName, content: fileContent });

    // 2. 确认文件内容已加载到编辑器
    await page.waitForTimeout(1000);
    // 假设编辑器使用了 Monaco，可以通过此方式检查内容
    const editorContent = await page.evaluate(() => {
        return (window as any).monaco?.editor.getModels()[0]?.getValue();
    });
    console.log('Initial editor content:', editorContent);
    expect(editorContent).toContain(fileContent);

    // 3. 模拟“重启” (刷新页面)
    await page.reload();
    await page.waitForSelector('text=IfAI', { timeout: 10000 });

    // 4. 验证内容是否依然存在
    // 在 bug 存在的情况下，这里可能会返回空或默认内容
    const restoredContent = await page.evaluate(() => {
        return (window as any).monaco?.editor.getModels()[0]?.getValue();
    });
    console.log('Restored editor content:', restoredContent);
    
    // 预期：内容应该被正确还原
    expect(restoredContent).toContain(fileContent);
  });
});
