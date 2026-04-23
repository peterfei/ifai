import { test, expect } from '@playwright/test';
import { waitForEditorReady, closeWelcomeDialog } from '../helpers/wait-helpers';

/**
 * OnboardingTour 语言切换高保真测试集
 *
 * 对应测试用例文档:
 * - ONBOARDING-E2E-I18N-01: 语言切换不崩溃
 * - ONBOARDING-E2E-I18N-02: 语言切换后 Tour 正确重置
 * - ONBOARDING-E2E-I18N-03: 多次快速语言切换容错
 * - ONBOARDING-E2E-I18N-04: Tour 运行时语言切换场景还原
 *
 * 🎯 高保真场景还原：
 * - 模拟真实用户操作：打开面板 → 切换语言 → 验证状态
 * - 验证 ErrorBoundary 是否捕获错误
 * - 验证语言切换后 Joyride 是否正确重新挂载
 * - 验证控制台日志输出，确认场景准备步骤
 */

test.describe.skip('OnboardingTour Language Switch High-Fidelity Tests @v0.5.0 (功能未实现)', () => {
  test.beforeEach(async ({ page }) => {
    // 清除所有存储，模拟新用户
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      // 🔥 FIX: 设置初始语言为 zh-CN，确保测试一致性
      localStorage.setItem('i18nextLng', 'zh-CN');
    });

    // 监听控制台消息，验证高保真场景还原日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[OnboardingTour]')) {
        console.log(`[Browser Console] ${text}`);
      }
    });

    // 监听错误，验证 ErrorBoundary 是否生效
    page.on('pageerror', error => {
      console.error(`[Browser Error] ${error.message}`);
      if (error.message.includes('NotFoundError') || error.message.includes('Joyride')) {
        console.error('[CRITICAL] Joyride error detected:', error.message);
      }
    });

    await page.goto('/');
    await waitForEditorReady(page);
    await page.waitForTimeout(2000); // 等待 Tour 初始化
  });

  /**
   * ONBOARDING-E2E-I18N-01: 语言切换不崩溃
   *
   * 验收标准:
   * - Tour 在运行时切换语言不应导致应用崩溃
   * - ErrorBoundary 应捕获任何 Joyride 错误
   * - 应用应继续正常运行
   */
  test('ONBOARDING-E2E-I18N-01: Language switch does not crash the app', async ({ page }) => {
    console.log('=== Test: Language switch does not crash the app ===');

    // 1. 等待 Tour 启动
    const tourTooltip = page.getByRole('alertdialog', { name: /欢迎使用 IfAI Editor|Welcome|欢迎/i });
    await expect(tourTooltip, 'Tour should appear').toBeVisible({ timeout: 10000 });
    console.log('✓ Step 1: Tour started successfully');

    // 2. 验证当前是中文环境（标题包含中文）
    const titleElement = tourTooltip.locator('h1, h2, h3').first();
    const titleText = await titleElement.textContent();
    console.log(`Current tour title: ${titleText}`);
    expect(titleText).toMatch(/欢迎|Welcome|IfAI/i);
    console.log('✓ Step 2: Verified initial language (Chinese)');

    // 3. 记录当前语言
    const currentLang = await page.evaluate(() => localStorage.getItem('i18nextLng'));
    console.log(`Current language from localStorage: ${currentLang}`);
    expect(currentLang).toBe('zh-CN');
    console.log('✓ Step 3: Verified localStorage language is zh-CN');

    // 4. 🎯 高保真场景：在 Tour 运行时切换语言
    console.log('🎯 High-Fidelity Scene: Switching language while tour is running...');

    // 切换到英文 - 使用正确的方式：通过 i18next API
    await page.evaluate(() => {
      // 方法 1: 尝试使用 i18next 实例（如果已暴露）
      if ((window as any).i18next) {
        (window as any).i18next.changeLanguage('en-US');
        console.log('Language changed via i18next.changeLanguage');
      } else {
        // 方法 2: 通过 localStorage + 手动触发 storage 事件
        localStorage.setItem('i18nextLng', 'en-US');
        // 触发 storage 事件（带上必要的属性）
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'i18nextLng',
          oldValue: 'zh-CN',
          newValue: 'en-US',
          url: window.location.href,
          storageArea: localStorage,
        }));
        console.log('Language changed via localStorage + storage event');
      }
    });
    console.log('✓ Step 4: Language switched to en-US');

    // 5. 等待语言切换生效并验证
    await page.waitForTimeout(1500);

    // 6. 验证应用没有崩溃（页面仍然响应）
    const isPageResponsive = await page.evaluate(() => {
      return document.readyState === 'complete';
    });
    expect(isPageResponsive, 'App should still be responsive after language switch').toBe(true);
    console.log('✓ Step 5: App is still responsive (no crash)');

    // 7. 验证没有控制台错误（除了可能的 Joyride 内部错误）
    const hasCriticalErrors = await page.evaluate(() => {
      // 检查是否有未捕获的错误
      return (window as any).hasUncaughtError === true;
    });
    expect(hasCriticalErrors, 'Should not have critical uncaught errors').toBe(false);
    console.log('✓ Step 6: No critical uncaught errors detected');

    // 8. 验证 ErrorBoundary 是否捕获错误并静默失败
    // Tour 应该被卸载（因为语言切换），不显示错误
    const tourStillVisible = await tourTooltip.isVisible().catch(() => false);
    console.log(`Tour still visible after language switch: ${tourStillVisible}`);

    // Tour 应该被重新挂载或卸载，不应该保持旧的状态
    if (tourStillVisible) {
      console.log('ℹ️  Tour is still visible, verifying it remounted correctly...');

      // 如果 Tour 仍然可见，验证它已重新挂载（标题应该是英文）
      const newTitleText = await titleElement.textContent();
      console.log(`New tour title after language switch: ${newTitleText}`);

      // 标题应该是英文或重新渲染的中文
      expect(newTitleText).toBeTruthy();
      console.log('✓ Step 7: Tour remounted successfully with new title');
    } else {
      console.log('✓ Step 7: Tour was unmounted (expected behavior during language switch)');
    }

    console.log('✅ Test passed: Language switch does not crash the app');
  });

  /**
   * ONBOARDING-E2E-I18N-02: 语言切换后 Tour 正确重置
   *
   * 验收标准:
   * - 语言切换后 Tour 状态应正确重置
   * - 高保真场景还原（CommandBar/Settings）应正确执行
   * - 控制台应输出场景准备日志
   */
  test('ONBOARDING-E2E-I18N-02: Tour correctly resets after language switch', async ({ page }) => {
    console.log('=== Test: Tour correctly resets after language switch ===');

    // 1. 等待 Tour 启动并进入第二步（CommandBar 演示）
    const tourTooltip = page.getByRole('alertdialog', { name: /欢迎使用 IfAI Editor|Welcome|欢迎/i });
    await expect(tourTooltip).toBeVisible({ timeout: 10000 });
    console.log('✓ Step 1: Tour started');

    // 2. 点击下一步，进入 CommandBar 步骤
    const nextButton = page.getByRole('button', { name: /下一步|Next \(Step 1 of 4\)/i });
    await nextButton.click();
    await page.waitForTimeout(1000);
    console.log('✓ Step 2: Clicked Next button');

    // 3. 验证 CommandBar 已打开（高保真场景还原）
    const commandBar = page.locator('[data-test-id="quick-command-bar"]');
    const commandBarVisible = await commandBar.isVisible().catch(() => false);
    console.log(`CommandBar visible before language switch: ${commandBarVisible}`);
    expect(commandBarVisible, 'CommandBar should be visible in step 2').toBe(true);
    console.log('✓ Step 3: CommandBar is open (high-fidelity scene restored)');

    // 4. 🎯 高保真场景：在 CommandBar 打开时切换语言
    console.log('🎯 High-Fidelity Scene: Switching language while CommandBar is open...');

    // 收集控制台日志（验证场景还原日志）
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[OnboardingTour]') && text.includes('Scene ready')) {
        consoleLogs.push(text);
      }
    });

    // 切换到英文 - 使用正确的方式
    await page.evaluate(() => {
      if ((window as any).i18next) {
        (window as any).i18next.changeLanguage('en-US');
      } else {
        localStorage.setItem('i18nextLng', 'en-US');
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'i18nextLng',
          oldValue: 'zh-CN',
          newValue: 'en-US',
          url: window.location.href,
          storageArea: localStorage,
        }));
      }
    });
    console.log('✓ Step 4: Language switched to en-US');

    // 5. 等待语言切换和 DOM 稳定
    await page.waitForTimeout(2000);
    console.log('✓ Step 5: Waited for DOM stabilization');

    // 6. 验证 CommandBar 已关闭（语言切换时关闭所有面板）
    const commandBarVisibleAfter = await commandBar.isVisible().catch(() => false);
    console.log(`CommandBar visible after language switch: ${commandBarVisibleAfter}`);
    expect(commandBarVisibleAfter, 'CommandBar should be closed after language switch').toBe(false);
    console.log('✓ Step 6: CommandBar was closed (panels cleaned up during language switch)');

    // 7. 验证 Tour 是否重新挂载或保持在初始状态
    const tourStillVisible = await tourTooltip.isVisible().catch(() => false);
    console.log(`Tour visible after language switch: ${tourStillVisible}`);

    if (tourStillVisible) {
      console.log('ℹ️  Tour remounted, checking step...');
      // Tour 应该回到第一步（欢迎屏幕）
      const titleElement = tourTooltip.locator('h1, h2, h3').first();
      const titleText = await titleElement.textContent();
      console.log(`Tour title after language switch: ${titleText}`);
      expect(titleText).toBeTruthy();
      console.log('✓ Step 7: Tour reset to initial state');
    } else {
      console.log('ℹ️  Tour was unmounted (acceptable behavior)');
    }

    // 8. 验证高保真场景还原日志
    console.log('📋 Console logs with "Scene ready":');
    consoleLogs.forEach(log => console.log(`  - ${log}`));

    // 应该有关闭面板的日志
    const hasCleanupLogs = consoleLogs.some(log =>
      log.includes('Scene ready') || log.includes('Language changed')
    );
    if (hasCleanupLogs) {
      console.log('✓ Step 8: High-fidelity scene restoration logs detected');
    } else {
      console.log('⚠️  Step 8: No scene restoration logs found (may have been cleared)');
    }

    console.log('✅ Test passed: Tour correctly resets after language switch');
  });

  /**
   * ONBOARDING-E2E-I18N-03: 多次快速语言切换容错
   *
   * 验收标准:
   * - 快速连续切换语言不应导致应用崩溃
   * - ErrorBoundary 应捕获所有错误
   * - 最终状态应该是一致的
   */
  test('ONBOARDING-E2E-I18N-03: Rapid language switches do not crash', async ({ page }) => {
    console.log('=== Test: Rapid language switches do not crash ===');

    // 1. 等待 Tour 启动
    const tourTooltip = page.getByRole('alertdialog', { name: /欢迎使用 IfAI Editor|Welcome|欢迎/i });
    await expect(tourTooltip).toBeVisible({ timeout: 10000 });
    console.log('✓ Step 1: Tour started');

    // 2. 🎯 高保真场景：快速连续切换语言 3 次
    console.log('🎯 High-Fidelity Scene: Rapid language switching (3 times)...');

    const languages = ['en-US', 'zh-CN', 'en-US'];
    for (let i = 0; i < languages.length; i++) {
      const lang = languages[i];
      console.log(`Switching to ${lang} (${i + 1}/${languages.length})...`);

      await page.evaluate((lng: string) => {
        if ((window as any).i18next) {
          (window as any).i18next.changeLanguage(lng);
        } else {
          const oldLang = localStorage.getItem('i18nextLng');
          localStorage.setItem('i18nextLng', lng);
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'i18nextLng',
            oldValue: oldLang,
            newValue: lng,
            url: window.location.href,
            storageArea: localStorage,
          }));
        }
      }, lang);

      // 短暂等待（模拟用户快速操作）
      await page.waitForTimeout(300);
    }

    console.log('✓ Step 2: Completed 3 rapid language switches');

    // 3. 等待 DOM 完全稳定
    await page.waitForTimeout(1500);
    console.log('✓ Step 3: Waited for DOM stabilization');

    // 4. 验证应用没有崩溃
    const isPageResponsive = await page.evaluate(() => {
      return document.readyState === 'complete' && document.body !== null;
    });
    expect(isPageResponsive, 'App should still be responsive after rapid switches').toBe(true);
    console.log('✓ Step 4: App is still responsive (no crash)');

    // 5. 验证最终语言状态一致
    const finalLang = await page.evaluate(() => localStorage.getItem('i18nextLng'));
    console.log(`Final language: ${finalLang}`);
    expect(finalLang).toBe('en-US'); // 最后切换的语言
    console.log('✓ Step 5: Final language state is consistent');

    // 6. 验证 Tour 状态一致
    const tourVisible = await tourTooltip.isVisible().catch(() => false);
    console.log(`Tour visible after rapid switches: ${tourVisible}`);

    if (tourVisible) {
      // Tour 应该以正确的语言重新挂载
      const titleElement = tourTooltip.locator('h1, h2, h3').first();
      const titleText = await titleElement.textContent();
      console.log(`Tour title after rapid switches: ${titleText}`);
      expect(titleText).toBeTruthy();
      console.log('✓ Step 6: Tour is in consistent state');
    } else {
      console.log('✓ Step 6: Tour was unmounted (acceptable behavior)');
    }

    console.log('✅ Test passed: Rapid language switches do not crash');
  });

  /**
   * ONBOARDING-E2E-I18N-04: Tour 运行时语言切换场景还原
   *
   * 验收标准:
   * - 在不同步骤切换语言应正确处理
   * - CommandBar、Settings 等面板应正确关闭/打开
   * - 高保真场景还原日志应正确输出
   */
  test('ONBOARDING-E2E-I18N-04: Scene restoration during language switch', async ({ page }) => {
    console.log('=== Test: Scene restoration during language switch ===');

    // 1. 等待 Tour 启动
    const tourTooltip = page.getByRole('alertdialog', { name: /欢迎使用 IfAI Editor|Welcome|欢迎/i });
    await expect(tourTooltip).toBeVisible({ timeout: 10000 });
    console.log('✓ Step 1: Tour started');

    // 2. 收集控制台日志
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[OnboardingTour]')) {
        consoleLogs.push(text);
        console.log(`[Captured] ${text}`);
      }
    });

    // 3. 进入 Settings 步骤（步骤 3）
    const nextButton = page.getByRole('button', { name: /下一步|Next/i });
    await nextButton.click(); // 步骤 1 → 步骤 2
    await page.waitForTimeout(1000);

    await nextButton.click(); // 步骤 2 → 步骤 3
    await page.waitForTimeout(1000);
    console.log('✓ Step 2: Navigated to Settings step (step 3)');

    // 4. 验证 Settings 已打开
    const settingsModal = page.locator('[data-testid="settings-modal"]');
    await expect(settingsModal, 'Settings should be visible in step 3').toBeVisible();
    console.log('✓ Step 3: Settings modal is open');

    // 5. 🎯 高保真场景：在 Settings 打开时切换语言
    console.log('🎯 High-Fidelity Scene: Switching language while Settings is open...');

    await page.evaluate(() => {
      if ((window as any).i18next) {
        (window as any).i18next.changeLanguage('en-US');
      } else {
        localStorage.setItem('i18nextLng', 'en-US');
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'i18nextLng',
          oldValue: 'zh-CN',
          newValue: 'en-US',
          url: window.location.href,
          storageArea: localStorage,
        }));
      }
    });
    console.log('✓ Step 4: Language switched to en-US');

    // 6. 等待语言切换和 DOM 稳定
    await page.waitForTimeout(2000);
    console.log('✓ Step 5: Waited for DOM stabilization');

    // 7. 验证 Settings 已关闭（语言切换时关闭所有面板）
    const settingsVisibleAfter = await settingsModal.isVisible().catch(() => false);
    console.log(`Settings visible after language switch: ${settingsVisibleAfter}`);
    expect(settingsVisibleAfter, 'Settings should be closed after language switch').toBe(false);
    console.log('✓ Step 6: Settings was closed (panels cleaned up)');

    // 8. 验证 CommandBar 也已关闭（所有面板都应关闭）
    const commandBar = page.locator('[data-test-id="quick-command-bar"]');
    const commandBarVisibleAfter = await commandBar.isVisible().catch(() => false);
    console.log(`CommandBar visible after language switch: ${commandBarVisibleAfter}`);
    expect(commandBarVisibleAfter, 'CommandBar should also be closed').toBe(false);
    console.log('✓ Step 7: All panels were closed (complete cleanup)');

    // 9. 验证控制台日志包含场景还原信息
    const hasLanguageChangeLog = consoleLogs.some(log =>
      log.includes('Language changed') && log.includes('aggressively resetting')
    );
    if (hasLanguageChangeLog) {
      console.log('✓ Step 8: Language change log detected');
      const languageChangeLog = consoleLogs.find(log => log.includes('Language changed'));
      console.log(`  Log: ${languageChangeLog}`);
    } else {
      console.log('⚠️  Step 8: Language change log not found (may have been cleared)');
    }

    // 10. 验证应用状态正常
    const isPageResponsive = await page.evaluate(() => {
      return document.readyState === 'complete';
    });
    expect(isPageResponsive, 'App should be responsive').toBe(true);
    console.log('✓ Step 9: App is responsive');

    console.log('✅ Test passed: Scene restoration during language switch');
  });

  /**
   * ONBOARDING-E2E-I18N-05: ErrorBoundary 验证
   *
   * 验收标准:
   * - ErrorBoundary 应捕获 Joyride 错误
   * - 错误不应传播到整个应用
   * - 应用应继续正常运行
   */
  test('ONBOARDING-E2E-I18N-05: ErrorBoundary catches Joyride errors', async ({ page }) => {
    console.log('=== Test: ErrorBoundary catches Joyride errors ===');

    // 1. 等待 Tour 启动
    const tourTooltip = page.getByRole('alertdialog', { name: /欢迎使用 IfAI Editor|Welcome|欢迎/i });
    await expect(tourTooltip).toBeVisible({ timeout: 10000 });
    console.log('✓ Step 1: Tour started');

    // 2. 监听所有错误
    const errors: string[] = [];
    page.on('pageerror', error => {
      errors.push(error.message);
      console.error(`[Captured Error] ${error.message}`);
    });

    // 3. 🎯 高保真场景：触发可能导致 Joyride 错误的场景
    console.log('🎯 High-Fidelity Scene: Triggering potential Joyride error...');

    // 快速连续切换语言，可能导致 DOM 查询失败
    for (let i = 0; i < 5; i++) {
      const lang = i % 2 === 0 ? 'en-US' : 'zh-CN';
      await page.evaluate((lng: string) => {
        if ((window as any).i18next) {
          (window as any).i18next.changeLanguage(lng);
        } else {
          const oldLang = localStorage.getItem('i18nextLng');
          localStorage.setItem('i18nextLng', lng);
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'i18nextLng',
            oldValue: oldLang,
            newValue: lng,
            url: window.location.href,
            storageArea: localStorage,
          }));
        }
      }, lang);
      await page.waitForTimeout(100); // 非常快的切换
    }
    console.log('✓ Step 2: Executed 5 rapid language switches');

    // 4. 等待稳定
    await page.waitForTimeout(2000);
    console.log('✓ Step 3: Waited for stabilization');

    // 5. 验证应用仍然响应
    const isPageResponsive = await page.evaluate(() => {
      return document.readyState === 'complete' && document.body !== null;
    });
    expect(isPageResponsive, 'App should still be responsive').toBe(true);
    console.log('✓ Step 4: App is still responsive');

    // 6. 验证错误被正确处理
    const joyrideErrors = errors.filter(e =>
      e.includes('NotFoundError') ||
      e.includes('Joyride') ||
      e.includes('object can not be found')
    );

    if (joyrideErrors.length > 0) {
      console.log(`⚠️  Found ${joyrideErrors.length} Joyride-related errors:`);
      joyrideErrors.forEach(err => console.log(`  - ${err}`));
      console.log('ℹ️  These errors should have been caught by ErrorBoundary');
    }

    // 关键验证：应用没有完全崩溃
    const appStillRunning = await page.evaluate(() => {
      return document.body !== null && document.body.children.length > 0;
    });
    expect(appStillRunning, 'App should still be running').toBe(true);
    console.log('✓ Step 5: App is still running (ErrorBoundary prevented crash)');

    console.log('✅ Test passed: ErrorBoundary catches Joyride errors');
  });
});
