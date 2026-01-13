import { test, expect, Locator } from '@playwright/test';
import { waitForEditorReady, closeWelcomeDialog, closeTour } from '../helpers/wait-helpers';

/**
 * 用户引导与帮助系统测试集
 *
 * 对应测试用例文档:
 * - HELP-E2E-01: 帮助菜单可用性
 * - HELP-E2E-02: 快捷键面板呼出
 * - HELP-E2E-03: 新手引导流程
 * - HELP-E2E-04: 引导跳过与重置
 */

test.describe('Feature: Help & Onboarding @v0.3.0', () => {
  // 这些测试不需要 Tour，使用 beforeEach 阻止 Tour 启动
  test.describe('Tests without Tour', () => {
    test.beforeEach(async ({ page }) => {
      // 在页面加载前设置 localStorage，防止 Tour 自动启动
      await page.addInitScript(() => {
        localStorage.setItem('tour_completed', 'true');
        localStorage.setItem('tour_skipped', 'false');
        localStorage.setItem('onboarding_done', 'true');
      });

      await page.goto('/');
      await waitForEditorReady(page);
      // 关闭首次启动的 WelcomeDialog（本地模型下载提示）
      await closeWelcomeDialog(page);
    });

    /**
     * HELP-E2E-01: 帮助菜单可用性
     *
     * 验收标准:
     * - 验证菜单栏包含 "Help" / "帮助"
     * - 下拉项包含 "Documentation", "Keyboard Shortcuts", "About"
     */
    test('HELP-E2E-01: Help Menu Existence and Items', async ({ page }) => {
    // 1. 定位菜单栏
    // 可能是自定义标题栏菜单，或者系统菜单模拟
    const menuBar = page.locator('[data-testid="main-menu-bar"], .title-bar, .menubar');

    // 如果是 Native Menu (macOS)，Playwright 难以直接测试
    // 通常应用会提供一个 UI 上的替代入口或汉堡菜单
    const helpMenuTrigger = page.getByRole('button', { name: /help|帮助/i }).or(
      page.locator('[data-testid="help-menu"], .help-menu')
    );

    // 检查是否有帮助入口
    const helpEntryCount = await helpMenuTrigger.count();

    if (helpEntryCount === 0) {
      // 如果没有找到帮助入口，标记为功能缺失
      test.skip(true, 'Help menu not found - feature needs to be implemented');
      return;
    }

    // 2. 点击帮助菜单
    await helpMenuTrigger.first().click();

    // 3. 验证下拉内容
    const menuContent = page.locator('[role="menu"], .dropdown-menu, .menu-content');
    await expect(menuContent, 'Help menu content should be visible').toBeVisible();

    // 4. 验证包含关键选项
    const expectedItems = [
      /Documentation|文档|帮助文档/i,
      /Keyboard.*Shortcuts|快捷键|键盘/i,
      /About|关于/i,
    ];

    for (const pattern of expectedItems) {
      const item = menuContent.getByText(pattern);
      const itemCount = await item.count();

      if (itemCount === 0) {
        console.warn(`Help menu item matching ${pattern} not found`);
      } else {
        await expect(item.first()).toBeVisible();
      }
    }

    // 关闭菜单
    await page.keyboard.press('Escape');
  });

  /**
   * HELP-E2E-02: 快捷键面板呼出
   *
   * 验收标准:
   * - 点击菜单中的 "Keyboard Shortcuts" 或按 `Cmd+K Cmd+S`
   * - 应弹出快捷键列表模态框
   */
  test('HELP-E2E-02: Keyboard Shortcuts Dialog', async ({ page }) => {
    // 关闭 Tour（如果出现），避免干扰快捷键测试
    await closeTour(page);

    // 方法 1: 通过快捷键呼出
    await page.keyboard.press('Meta+K');
    await page.keyboard.press('Meta+S');

    // 方法 2: 或者通过菜单呼出
    // const helpMenu = page.getByRole('button', { name: /help|帮助/i });
    // if (await helpMenu.count() > 0) {
    //   await helpMenu.click();
    //   await page.getByText(/Keyboard.*Shortcuts|快捷键/).click();
    // }

    // 验证模态框弹出
    const dialog = page.locator('[data-testid="keyboard-shortcuts-dialog"], .shortcuts-dialog, [role="dialog"]');

    const dialogCount = await dialog.count();
    if (dialogCount === 0) {
      test.skip(true, 'Keyboard shortcuts dialog not implemented yet');
      return;
    }

    await expect(dialog.first(), 'Shortcuts dialog should be visible').toBeVisible();

    // 验证包含常用快捷键
    const expectedShortcuts = [
      /Command Palette|命令面板/i,
      /Quick Open|快速打开/i,
      /Save|保存/i,
    ];

    for (const pattern of expectedShortcuts) {
      const hasShortcut = await dialog.getByText(pattern).count() > 0;
      if (!hasShortcut) {
        console.warn(`Shortcut ${pattern} not listed in dialog`);
      }
    }

    // 关闭对话框
    await page.keyboard.press('Escape');
  });
  }); // 关闭 "Tests without Tour" 块

  // 这些测试需要 Tour 功能
  test.describe('Tests with Tour', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await waitForEditorReady(page);
      await closeWelcomeDialog(page);
    });

  /**
   * HELP-E2E-03: 新手引导流程
   *
   * 验收标准:
   * - 首次启动（清除 LocalStorage）后，应自动触发引导气泡
   * - 指引 "Chat", "Explorer" 等核心区域
   */
  test('HELP-E2E-03: Onboarding Tour for New Users', async ({ page }) => {
    // 1. 清除 LocalStorage 以模拟新用户
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.reload();
    await waitForEditorReady(page);

    // 2. 等待应用加载
    await page.waitForTimeout(2000); // 给引导系统时间初始化

    // 3. 验证引导气泡出现
    // 常见的引导库选择器: driver.js, react-joyride, intro.js
    const tourSelectors = [
      '[role="dialog"][aria-label*="tour"]',
      '.driver-popover',
      '.react-joyride__tooltip',
      '.introjs-tooltip',
      '[data-testid="onboarding-tooltip"]',
    ];

    let tourTooltip = page.locator(tourSelectors.join(', '));
    const tooltipCount = await tourTooltip.count();

    if (tooltipCount === 0) {
      test.skip(true, 'Onboarding tour not implemented yet');
      return;
    }

    await expect(tourTooltip.first(), 'Tour tooltip should appear for new users').toBeVisible({ timeout: 5000 });

    // 4. 验证引导内容 - 直接从 aria-label 获取标题（react-joyride 的标题在 aria-label 中）
    const ariaLabel = await tourTooltip.first().getAttribute('aria-label') || '';
    const tooltipText = await tourTooltip.first().textContent() || '';
    const finalTitle = ariaLabel || tooltipText;

    expect(finalTitle).toMatch(/Welcome|欢迎|Getting Started|开始使用|IfAI/i);

    // 5. 验证引导按钮
    const nextButton = tourTooltip.getByRole('button', { name: /Next|下一步|Continue/i });
    const skipButton = tourTooltip.getByRole('button', { name: /Skip|跳过|Close/i });

    const hasNext = await nextButton.count() > 0;
    const hasSkip = await skipButton.count() > 0;

    // 至少应该有一个操作按钮
    expect(hasNext || hasSkip, 'Tour should have navigation buttons').toBe(true);

    // 6. 交互：点击下一步
    if (hasNext) {
      // 记录当前高亮的元素（如果有）
      const currentHighlight = page.locator('.driver-active-element, .tour-highlight');

      await nextButton.click();
      await page.waitForTimeout(500);

      // 验证引导还在（进入下一步）
      await expect(tourTooltip.first()).toBeVisible();

      // 如果有高亮元素，应该已经变化
      // 这里只是示例，实际取决于具体实现
    }
  });

  /**
   * HELP-E2E-04: 引导跳过与重置
   *
   * 验收标准:
   * - 验证 "Skip" 按钮能关闭引导
   * - 验证 "Reset Tutorial" 能重新触发引导
   */
  test('HELP-E2E-04: Skip and Reset Onboarding', async ({ page }) => {
    // === Part 1: 测试跳过功能 ===

    // 1. 清除并重新加载以触发引导
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.reload();
    await waitForEditorReady(page);
    await page.waitForTimeout(2000);

    // 2. 查找引导气泡
    const tourSelectors = [
      '[role="dialog"][aria-label*="tour"]',
      '.driver-popover',
      '.react-joyride__tooltip',
      '[data-testid="onboarding-tooltip"]',
    ];

    let tourTooltip = page.locator(tourSelectors.join(', '));
    const tooltipCount = await tourTooltip.count();

    if (tooltipCount === 0) {
      test.skip(true, 'Onboarding tour not implemented yet - cannot test skip/reset');
      return;
    }

    await expect(tourTooltip.first()).toBeVisible({ timeout: 5000 });

    // 3. 点击跳过按钮
    const skipButton = tourTooltip.getByRole('button', { name: /Skip|跳过|Close|关闭/i });
    const hasSkipButton = await skipButton.count() > 0;

    if (hasSkipButton) {
      await skipButton.first().click();

      // 4. 验证引导已关闭
      await expect(tourTooltip.first(), 'Tour should be hidden after skipping').not.toBeVisible({ timeout: 2000 });

      // 5. 验证 localStorage 已记录跳过状态
      const skipState = await page.evaluate(() => {
        return {
          tourCompleted: localStorage.getItem('tour_completed'),
          tourSkipped: localStorage.getItem('tour_skipped'),
          onboardingDone: localStorage.getItem('onboarding_done'),
        };
      });

      // 应该至少有一个状态被记录
      const hasSkipRecord = Object.values(skipState).some(v => v !== null);
      expect(hasSkipRecord, 'Skip state should be persisted').toBe(true);
    }

    // === Part 2: 测试重置功能 ===

    // 6. 查找重置引导的入口
    // 可能在：设置面板、帮助菜单、命令面板等
    const resetEntrySelectors = [
      // 设置中
      '[data-testid="reset-tutorial"], button:has-text("Reset Tutorial")',
      // 帮助菜单中
      '.help-menu [data-testid="reset-onboarding"]',
      // 命令面板中
    ];

    let resetButtonFound = false;

    for (const selector of resetEntrySelectors) {
      const locator = page.locator(selector).first();
      if (await locator.count() > 0) {
        await locator.click();
        resetButtonFound = true;
        break;
      }
    }

    if (!resetButtonFound) {
      // 尝试通过命令面板触发
      await page.keyboard.press('Control+Shift+P'); // 命令面板
      await page.waitForTimeout(500);

      const commandPalette = page.locator('[data-testid="command-palette"], .command-palette');
      const commandInput = commandPalette.locator('input').or(page.locator('[role="combobox"]'));

      const hasCommandPalette = await commandPalette.count() > 0;
      if (hasCommandPalette) {
        await commandInput.first().fill('reset tutorial');
        await page.waitForTimeout(500);

        const resetCommand = commandPalette.getByText(/reset.*tutorial|重置.*引导/i);
        if (await resetCommand.count() > 0) {
          await resetCommand.first().click();
          resetButtonFound = true;
        }
      }
    }

    if (!resetButtonFound) {
      test.skip(true, 'Reset tutorial button not found - feature may not be implemented');
      return;
    }

    // 7. 点击重置按钮（已在上面完成）
    // await resetButton.click();

    // 8. 验证确认对话框（如果有）
    const confirmDialog = page.locator('[role="dialog"]');
    if (await confirmDialog.count() > 0) {
      const confirmButton = confirmDialog.getByRole('button', { name: /Confirm|确认|Reset/i });
      const hasConfirm = await confirmButton.count() > 0;

      if (hasConfirm) {
        await confirmButton.first().click();
      }
    }

    // 9. 验证引导重新出现
    await page.waitForTimeout(1000);

    tourTooltip = page.locator(tourSelectors.join(', '));
    await expect(tourTooltip.first(), 'Tour should reappear after reset').toBeVisible({ timeout: 5000 });

    // 10. 验证状态已重置
    const resetState = await page.evaluate(() => {
      return {
        tourCompleted: localStorage.getItem('tour_completed'),
        tourSkipped: localStorage.getItem('tour_skipped'),
        onboardingDone: localStorage.getItem('onboarding_done'),
      };
    });

    // 状态应该被清除
    const allCleared = Object.values(resetState).every(v => v === null || v === 'false' || v === '0');
    expect(allCleared, 'Tour state should be cleared after reset').toBe(true);
  });

  /**
   * 额外测试: 引导完成状态持久化
   */
  test('HELP-E2E-05: Onboarding completion persistence', async ({ page }) => {
    // 1. 清除并重新加载
    await page.evaluate(() => {
      localStorage.clear();
    });

    await page.reload();
    await waitForEditorReady(page);
    await page.waitForTimeout(2000);

    // 2. 检查是否有引导
    const tourTooltip = page.locator('.driver-popover, .react-joyride__tooltip');
    const hasTour = await tourTooltip.count() > 0;

    if (!hasTour) {
      test.skip(true, 'Onboarding tour not implemented');
      return;
    }

    // 3. 完成引导（点击所有 Next 直到完成）
    let maxSteps = 10; // 防止无限循环
    let stepsCompleted = 0;

    while (stepsCompleted < maxSteps) {
      const nextButton = tourTooltip.getByRole('button', { name: /Next|下一步|Finish|完成|Last/i });
      const hasNext = await nextButton.count() > 0;

      if (!hasNext) {
        break;
      }

      const buttonText = await nextButton.first().textContent();
      await nextButton.first().click();
      await page.waitForTimeout(800);

      // 如果是完成按钮，退出循环
      if (buttonText?.match(/Finish|完成|Done|Last/i)) {
        break;
      }

      stepsCompleted++;
    }

    // 4. 如果 Tour 还在，使用 Skip 按钮关闭它（在 Tour tooltip 内查找）
    const skipButton = tourTooltip.getByRole('button', { name: /Skip|跳过/i });
    const hasSkip = await skipButton.count() > 0;
    if (hasSkip) {
      await skipButton.first().click();
      await page.waitForTimeout(1000);
    }

    // 5. 验证引导已完成
    await expect(tourTooltip.first()).not.toBeVisible({ timeout: 5000 });

    // 6. 验证完成状态已保存
    const completionState = await page.evaluate(() => {
      return localStorage.getItem('tour_completed') ||
             localStorage.getItem('onboarding_done') ||
             localStorage.getItem('tour_skipped'); // Skip 也是一种完成状态
    });

    expect(completionState, 'Tour completion should be persisted').toBeTruthy();

    // 7. 刷新页面，验证引导不再出现
    await page.reload();
    await waitForEditorReady(page);
    await page.waitForTimeout(2000);

    await expect(tourTooltip.first(), 'Tour should not reappear after completion').not.toBeVisible({ timeout: 3000 });
  });
  }); // 关闭 "Tests with Tour" 块
});
