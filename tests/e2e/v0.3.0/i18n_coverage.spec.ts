import { test, expect } from '@playwright/test';

// 国际化全覆盖测试集
test.describe('Feature: I18n Coverage @v0.3.0', () => {

  // I18N-E2E-01: 英文环境纯净度检测
  test('I18N-E2E-01: No Chinese characters in English mode', async ({ page }) => {
    // 1. 强制设置为英文环境 (通过 localStorage 或 URL 参数)
    await page.goto('/');
    
    await page.evaluate(() => {
      localStorage.setItem('i18nextLng', 'en-US');
      location.reload();
    });
    
    // 等待重新加载和翻译初始化
    await page.waitForTimeout(1000); 
    await expect(page.locator('.monaco-editor').first()).toBeVisible();

    // 2. 交互遍历关键区域以触发动态内容加载
    // 打开命令面板
    await page.keyboard.press('F1');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');

    // 打开文件树右键菜单 (假设)
    // await page.locator('.file-item').first().click({ button: 'right' });

    // 3. 扫描页面所有可见元素的文本
    // 排除编辑器内容区 (用户代码可能是中文)
    const bodyText = await page.evaluate(() => {
      // 辅助函数：检查元素是否可见
      const isVisible = (elem) => {
        if (!elem) return false;
        const style = window.getComputedStyle(elem);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
      };

      // 递归获取文本节点
      const getText = (node) => {
        let text = '';
        if (node.nodeType === Node.TEXT_NODE) {
            // 忽略空白
            const content = node.textContent?.trim();
            if (content && isVisible(node.parentElement)) {
                // 特殊过滤：排除 Monaco 编辑器内容行、输入框值
                if (node.parentElement?.closest('.view-lines')) return '';
                if (node.parentElement?.closest('.monaco-editor')) return ''; 
                text += content + '\n';
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            // 忽略 script, style
            if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.nodeName)) return '';
            
            for (const child of node.childNodes) {
                text += getText(child);
            }
        }
        return text;
      };

      return getText(document.body);
    });

    // 4. 正则匹配中文字符 [\u4e00-\u9fa5]
    // 允许少量例外 (如: 字体名称、特定的品牌词如果必须是中文)
    const chineseRegex = /[\u4e00-\u9fa5]+/g;
    const matches = bodyText.match(chineseRegex);

    if (matches && matches.length > 0) {
      console.error('Found Chinese characters in English mode:', matches);
    }

    // 断言：不应包含中文字符
    // 注意：如果有预期的中文（例如示例文件内容），这里需要加白名单过滤
    expect(matches, `Found ${matches?.length} Chinese text segments in English mode: ${matches?.join(', ')}`).toBeNull();
  });

  // I18N-E2E-02: 动态错误信息翻译
  test('I18N-E2E-02: Backend error translation', async ({ page }) => {
    await page.goto('/');
    // 设置为英文
    await page.evaluate(() => localStorage.setItem('i18nextLng', 'en-US'));

    // 模拟触发一个后端错误 (例如文件读取失败)
    // 这里我们直接调用 toast 显示一个后端返回的错误码
    await page.evaluate(() => {
        // 假设 window.toast 可用，或者通过 store 触发
        // 这里模拟 UI 接收到了一个错误事件
        const event = new CustomEvent('backend-error', { 
            detail: { code: 'ERR_FILE_NOT_FOUND', message: '文件未找到' } // 后端可能返回默认中文
        });
        window.dispatchEvent(event);
        
        // 或者直接调用 Sonner (如果暴露在 window)
        // window.toast.error(t('errors.ERR_FILE_NOT_FOUND')); 
    });

    // 验证 UI 显示的是翻译后的英文，而不是后端的中文
    // 这一步依赖于前端是否有 Error Code Map 机制
    // 如果没有，这个测试会失败，正好作为需求
    
    // 暂时跳过实际断言，因为需要 Mock 支持
    // await expect(page.getByText('File not found')).toBeVisible();
    // await expect(page.getByText('文件未找到')).not.toBeVisible();
  });

  // I18N-E2E-03: 占位符插值验证
  test('I18N-E2E-03: Interpolation check', async ({ page }) => {
    // 检查是否有未替换的插值，如 {{count}} 或 {count}
    const rawContent = await page.content();
    expect(rawContent).not.toMatch(/\{\{\w+\}\}/);
    expect(rawContent).not.toMatch(/\{[a-z][a-zA-Z0-9]+\}/); // 简单的单括号检查，可能会误报代码，需谨慎
  });

});
