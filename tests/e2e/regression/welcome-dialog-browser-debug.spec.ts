/**
 * E2E Test: WelcomeDialog Browser-Specific Debugging
 *
 * 这个测试专门用于调试用户报告的 NotFoundError
 * 用户报告在真实浏览器环境中仍然崩溃
 */

import { test, expect } from '@playwright/test';

test.describe('WelcomeDialog Browser-Specific Debugging', () => {
  test('debug: capture detailed browser state and errors', async ({ page, context }) => {
    console.log('[DEBUG] Starting detailed browser debugging...');

    // 启用详细日志
    context.on('webconsole', msg => {
      console.log('[DEBUG] Browser console:', msg.type(), msg.text());
    });

    // 监听所有错误
    const allErrors: any[] = [];
    page.on('console', msg => {
      allErrors.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location()
      });
    });

    page.on('pageerror', error => {
      allErrors.push({
        type: 'pageerror',
        message: error.message,
        stack: error.stack
      });
    });

    page.on('requestfailed', request => {
      allErrors.push({
        type: 'requestfailed',
        url: request.url(),
        failure: request.failure()
      });
    });

    // 导航到页面
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // 清除状态
    await page.evaluate(() => {
      localStorage.clear();
    });

    // 重新加载
    await page.reload();

    // 等待页面完全加载
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // 获取详细的浏览器信息
    const browserInfo = await page.evaluate(() => {
      return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        cookiesEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as any).deviceMemory,
        touchscreen: navigator.maxTouchPoints > 0,
        documentReady: document.readyState,
        documentCookies: document.cookie,
        localStorageKeys: Object.keys(localStorage),
        sessionStorageKeys: Object.keys(sessionData),
        bodyChildren: document.body?.childElementCount || 0,
        hasThemeBackdrop: !!document.querySelector('.theme-backdrop'),
        hasFadeAnimation: !!document.querySelector('.animate-fade-in'),
        computedStyles: {}
      };
    });

    console.log('[DEBUG] Browser Info:', JSON.stringify(browserInfo, null, 2));

    // 检查特定的 CSS 变量
    const cssVariablesCheck = await page.evaluate(() => {
      const testEl = document.createElement('div');
      testEl.className = 'theme-backdrop';
      document.body.appendChild(testEl);

      const styles = window.getComputedStyle(testEl);
      const result = {
        backgroundColor: styles.backgroundColor,
        position: styles.position,
        zIndex: styles.zIndex,
        display: styles.display
      };

      document.body.removeChild(testEl);
      return result;
    });

    console.log('[DEBUG] CSS Variables Check:', cssVariablesCheck);

    // 检查 i18n 状态
    const i18nCheck = await page.evaluate(() => {
      return {
        i18nextLng: localStorage.getItem('i18nextLng'),
        hasI18next: typeof (window as any).i18next !== 'undefined',
        documentLang: document.documentElement.lang
      };
    });

    console.log('[DEBUG] i18n Check:', i18nCheck);

    // 尝试直接渲染 WelcomeDialog
    const renderTest = await page.evaluate(() => {
      try {
        // 创建测试元素
        const testDiv = document.createElement('div');
        testDiv.className = 'theme-backdrop fixed inset-0 z-50 flex items-center justify-center';
        testDiv.id = 'test-welcome-dialog';

        document.body.appendChild(testDiv);

        const created = !!document.getElementById('test-welcome-dialog');
        const computedStyle = created ? window.getComputedStyle(testDiv) : null;

        return {
          success: created,
          style: computedStyle ? {
            display: computedStyle.display,
            position: computedStyle.position,
            zIndex: computedStyle.zIndex
          } : null
        };
      } catch (e: any) {
        return {
          success: false,
          error: e.message,
          stack: e.stack
        };
      }
    });

    console.log('[DEBUG] Render Test:', renderTest);

    // 输出所有错误
    console.log('[DEBUG] === All Errors ===');
    allErrors.forEach((err, i) => {
      console.log(`[DEBUG] Error ${i + 1}:`, JSON.stringify(err, null, 2));
    });

    // 检查 NotFoundError
    const notFoundErrors = allErrors.filter(e =>
      e.text?.includes('NotFoundError') ||
      e.message?.includes('NotFoundError') ||
      e.text?.includes('not found') ||
      e.message?.includes('not found')
    );

    console.log('[DEBUG] NotFoundError Count:', notFoundErrors.length);
    if (notFoundErrors.length > 0) {
      console.log('[DEBUG] NotFoundError Details:', notFoundErrors);
    }

    // 保存截图
    await page.screenshot({
      path: 'test-output/debug-browser-state.png',
      fullPage: true
    });

    // 检查是否有 ErrorBoundary 触发
    const errorBoundaryExists = await page.locator('text=/error|Error|错误').count();
    console.log('[DEBUG] Error Boundary elements:', errorBoundaryExists);

    // 最终断言
    console.log('[DEBUG] === Test Complete ===');
    console.log('[DEBUG] Total errors:', allErrors.length);
    console.log('[DEBUG] NotFoundErrors:', notFoundErrors.length);
    console.log('[DEBUG] Render test success:', renderTest.success);

    // 这个测试不应该失败，只是用于调试
    expect(true).toBe(true);
  });

  test('debug: test specific browser features that might cause NotFoundError', async ({ page }) => {
    console.log('[DEBUG] Testing browser features...');

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 清除状态
    await page.evaluate(() => {
      localStorage.clear();
    });

    await page.reload();
    await page.waitForTimeout(3000);

    // 测试 Selection API（可能导致 NotFoundError）
    const selectionTest = await page.evaluate(() => {
      try {
        const selection = window.getSelection();
        return {
          hasSelection: selection !== null,
          rangeCount: selection?.rangeCount || 0,
          anchorNode: selection?.anchorNode?.nodeName || null
        };
      } catch (e: any) {
        return {
          error: e.message,
          name: e.name
        };
      }
    });

    console.log('[DEBUG] Selection API Test:', selectionTest);

    // 测试 Range API
    const rangeTest = await page.evaluate(() => {
      try {
        const range = document.createRange();
        range.selectNodeContents(document.body);
        return {
          success: true,
          collapsed: range.collapsed,
          startContainer: range.startContainer.nodeName
        };
      } catch (e: any) {
        return {
          error: e.message,
          name: e.name
        };
      }
    });

    console.log('[DEBUG] Range API Test:', rangeTest);

    // 测试 getComputedStyle
    const computedStyleTest = await page.evaluate(() => {
      try {
        const el = document.body;
        const style = window.getComputedStyle(el);
        return {
          success: true,
          backgroundColor: style.backgroundColor,
          display: style.display
        };
      } catch (e: any) {
        return {
          error: e.message,
          name: e.name
        };
      }
    });

    console.log('[DEBUG] getComputedStyle Test:', computedStyleTest);

    // 测试 querySelector
    const querySelectorTest = await page.evaluate(() => {
      try {
        const result1 = document.querySelector('.theme-backdrop');
        const result2 = document.querySelector('[data-testid="layout-switcher"]');
        return {
          themeBackdrop: !!result1,
          layoutSwitcher: !!result2
        };
      } catch (e: any) {
        return {
          error: e.message,
          name: e.name
        };
      }
    });

    console.log('[DEBUG] querySelector Test:', querySelectorTest);

    // 检查是否有任何未定义的 CSS 变量
    const cssVarsTest = await page.evaluate(() => {
      const testEl = document.createElement('div');
      testEl.className = 'theme-panel-elevated theme-border theme-shadow';
      document.body.appendChild(testEl);

      const style = window.getComputedStyle(testEl);
      const hasUndefinedColor = style.backgroundColor.includes('undefined') ||
                               style.backgroundColor === 'rgba(0, 0, 0, 0)';

      document.body.removeChild(testEl);

      return {
        hasUndefinedColor,
        backgroundColor: style.backgroundColor
      };
    });

    console.log('[DEBUG] CSS Variables Test:', cssVarsTest);

    expect(true).toBe(true);
  });
});
