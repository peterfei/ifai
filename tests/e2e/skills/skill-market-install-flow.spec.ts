/**
 * 🧪 技能广场安装流程 E2E 测试 (高保真版)
 *
 * 核心测试策略：
 * - store-level 断言：通过 page.evaluate 直接验证 Zustand store 状态
 * - 反应式验证：验证 UI 响应式地跟随 activeSkillIds 变化
 * - 全链路验证：按钮点击 → store 操作记录 → UI 状态更新
 *
 * 测试场景：
 *   场景 1: 渲染 — 技能广场弹窗显示内置技能列表
 *   场景 2: 安装触发 — 点击卡片"安装"按钮触发 store 操作
 *   场景 3: UI 反应式更新 — activeSkillIds 变更后按钮变为"已安装 ✓"
 *   场景 4: 详情面板安装 — 详情面板中的安装按钮同样生效
 *   场景 5: 卸载反应 — activeSkillIds 清空后按钮变回"安装"
 *   场景 6: 多技能状态 — 多个技能安装/卸载状态独立
 *
 * @version 2.0.0
 * @tags skills, skill-market, install, reactive
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('🧪 技能广场安装流程 (高保真)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);

    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('joyride_finished', 'true');
      window.localStorage.setItem('onboarding_completed', 'true');
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 打开技能广场
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore?.getState) {
        layoutStore.getState().setSkillMarketOpen(true);
      }
    });
    await page.waitForTimeout(1000);
  });

  // ──────────────────────────────────────────────
  // 场景 1: 渲染 — 技能广场弹窗显示内置技能列表
  // ──────────────────────────────────────────────
  test('场景1: 打开技能广场应显示内置技能列表', async ({ page }) => {
    const marketOpen = await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      return layoutStore?.getState()?.isSkillMarketOpen;
    });
    expect(marketOpen).toBe(true);

    const hasSkillMarketTitle = await page.evaluate(() => {
      return document.body.textContent?.includes('技能广场') ?? false;
    });
    expect(hasSkillMarketTitle).toBe(true);

    // 应显示内置技能（如代码审查专家 Pro）
    const hasBuiltinSkills = await page.evaluate(() => {
      return document.body.textContent?.includes('代码审查专家') ?? false;
    });
    expect(hasBuiltinSkills).toBe(true);

    // 初始状态：activeSkillIds 为空
    const initialActiveIds = await page.evaluate(() => {
      const store = (window as any).__skillStore;
      return store?.getState()?.activeSkillIds ?? [];
    });
    expect(initialActiveIds).toEqual([]);

    // 所有按钮初始显示"安装"而不是"已安装"
    const initialInstallBtns = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      return Array.from(buttons)
        .filter(b => b.textContent === '安装')
        .length;
    });
    expect(initialInstallBtns).toBeGreaterThan(0);

    const installedBtns = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      return Array.from(buttons)
        .filter(b => b.textContent === '已安装 ✓')
        .length;
    });
    expect(installedBtns).toBe(0);
  });

  // ──────────────────────────────────────────────
  // 场景 2: 安装触发 — 点击卡片"安装"按钮触发 store 操作
  // ──────────────────────────────────────────────
  test('场景2: 点击"安装"按钮应触发 store 操作记录', async ({ page }) => {
    const installBtn = page.locator('button', { hasText: '安装' }).first();
    await installBtn.waitFor({ state: 'visible', timeout: 5000 });
    await expect(installBtn).toBeVisible();

    // 获取点击前 store 操作数
    const beforeOps = await page.evaluate(() => {
      const store = (window as any).__skillStore;
      return store?.getState()?.operations?.length ?? 0;
    });

    // 点击安装按钮
    await installBtn.click();
    await page.waitForTimeout(500);

    // 验证 store 新增了操作记录 (onInstall 回调触发 installSkill)
    const state = await page.evaluate((before) => {
      const store = (window as any).__skillStore;
      const ops = store?.getState()?.operations ?? [];
      return {
        operationCount: ops.length,
        newOperationAdded: ops.length > before,
        operationSkillIds: ops.map((o: any) => o.skillId),
      };
    }, beforeOps);
    expect(state.newOperationAdded).toBe(true);

    // modal 仍保持打开
    const modalStillOpen = await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      return layoutStore?.getState()?.isSkillMarketOpen;
    });
    expect(modalStillOpen).toBe(true);
  });

  // ──────────────────────────────────────────────
  // 场景 3: UI 反应式更新 — activeSkillIds 变更后按钮变为"已安装 ✓"
  //
  // 核心验证：修复前 isInstalled 硬编码 false，即使 activeSkillIds 更新
  // UI 也不变。修复后 useMemo 依赖 activeSkillIds，store 更新后
  // 按钮应自动变为"已安装 ✓"。
  // ──────────────────────────────────────────────
  test('场景3: 设置 activeSkillIds 后按钮自动变为"已安装 ✓"', async ({ page }) => {
    // 验证初始状态：只显示"安装"按钮
    const initialBtns = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return {
        installCount: buttons.filter(b => b.textContent === '安装').length,
        installedCount: buttons.filter(b => b.textContent === '已安装 ✓').length,
      };
    });
    expect(initialBtns.installCount).toBeGreaterThan(0);
    expect(initialBtns.installedCount).toBe(0);

    // 直接设置 activeSkillIds (模拟安装完成)
    await page.evaluate(() => {
      const store = (window as any).__skillStore;
      store.setState({ activeSkillIds: ['code-review-pro'] });
    });
    await page.waitForTimeout(500);

    // 验证 UI 反应式更新：对应按钮变为"已安装 ✓"
    const afterInstallBtns = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return {
        installedCount: buttons.filter(b => b.textContent === '已安装 ✓').length,
        installCount: buttons.filter(b => b.textContent === '安装').length,
        // 确认有一个已安装的技能
        hasInstalled: buttons.some(b => b.textContent === '已安装 ✓'),
      };
    });
    expect(afterInstallBtns.hasInstalled).toBe(true);
    expect(afterInstallBtns.installedCount).toBeGreaterThan(0);

    // store 状态验证
    const storeState = await page.evaluate(() => {
      const store = (window as any).__skillStore;
      return store?.getState()?.activeSkillIds;
    });
    expect(storeState).toContain('code-review-pro');
  });

  // ──────────────────────────────────────────────
  // 场景 4: 详情面板安装 — 详情面板中的安装按钮同样生效
  // ──────────────────────────────────────────────
  test('场景4: 详情面板中的"安装"按钮也应触发 store 操作', async ({ page }) => {
    // 先点击卡片打开详情面板
    const firstCard = page.locator('[data-testid="skill-card"]').first();
    await firstCard.waitFor({ state: 'visible', timeout: 5000 });
    await firstCard.click();
    await page.waitForTimeout(500);

    // 验证详情面板已打开（"标签"区域仅详情面板渲染）
    const hasDetailPanel = await page.evaluate(() => {
      return document.body.textContent?.includes('标签') ?? false;
    });
    expect(hasDetailPanel).toBe(true);

    // 获取点击前 store 操作数
    const beforeOps = await page.evaluate(() => {
      const store = (window as any).__skillStore;
      return store?.getState()?.operations?.length ?? 0;
    });

    // 点击详情面板中的"安装"按钮
    const detailInstallBtn = page.locator('button', { hasText: '安装' }).last();
    await detailInstallBtn.click();
    await page.waitForTimeout(500);

    // 验证 store 新增了操作记录
    const state = await page.evaluate((before) => {
      const store = (window as any).__skillStore;
      const ops = store?.getState()?.operations ?? [];
      return {
        operationCount: ops.length,
        newOperationAdded: ops.length > before,
        operationSkillIds: ops.map((o: any) => o.skillId),
      };
    }, beforeOps);
    expect(state.newOperationAdded).toBe(true);

    // modal 仍保持打开
    const modalStillOpen = await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      return layoutStore?.getState()?.isSkillMarketOpen;
    });
    expect(modalStillOpen).toBe(true);
  });

  // ──────────────────────────────────────────────
  // 场景 5: 卸载反应 — activeSkillIds 清空后按钮变回"安装"
  //
  // 验证 UI 的双向反应式绑定：
  //   activeSkillIds 添加 → "已安装 ✓"
  //   activeSkillIds 移除 → "安装"
  // ──────────────────────────────────────────────
  test('场景5: 清空 activeSkillIds 后按钮应变回"安装"', async ({ page }) => {
    // 第一步：先安装一个技能 → 验证 UI 变为"已安装 ✓"
    await page.evaluate(() => {
      const store = (window as any).__skillStore;
      store.setState({ activeSkillIds: ['code-review-pro'] });
    });
    await page.waitForTimeout(500);

    const afterInstall = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return {
        hasInstalled: buttons.some(b => b.textContent === '已安装 ✓'),
        installCount: buttons.filter(b => b.textContent === '安装').length,
      };
    });
    expect(afterInstall.hasInstalled).toBe(true);

    // 第二步：清空 activeSkillIds (模拟卸载)
    await page.evaluate(() => {
      const store = (window as any).__skillStore;
      store.setState({ activeSkillIds: [] });
    });
    await page.waitForTimeout(500);

    // 验证 UI 反应式更新：按钮变回"安装"
    const afterUninstall = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return {
        hasInstalled: buttons.some(b => b.textContent === '已安装 ✓'),
        installCount: buttons.filter(b => b.textContent === '安装').length,
      };
    });
    expect(afterUninstall.hasInstalled).toBe(false);
    expect(afterUninstall.installCount).toBeGreaterThan(0);

    // store 状态验证
    const storeState = await page.evaluate(() => {
      const store = (window as any).__skillStore;
      return store?.getState()?.activeSkillIds;
    });
    expect(storeState).toEqual([]);
  });

  // ──────────────────────────────────────────────
  // 场景 6: 多技能状态 — 多个技能独立管理安装/卸载状态
  // ──────────────────────────────────────────────
  test('场景6: 多个技能安装/卸载状态应独立反应', async ({ page }) => {
    // 安装两个技能
    await page.evaluate(() => {
      const store = (window as any).__skillStore;
      store.setState({ activeSkillIds: ['code-review-pro', 'test-generator-ai'] });
    });
    await page.waitForTimeout(500);

    // 验证两个技能都显示"已安装 ✓"
    const afterTwoInstall = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const installedButtons = buttons.filter(b => b.textContent === '已安装 ✓');
      return installedButtons.length;
    });
    expect(afterTwoInstall).toBeGreaterThanOrEqual(2);

    // 卸载其中一个
    await page.evaluate(() => {
      const store = (window as any).__skillStore;
      store.setState({ activeSkillIds: ['code-review-pro'] });
    });
    await page.waitForTimeout(500);

    // 验证：还有一个 "已安装 ✓" + 其他技能恢复为 "安装"
    const afterPartialUninstall = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return {
        installedCount: buttons.filter(b => b.textContent === '已安装 ✓').length,
        installCount: buttons.filter(b => b.textContent === '安装').length,
      };
    });
    expect(afterPartialUninstall.installedCount).toBeGreaterThanOrEqual(1);
    expect(afterPartialUninstall.installCount).toBeGreaterThan(0);

    // store 状态验证
    const storeState = await page.evaluate(() => {
      const store = (window as any).__skillStore;
      return store?.getState()?.activeSkillIds;
    });
    expect(storeState).toEqual(['code-review-pro']);
    expect(storeState).not.toContain('test-generator-ai');
  });
});
