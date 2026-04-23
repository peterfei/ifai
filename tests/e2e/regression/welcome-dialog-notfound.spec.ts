/**
 * E2E Test: WelcomeDialog NotFoundError Reproduction
 *
 * Purpose: 高保真还原 WelcomeDialog 的 NotFoundError 崩溃问题
 *
 * Issue:
 * - WelcomeDialog 在首次加载时抛出 NotFoundError
 * - 错误堆栈显示错误发生在 WelcomeDialog.tsx:80:41
 * - 错误信息: "NotFoundError: The object can not be found here."
 *
 * Test Strategy:
 * 1. 清除所有 localStorage 数据（确保显示 WelcomeDialog）
 * 2. 导航到首页
 * 3. 等待页面加载完成
 * 4. 检查是否有 NotFoundError 在控制台中
 * 5. 验证 WelcomeDialog 是否正确渲染
 */

import { test, expect } from '@playwright/test';

test.describe('WelcomeDialog NotFoundError Reproduction', () => {
  test.beforeEach(async ({ page }) => {
    // 清除 localStorage 以确保显示 WelcomeDialog
    await page.goto('/');

    // 等待页面加载
    await page.waitForLoadState('networkidle');
  });

  test('should not throw NotFoundError when WelcomeDialog renders', async ({ page }) => {
    console.log('[E2E] Starting WelcomeDialog NotFoundError test...');

    // 监听控制台错误
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        errors.push(text);
        console.log('[E2E] Console error:', text);
      }
    });

    // 监听页面错误
    const pageErrors: Error[] = [];
    page.on('pageerror', error => {
      pageErrors.push(error);
      console.log('[E2E] Page error:', error.message);
    });

    // 清除 onboarding 相关的 localStorage
    await page.evaluate(() => {
      localStorage.removeItem('ifai_onboarding_state');
      localStorage.removeItem('tour_completed');
      localStorage.removeItem('tour_skipped');
      localStorage.removeItem('onboarding_done');
    });

    // 重新加载页面
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 等待一段时间让错误发生
    await page.waitForTimeout(3000);

    // 检查是否有 NotFoundError
    const notFoundErrors = errors.filter(e =>
      e.includes('NotFoundError') ||
      e.includes('not found') ||
      e.includes('cannot be found')
    );

    console.log('[E2E] NotFoundError count:', notFoundErrors.length);
    console.log('[E2E] All errors:', errors);
    console.log('[E2E] Page errors:', pageErrors.map(e => e.message));

    // 这个测试目前会失败，因为我们期望重现 NotFoundError
    // 如果没有 NotFoundError，说明问题已经修复
    if (notFoundErrors.length > 0) {
      console.log('[E2E] ✗ NotFoundError reproduced!');
      console.log('[E2E] Error details:', notFoundErrors);
    } else {
      console.log('[E2E] ✓ No NotFoundError found - issue may be fixed');
    }

    // 尝试查找 WelcomeDialog 元素
    const welcomeDialog = page.locator('.theme-backdrop, .fixed.inset-0.z-50').first();

    try {
      await welcomeDialog.waitFor({ state: 'visible', timeout: 5000 });
      console.log('[E2E] ✓ WelcomeDialog is visible');

      // 检查对话框内容
      const titleText = await page.locator('h1').first().textContent();
      console.log('[E2E] WelcomeDialog title:', titleText);

      // 截图保存当前状态
      await page.screenshot({ path: 'test-output/welcome-dialog-state.png' });
      console.log('[E2E] Screenshot saved to test-output/welcome-dialog-state.png');

    } catch (e) {
      console.log('[E2E] ✗ WelcomeDialog not found or not visible:', e);

      // 即使 WelcomeDialog 不可见，也截图保存当前状态
      await page.screenshot({ path: 'test-output/welcome-dialog-error-state.png' });
      console.log('[E2E] Error state screenshot saved');
    }

    // 输出测试结果
    console.log('[E2E] === Test Summary ===');
    console.log('[E2E] Console errors:', errors.length);
    console.log('[E2E] Page errors:', pageErrors.length);
    console.log('[E2E] NotFoundError:', notFoundErrors.length);

    // 临时断言 - 记录当前状态
    expect(notFoundErrors.length).toBe(0);
  });

  test('should render WelcomeDialog without crashing after clearing state', async ({ page }) => {
    console.log('[E2E] Testing WelcomeDialog after clearing state...');

    // 清除所有存储
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // 重新加载
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 等待 5 秒让组件初始化
    await page.waitForTimeout(5000);

    // 检查页面是否仍然响应
    const isResponsive = await page.evaluate(() => {
      return document.body !== null && document.readyState === 'complete';
    });

    console.log('[E2E] Page is responsive:', isResponsive);
    expect(isResponsive).toBe(true);

    // 尝试查找任何对话框
    const dialogVisible = await page.locator('.theme-backdrop, [class*="dialog"], [class*="modal"]').count();
    console.log('[E2E] Dialog/modal elements found:', dialogVisible);

    // 最终截图
    await page.screenshot({ path: 'test-output/final-state.png', fullPage: true });
    console.log('[E2E] Full page screenshot saved');
  });

  test('should check DOM for potential NotFoundError sources', async ({ page }) => {
    console.log('[E2E] Checking DOM for potential issues...');

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 清除状态
    await page.evaluate(() => {
      localStorage.removeItem('ifai_onboarding_state');
    });

    await page.reload();
    await page.waitForTimeout(3000);

    // 检查 DOM 状态
    const domCheck = await page.evaluate(() => {
      const checks: any = {
        documentReady: document.readyState,
        bodyExists: !!document.body,
        themeBackdropExists: !!document.querySelector('.theme-backdrop'),
        fadeAnimationExists: !!document.querySelector('.animate-fade-in'),
        cssVariables: {},
        computedStyles: {}
      };

      // 检查关键 CSS 变量
      const testElement = document.createElement('div');
      testElement.className = 'theme-panel-elevated';
      document.body.appendChild(testElement);

      const styles = window.getComputedStyle(testElement);
      checks.computedStyles.backgroundColor = styles.backgroundColor;
      checks.computedStyles.borderRadius = styles.borderRadius;

      document.body.removeChild(testElement);

      return checks;
    });

    console.log('[E2E] DOM Check Results:', JSON.stringify(domCheck, null, 2));

    // 保存 DOM 状态
    expect(domCheck.bodyExists).toBe(true);
  });
});
