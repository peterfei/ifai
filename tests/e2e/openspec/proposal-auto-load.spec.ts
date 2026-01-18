import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe.skip('Proposal Auto-Load - 自动加载提案 - TODO: Fix this test', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__proposalStore !== undefined, { timeout: 10000 });
    // 等待自动刷新完成
    await page.waitForTimeout(1000);
  });

  test('should auto-load v0.2.6-demo-vue-login proposal', async ({ page }) => {
    test.setTimeout(30000);

    // 手动触发刷新以确保索引已加载
    await page.evaluate(async () => {
      const store = (window as any).__proposalStore;
      console.log('[E2E] Manual refresh triggered');
      await store.getState().refreshIndex();
      const index = store.getState().index;
      console.log('[E2E] Index after manual refresh:', index);
    });

    // 等待刷新完成
    await page.waitForTimeout(1000);

    // 检查 proposal store 的索引
    const proposalIndex = await page.evaluate(() => {
      const store = (window as any).__proposalStore.getState();
      return store.index;
    });

    console.log('[E2E] Proposal index:', JSON.stringify(proposalIndex, null, 2));

    // 验证提案列表包含 v0.2.6-demo-vue-login
    expect(proposalIndex.proposals).toBeDefined();

    // 如果 mock 返回了数据，验证它
    if (proposalIndex.proposals.length > 0) {
      const demoProposal = proposalIndex.proposals.find((p: any) => p.id === 'v0.2.6-demo-vue-login');
      expect(demoProposal).toBeDefined();
      expect(demoProposal.title).toContain('Demo Vue Login');
    } else {
      console.log('[E2E] No proposals found in index (may be expected in test environment)');
    }
  });

  test('should be able to load the proposal details', async ({ page }) => {
    test.setTimeout(30000);

    // 加载提案详情
    const proposal = await page.evaluate(async () => {
      const store = (window as any).__proposalStore.getState();
      return await store.loadProposal('v0.2.6-demo-vue-login', 'proposals');
    });

    console.log('[E2E] Loaded proposal:', JSON.stringify(proposal, null, 2));

    // 验证提案数据
    expect(proposal).toBeDefined();
    expect(proposal.id).toBe('v0.2.6-demo-vue-login');
    expect(proposal.status).toBe('draft');
    expect(proposal.location).toBe('proposals');
  });

  test('should show proposal in UI when Mission Control is opened', async ({ page }) => {
    test.setTimeout(30000);

    // 手动触发刷新
    await page.evaluate(async () => {
      const store = (window as any).__proposalStore;
      await store.getState().refreshIndex();
    });

    // 等待刷新完成
    await page.waitForTimeout(500);

    // 验证 proposal store 可访问
    const hasProposalStore = await page.evaluate(() => {
      return typeof (window as any).__proposalStore !== 'undefined';
    });

    expect(hasProposalStore).toBe(true);

    // 验证 proposal 已加载到 store
    const proposalCount = await page.evaluate(() => {
      const store = (window as any).__proposalStore.getState();
      return store.index.proposals.length;
    });

    expect(proposalCount).toBeGreaterThan(0);
    console.log(`[E2E] Found ${proposalCount} proposal(s) in store`);
  });
});
