import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

/**
 * UI Optimization Regression Test Suite (High Fidelity)
 * 
 * 专门用于验证 Phase 1-4 的重构成果，确保工业级细节不丢失。
 * 遵循准则：物理清理、Store 优先、零随机性。
 */
test.describe('UI Optimization & Industrial Refinement Regression @regression', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);

    // 监听错误和日志
    page.on('pageerror', error => {
      console.log(`[Browser Error] ${error.message}`);
    });
    
    // 1. 初始化环境 (Mock AI 以保证 UI 测试速度)
    await setupE2ETestEnvironment(page, { useRealAI: false });
    
    // 2. 🏆 基线：物理清理与状态对齐
    await page.addInitScript(() => {
      window.localStorage.setItem('joyride_finished', 'true');
      window.localStorage.setItem('onboarding_completed', 'true');
      window.localStorage.setItem('ifai_onboarding_state', JSON.stringify({
        completed: true, skipped: true, remindCount: 0, lastRemindDate: null
      }));
      // 锁定布局 Store 的初始状态
      const layout = { state: { sidebarWidth: 384, sidebarActiveTab: 'explorer' }, version: 1 };
      window.localStorage.setItem('layout-storage', JSON.stringify(layout));
    });

    await page.goto('/');
    
    // 3. 🏆 基线：等待 Store Ready 并注入必要状态
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 30000 });
    
    // 🔥 等待 UI 挂载
    await page.waitForSelector('[data-testid="chat-panel"]', { timeout: 10000 });

    await page.evaluate(() => {
      // 注入 Mock Provider 确保 Header 渲染控制流
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.setState({
          currentProviderId: 'mock-provider',
          currentModel: 'gpt-4',
          providers: [{
            id: 'mock-provider',
            name: 'Mock AI',
            enabled: true,
            apiKey: 'sk-123',
            baseUrl: 'http://localhost:11434',
            models: ['gpt-4']
          }]
        });
      }
      // 强制 AI 侧边栏可见
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isAIChatOpen: true, rightSidebarWidth: 384 });
      }

      // 预先打开两个文件用于 Tab 测试
      const fileStore = (window as any).__fileStore;
      if (fileStore) {
        fileStore.getState().openFile({ id: 'file1', name: 'README.md', path: '/README.md', content: '# Hi', isDirty: false });
        fileStore.getState().openFile({ id: 'file2', name: 'main.tsx', path: '/main.tsx', content: 'console.log(1)', isDirty: false });
        fileStore.getState().setActiveFile('file1');
      }
    });

    // 4. 🏆 基线：物理清理 UI 干扰层 (Joyride 永久清理)
    await page.evaluate(() => {
      const cleanup = () => {
        document.querySelectorAll('.react-joyride__overlay, .react-joyride__spotlight, #react-joyride-portal, .joyride-overlay').forEach(el => el.remove());
      };
      cleanup();
      const observer = new MutationObserver(cleanup);
      observer.observe(document.body, { childList: true, subtree: true });
    });
  });

  /**
   * [验证点] 左侧活动栏 (Activity Bar) 胶囊化结构
   */
  test('Activity Bar should maintain floating capsule structure', async ({ page }) => {
    const activityBar = page.locator('[data-testid="activity-bar-capsule"]');
    await activityBar.waitFor({ state: 'visible', timeout: 10000 });
    const box = await activityBar.boundingBox();
    
    // 断言：x 应约为 8px，表明它是悬浮的，而非紧贴左边缘（允许 CSS 布局偏差）
    expect(box?.x).toBeLessThan(16);
    // 断言：宽度应约为 48px (左右 padding 抵消后的宽度)
    expect(box?.width).toBeGreaterThan(30);
    
    // 2. 验证材质系统 (毛玻璃)
    const blur = await activityBar.evaluate(el => window.getComputedStyle(el).backdropFilter);
    expect(blur).toContain('blur');

    // 3. 验证选中态物理包裹
    const activePill = activityBar.locator('[data-testid="activity-active-pill"]');
    await expect(activePill).toBeVisible();
  });

  /**
   * [验证点] AI 侧边栏 Header 二次瘦身 (Interaction Descent)
   */
  test('AI Chat Header should be ultra-compact (under 40px)', async ({ page }) => {
    const header = page.locator('[data-testid="ai-chat-header"]');
    
    // 断言：总高度应压缩至 40px 以内 (仅保留品牌行)
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    expect(box?.height).toBeLessThanOrEqual(40);
    
    // 验证原有的控制胶囊行已消失
    const oldCapsule = page.locator('[data-testid="ai-control-capsule"]');
    await expect(oldCapsule).not.toBeVisible();
  });

  /**
   * [验证点] 底部输入框模型切换入口
   */
  test('Chat input area should feature a model selector capsule', async ({ page }) => {
    const bottomSelector = page.locator('[data-testid="ai-model-selector-bottom"]');
    
    // 1. 验证底部入口可见性与微型胶囊形态
    await expect(bottomSelector).toBeVisible();
    const borderRadius = await bottomSelector.evaluate(el => window.getComputedStyle(el).borderRadius);
    expect(parseInt(borderRadius)).toBeGreaterThan(10);

    // 2. 模拟点击唤起面板 (应在输入框上方滑出)
    await bottomSelector.click();
    const modelPanel = page.locator('[data-testid="model-capsule-panel"]');
    await expect(modelPanel).toBeVisible();
  });

  /**
   * [验证点] 按需搜索 (On-demand Search) 的 Slide-down 逻辑
   */
  test('Search panel should slide-down via toggle button', async ({ page }) => {
    const header = page.locator('[data-testid="ai-chat-header"]');
    const searchBtn = header.locator('[data-testid="ai-search-toggle"]');
    const searchPanel = page.locator('[data-testid="ai-search-panel"]');

    // 1. 点击切换按钮
    await searchBtn.click();
    
    // 2. 验证面板滑入并稳定 (使用 waitForFunction 消除动画竞态)
    await page.waitForFunction((panelSelector) => {
        const el = document.querySelector(panelSelector) as HTMLElement;
        if (!el) return false;
        const height = el.getBoundingClientRect().height;
        return height > 30; // 等待高度展开
    }, '[data-testid="ai-search-panel"]', { timeout: 5000 });

    const headerBox = await header.boundingBox();
    const box = await searchPanel.boundingBox();
    
    expect(box?.height).toBeGreaterThan(30);
    // 动态断言：搜索面板的 y 坐标应等于 Header 的 y + height (即便 Header 瘦身了也适用)
    if (headerBox && box) {
        expect(box.y).toBeCloseTo(headerBox.y + headerBox.height, 0);
    }

    // 3. 再次点击隐藏
    await searchBtn.click();
    await expect(searchPanel).not.toBeVisible();
  });

  /**
   * [验证点] 选中态物理包裹 (Active Pill Motion)
   */
  test('Tab active indicator should move physically', async ({ page }) => {
    const viewSelector = page.locator('[data-testid="ai-view-selector"]');
    const chatBtn = viewSelector.locator('[data-testid="view-mode-chat"]');
    const timelineBtn = viewSelector.locator('[data-testid="view-mode-timeline"]');
    
    // 1. 获取初始位置 (对话)
    await chatBtn.click();
    const pill = viewSelector.locator('[data-testid="tab-active-pill"]');
    await expect(pill).toBeVisible();
    const box1 = await pill.boundingBox();
    
    // 2. 切换到时间线
    await timelineBtn.click();
    
    // 3. 验证位置已发生物理偏移
    await page.waitForFunction((initialX) => {
        const el = document.querySelector('[data-testid="ai-view-selector"] [data-testid="tab-active-pill"]') as HTMLElement;
        if (!el) return false;
        return Math.abs(el.getBoundingClientRect().x - initialX) > 10;
    }, box1?.x || 0, { timeout: 5000 });

    const box2 = await pill.boundingBox();
    expect(box2?.x).not.toBeCloseTo(box1?.x || 0, 1);
  });

  /**
   * [验证点] 响应式边界自适应 (Responsive Boundary)
   */
  test('Layout should adapt to small viewports without breaking capsules', async ({ page }) => {
    // 切换到较窄的视口 (例如 1024px)
    await page.setViewportSize({ width: 1024, height: 768 });
    
    const activityBar = page.locator('[data-testid="activity-bar-capsule"]');
    const aiHeader = page.locator('[data-testid="ai-chat-header"]');
    
    // 验证活动栏依然可见且保持悬浮间距
    await expect(activityBar).toBeVisible();
    const box = await activityBar.boundingBox();
    expect(box?.x).toBeLessThan(16);
    
    await expect(aiHeader).toBeVisible();
  });

  /**
   * [验证点] 编辑区 TabBar 胶囊化与选中态动效
   */
  test('TabBar should feature capsule tabs with physical motion', async ({ page }) => {
    const tabContainer = page.locator('[data-testid="tab-bar-container"]');
    await expect(tabContainer).toBeVisible();

    // 1. 验证 Tab 胶囊化物理特征
    const firstTab = tabContainer.locator('[data-testid="editor-tab"]').first();
    await expect(firstTab).toBeVisible();
    const borderRadius = await firstTab.evaluate(el => window.getComputedStyle(el).borderRadius);
    // 工业级标准：全圆角胶囊
    expect(parseInt(borderRadius)).toBeGreaterThan(10);

    // 2. 验证选中态物理指示器 (Active Pill)
    const activePill = tabContainer.locator('[data-testid="tab-active-pill"]');
    await expect(activePill).toBeVisible();
    const box1 = await activePill.boundingBox();

    // 3. 模拟切换标签动作
    const tabs = tabContainer.locator('[data-testid="editor-tab"]');
    const count = await tabs.count();
    if (count > 1) {
        await tabs.nth(1).click();
        
        // 4. 验证位移动画 (物理竞态消除)
        await page.waitForFunction((initialX) => {
            const el = document.querySelector('[data-testid="tab-active-pill"]') as HTMLElement;
            if (!el) return false;
            return Math.abs(el.getBoundingClientRect().x - initialX) > 20;
        }, box1?.x || 0, { timeout: 5000 });

        const box2 = await activePill.boundingBox();
        expect(box2?.x).not.toBeCloseTo(box1?.x || 0, 1);
    }
  });
});
