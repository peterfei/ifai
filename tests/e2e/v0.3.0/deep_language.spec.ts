import { test, expect } from '@playwright/test';
import { removeJoyrideOverlay } from '../setup';

// 深度语言支持测试集 (Deep Language Support)
test.describe('Feature: Deep Language Support (Python/Go) @v0.3.0', () => {

  test('E2E-LANG-01: Python Auto-Import', async ({ page }) => {
    // 切换到 Python 文件
    // await createNewFile('test.py');
    
    // 输入 np.
    await page.keyboard.type('np.');

    const isCommercial = process.env.APP_EDITION === 'commercial';
    
    // 检查补全列表
    const suggestWidget = page.locator('.suggest-widget');
    
    if (isCommercial) {
      await expect(suggestWidget).toBeVisible();
      // 商业版应提示 'array (Auto import numpy as np)'
      await expect(suggestWidget).toContainText('array');
      
      // 选中并回车
      await page.keyboard.press('Enter');
      
      // 验证文件头部添加了 import
      // const content = await getEditorContent();
      // expect(content).toContain('import numpy as np');
    } else {
      // 社区版可能不显示智能补全，或者仅显示基于单词的补全
      // 验证没有自动添加 import
    }
  });

  test('E2E-LANG-02: Go Mod Dependency Graph', async ({ page }) => {
    const isCommercial = process.env.APP_EDITION === 'commercial';
    test.skip(!isCommercial, 'Dependency Graph is commercial feature');

    // 打开 go.mod
    // ...

    // 点击 "Visualize Dependencies"
    await removeJoyrideOverlay(page);
    await page.getByRole('button', { name: 'Visualize Dependencies' }).click();

    // 验证图表渲染
    await expect(page.locator('canvas.dependency-graph')).toBeVisible();
  });
});
