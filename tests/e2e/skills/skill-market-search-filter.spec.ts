/**
 * 🧪 技能市场搜索和过滤功能测试
 *
 * 测试目标：
 * - 验证技能市场的搜索功能正常工作
 * - 验证技能市场的分类过滤功能正常工作
 * - 验证搜索和过滤组合使用正常
 * - 验证清空搜索和过滤恢复正常显示
 *
 * @version 1.0.0
 * @tags skills, skill-market, search, filter
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe.skip('🧪 技能市场搜索和过滤功能 (Settings 技能中心已移除)', () => {
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

  test('场景1：打开技能市场应该显示技能列表和欢迎信息', async ({ page }) => {
    // 1. 打开技能市场
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillMarketOpen(true);
      }
    });

    // 等待技能市场渲染
    await page.waitForTimeout(1000);

    // 2. 验证技能市场已打开
    const marketOpen = await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      return layoutStore?.getState()?.isSkillMarketOpen;
    });
    expect(marketOpen).toBe(true);

    // 3. 验证显示技能列表和欢迎信息
    const marketContent = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      return {
        hasMarketTitle: bodyText.includes('技能市场'),
        hasWelcome: bodyText.includes('欢迎来到技能市场'),
        hasSkillCount: /\(\d+\)/.test(bodyText),
      };
    });

    expect(marketContent.hasMarketTitle).toBe(true);
    expect(marketContent.hasWelcome).toBe(true);
    expect(marketContent.hasSkillCount).toBe(true);
  });

  test('场景2：搜索功能应该能够过滤技能', async ({ page }) => {
    // 1. 打开技能市场
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillMarketOpen(true);
      }
    });
    await page.waitForTimeout(1000);

    // 2. 使用Playwright的type方法输入搜索关键词（使用中文）
    const searchInput = page.locator('input[placeholder="搜索技能..."]');
    await searchInput.click();
    await searchInput.fill('测试');
    await page.waitForTimeout(1000);

    // 3. 验证搜索框的值
    const inputValue = await searchInput.inputValue();
    expect(inputValue).toBe('测试');

    // 4. 验证搜索结果（只统计左侧列表的卡片）
    const searchResults = await page.evaluate(() => {
      const leftPanel = document.querySelector('.w-72');
      const skillCards = leftPanel ? leftPanel.querySelectorAll('[class*="rounded-lg"][class*="border"]') : [];
      const cardTexts = Array.from(skillCards).map(card => card.textContent?.toLowerCase() || '');
      return {
        cardCount: skillCards.length,
        cardTexts: cardTexts,
        hasTestSkill: cardTexts.some(text => text.includes('测试')),
      };
    });

    // 应该找到包含 "测试" 的技能
    expect(searchResults.cardCount).toBeGreaterThan(0);
    expect(searchResults.hasTestSkill).toBe(true);
  });

  test('场景3：分类过滤应该能够筛选技能', async ({ page }) => {
    // 1. 打开技能市场
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillMarketOpen(true);
      }
    });
    await page.waitForTimeout(1000);

    // 2. 点击 "开发" 分类
    const devButton = page.locator('button').filter({ hasText: '开发' }).first();
    await devButton.click();
    await page.waitForTimeout(500);

    // 3. 验证过滤结果
    const filterResults = await page.evaluate(() => {
      const skillCards = document.querySelectorAll('[class*="rounded-lg"][class*="border"]');
      return {
        cardCount: skillCards.length,
      };
    });

    expect(filterResults.cardCount).toBeGreaterThan(0);
  });

  test('场景4：清空搜索应该恢复显示所有技能', async ({ page }) => {
    // 1. 打开技能市场
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillMarketOpen(true);
      }
    });
    await page.waitForTimeout(1000);

    // 2. 先输入搜索
    const searchInput = page.locator('input[placeholder="搜索技能..."]');
    await searchInput.fill('test');
    await page.waitForTimeout(500);

    // 3. 获取搜索后的结果数量
    const searchResultCount = await page.evaluate(() => {
      const skillCards = document.querySelectorAll('[class*="rounded-lg"][class*="border"]');
      return skillCards.length;
    });

    // 4. 清空搜索
    await searchInput.fill('');
    await page.waitForTimeout(500);

    // 5. 验证恢复显示所有技能
    const allResults = await page.evaluate(() => {
      const skillCards = document.querySelectorAll('[class*="rounded-lg"][class*="border"]');
      return skillCards.length;
    });

    expect(allResults).toBeGreaterThanOrEqual(searchResultCount);
  });

  test.skip('场景5：搜索无结果应该显示空状态提示', async ({ page }) => {
    // 1. 打开技能市场
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillMarketOpen(true);
      }
    });
    await page.waitForTimeout(1000);

    // 2. 输入不存在的技能名称
    const searchInput = page.locator('input[placeholder="搜索技能..."]');
    await searchInput.click();
    await searchInput.fill('this-skill-does-not-exist-xyz123');
    await page.waitForTimeout(1000);

    // 3. 验证显示空状态
    const emptyState = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      // 查找左侧面板中的技能卡片
      const leftPanels = document.querySelectorAll('.w-72');
      let cardCount = 0;
      leftPanels.forEach(panel => {
        const cards = panel.querySelectorAll('[class*="rounded-lg"][class*="border"]');
        cardCount += cards.length;
      });
      return {
        hasEmptyMessage: bodyText.includes('未找到匹配的技能'),
        cardCount: cardCount,
      };
    });

    expect(emptyState.hasEmptyMessage).toBe(true);
    expect(emptyState.cardCount).toBe(0);
  });

  test.skip('场景6：点击技能卡片应该打开详情视图', async ({ page }) => {
    // 1. 打开技能市场
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillMarketOpen(true);
      }
    });
    await page.waitForTimeout(1000);

    // 2. 点击第一个技能卡片（使用locator来确保点击事件正确触发）
    const firstCard = page.locator('.w-72').first().locator('[class*="rounded-lg"][class*="border"]').first();
    await firstCard.click();
    await page.waitForTimeout(1000);

    // 3. 验证详情视图已打开
    const detailView = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      // 检查右侧详情面板是否显示
      const rightPanel = document.querySelector('.flex-1.flex.flex-col.h-full.bg-gray-900.border-l');
      const hasDetailContent = rightPanel ? (
        rightPanel.textContent?.includes('System Prompt') ||
        rightPanel.textContent?.includes('使用场景') ||
        rightPanel.textContent?.includes('安装到项目')
      ) : false;
      return {
        hasDetailTitle: hasDetailContent || bodyText.includes('System Prompt') ||
                           bodyText.includes('使用场景') ||
                           bodyText.includes('安装到项目'),
        hasBackButton: document.querySelector('button[title="返回"]') !== null,
        hasRightPanel: rightPanel !== null,
      };
    });

    expect(detailView.hasDetailTitle).toBe(true);
    expect(detailView.hasBackButton).toBe(true);
  });

  test('场景7：关闭技能市场应该返回主界面', async ({ page }) => {
    // 1. 打开技能市场
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && layoutStore.getState) {
        layoutStore.getState().setSkillMarketOpen(true);
      }
    });
    await page.waitForTimeout(1000);

    // 2. 验证技能市场已打开
    const marketOpen = await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      return layoutStore?.getState()?.isSkillMarketOpen;
    });
    expect(marketOpen).toBe(true);

    // 3. 关闭技能市场（使用title="关闭"的按钮）
    const closeButton = page.locator('button[title="关闭"]').first();
    await closeButton.click();
    await page.waitForTimeout(500);

    // 4. 验证技能市场已关闭
    const marketClosed = await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      return layoutStore?.getState()?.isSkillMarketOpen;
    });
    expect(marketClosed).toBe(false);

    // 5. 验证不再显示技能市场内容
    const marketContent = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      return {
        hasMarketTitle: bodyText.includes('技能市场'),
        hasWelcome: bodyText.includes('欢迎来到技能市场'),
      };
    });

    // 技能市场关闭后，这些内容应该不存在或不可见
    expect(marketContent.hasMarketTitle || marketContent.hasWelcome).toBe(false);
  });
});
