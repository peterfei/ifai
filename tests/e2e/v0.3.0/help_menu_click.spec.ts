/**
 * Simple E2E Test for Help Menu Click
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe.skip('Help Menu Click Test - TODO: Fix this test', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      console.log('[Console]', msg.text());
    });

    await setupE2ETestEnvironment(page, {
      useRealAI: false,
    });

    await page.goto('/');
    await page.waitForTimeout(3000);

    // 🔥 打开聊天面板（参考其他测试）
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(3000);
  });

  test('@commercial HELP-CLICK-01: Find and click help menu button', async ({ page }) => {
    // 查找所有可能包含"帮助"或"Help"的按钮
    const buttons = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      return allButtons.map(btn => ({
        text: btn.textContent?.trim(),
        class: btn.className,
        hasDataTestId: btn.hasAttribute('data-testid'),
        dataTestId: btn.getAttribute('data-testid')
      }));
    });

    console.log('[Buttons] All buttons:', buttons);

    // 查找帮助按钮
    const helpButton = buttons.find(b =>
      b.text.includes('帮助') ||
      b.text.includes('Help') ||
      b.dataTestId === 'help-menu-button'
    );

    console.log('[Help Button]', helpButton);

    if (!helpButton) {
      console.log('[Help Button] Not found - checking for Titlebar');

      // 检查 Titlebar 是否被渲染
      const hasTitlebar = await page.evaluate(() => {
        const bodyHTML = document.body.innerHTML;
        return {
          hasTitlebarClass: bodyHTML.includes('Titlebar') || bodyHTML.includes('titlebar'),
          bodyText: document.body.textContent?.substring(0, 500)
        };
      });

      console.log('[Titlebar Check]', hasTitlebar);
    }

    // 如果找到帮助按钮，点击它
    if (helpButton) {
      await page.evaluate((text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const button = buttons.find(btn => btn.textContent?.trim() === text);
        if (button) {
          (button as HTMLButtonElement).click();
        }
      }, helpButton.text);

      await page.waitForTimeout(1000);

      // 检查菜单是否打开
      const menuOpen = await page.evaluate(() => {
        const menus = document.querySelectorAll('[role="menu"]');
        return menus.length > 0;
      });

      console.log('[Menu] Open:', menuOpen);
    }
  });

  test('@commercial HELP-CLICK-02: Test AboutModal directly', async ({ page }) => {
    // 直接测试 AboutModal 组件
    const result = await page.evaluate(async () => {
      // 加载 helpStore
      const { useHelpStore } = await import('./stores/helpStore');

      // 打开关于页面
      useHelpStore.getState().openAbout();

      // 等待 React 更新
      await new Promise(resolve => setTimeout(resolve, 100));

      // 检查 DOM
      const hasModal = document.body.textContent?.includes('IfAI Editor');
      const state = useHelpStore.getState();

      return {
        hasModal,
        isAboutOpen: state.isAboutOpen,
        bodyText: document.body.textContent?.substring(0, 500)
      };
    });

    console.log('[Direct Test] Result:', result);

    await page.waitForTimeout(2000);

    // 再次检查
    const finalCheck = await page.evaluate(() => {
      return {
        bodyText: document.body.textContent?.substring(0, 1000),
        hasAbout: document.body.textContent?.includes('IfAI Editor'),
        hasVersion: document.body.textContent?.includes('v0.3')
      };
    });

    console.log('[Final Check]', finalCheck);
  });
});
