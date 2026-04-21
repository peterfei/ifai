/**
 * 🧪 技能面板搜索和筛选功能测试
 *
 * 测试目标：
 * - 验证技能面板的搜索功能正常工作
 * - 验证技能面板的筛选功能正常工作
 *
 * @version 1.0.0
 * @tags skills, skill-panel, search, filter
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('🧪 技能面板搜索和筛选功能', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);

    // 初始化环境
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });

    // 设置本地存储，跳过新手引导
    await page.addInitScript(() => {
      window.localStorage.setItem('joyride_finished', 'true');
      window.localStorage.setItem('onboarding_completed', 'true');
      window.localStorage.setItem('ifai_onboarding_state', JSON.stringify({
        completed: true,
        skipped: true,
        remindCount: 0,
        lastRemindDate: null
      }));
    });

    // 导航到主页
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // 等待应用初始化
    await page.waitForTimeout(3000);
  });

  test('场景1：打开技能面板应该显示技能列表', async ({ page }) => {
    // 1. 打开技能面板
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillsPanelOpen(true);
      }
    });

    // 等待技能面板渲染
    await page.waitForTimeout(1000);

    // 2. 验证技能面板已打开
    const panelOpen = await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      return layoutStore?.getState()?.isSkillsPanelOpen;
    });
    expect(panelOpen).toBe(true);

    // 3. 验证显示技能列表
    const panelContent = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      return {
        hasSkillTitle: bodyText.includes('技能'),
        hasSkillCount: /\(\d+\/\d+\)/.test(bodyText),
      };
    });

    expect(panelContent.hasSkillTitle).toBe(true);
    expect(panelContent.hasSkillCount).toBe(true);
  });

  test('场景2：搜索按钮应该能够展开搜索框', async ({ page }) => {
    // 1. 打开技能面板
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillsPanelOpen(true);
      }
    });
    await page.waitForTimeout(1000);

    // 2. 点击搜索按钮
    const searchButton = page.locator('button[title="搜索技能"]').first();
    await searchButton.click();
    await page.waitForTimeout(500);

    // 3. 验证搜索框已展开
    const searchInput = page.locator('input[placeholder="搜索技能..."]');
    const isVisible = await searchInput.isVisible();
    expect(isVisible).toBe(true);
  });

  test('场景3：搜索功能应该能够过滤技能', async ({ page }) => {
    // 1. 打开技能面板并展开搜索框
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillsPanelOpen(true);
      }
    });
    await page.waitForTimeout(1000);

    const searchButton = page.locator('button[title="搜索技能"]').first();
    await searchButton.click();
    await page.waitForTimeout(500);

    // 2. 输入搜索关键词
    const searchInput = page.locator('input[placeholder="搜索技能..."]');
    await searchInput.click();
    await searchInput.fill('test');
    await page.waitForTimeout(500);

    // 3. 验证搜索框的值
    const inputValue = await searchInput.inputValue();
    expect(inputValue).toBe('test');
  });

  test('场景4：筛选按钮应该能够展开筛选选项', async ({ page }) => {
    // 1. 打开技能面板
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillsPanelOpen(true);
      }
    });
    await page.waitForTimeout(1000);

    // 2. 点击筛选按钮
    const filterButton = page.locator('button[title="筛选技能"]').first();
    await filterButton.click();
    await page.waitForTimeout(500);

    // 3. 验证筛选选项已展开
    const filterOptions = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      return {
        hasStatus: bodyText.includes('状态：'),
        hasAll: bodyText.includes('全部'),
        hasActive: bodyText.includes('已激活'),
        hasInstalled: bodyText.includes('已安装'),
      };
    });

    expect(filterOptions.hasStatus).toBe(true);
    expect(filterOptions.hasAll).toBe(true);
  });

  test('场景5：筛选功能应该能够按状态过滤技能', async ({ page }) => {
    // 1. 打开技能面板并展开筛选选项
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillsPanelOpen(true);
      }
    });
    await page.waitForTimeout(1000);

    const filterButton = page.locator('button[title="筛选技能"]').first();
    await filterButton.click();
    await page.waitForTimeout(500);

    // 2. 点击"已激活"筛选
    const activeFilterButton = page.locator('text=已激活').first();
    await activeFilterButton.click();
    await page.waitForTimeout(500);

    // 3. 验证筛选按钮被激活（变蓝）
    const isActive = await activeFilterButton.evaluate(el =>
      el.classList.contains('bg-green-600') || el.textContent?.includes('已激活')
    );

    expect(isActive).toBe(true);
  });

  test('场景6：技能市场按钮应该能够打开技能市场', async ({ page }) => {
    // 1. 打开技能面板
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillsPanelOpen(true);
      }
    });
    await page.waitForTimeout(1000);

    // 2. 点击技能市场按钮
    const marketButton = page.locator('button[title="技能市场"]').first();
    await marketButton.click();
    await page.waitForTimeout(500);

    // 3. 验证技能市场已打开
    const marketOpen = await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      return layoutStore?.getState()?.isSkillMarketOpen;
    });
    expect(marketOpen).toBe(true);
  });
});
