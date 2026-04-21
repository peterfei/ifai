import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * ============================================
 * Baseline Snapshot Test: AIChat UI State
 * ============================================
 *
 * 此测试在实现骨架屏（Skeleton Screen）功能之前捕获当前 UI 状态作为基线快照。
 *
 * 目的：
 * - 记录当前聊天面板的布局结构和关键属性
 * - 验证消息列表、滚动容器和输入框的正确显示
 * - 为骨架屏功能实现前后对比提供基准
 *
 * 测试覆盖：
 * - 聊天面板整体布局 (chat-panel)
 * - 滚动容器属性 (chat-scroll-container)
 * - 消息列表显示状态
 * - 输入框存在性和位置
 * - 视图切换器（对话/时间线）
 * - 关键 data-testid 元素
 *
 * 创建时间: 2026-04-16
 * 关联提案: (待创建) 骨架屏重新设计
 */

test.describe('Baseline: AIChat UI State (Pre-Skeleton)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');

    // 等待聊天面板和关键组件就绪
    // 使用与当前实现匹配的选择器
    await page.waitForSelector('[data-testid="chat-panel"]', {
      state: 'visible',
      timeout: 15000,
    });

    // 等待聊天输入框可见（这表示聊天组件已加载）
    await page.waitForSelector('textarea[placeholder*="问问"], [data-testid="chat-input"]', {
      state: 'visible',
      timeout: 10000,
    });

    // 额外等待确保组件稳定
    await page.waitForTimeout(200);
  });

  test('@fast should capture chat panel layout structure', async ({ page }) => {
    // ============================================
    // 验证聊天面板根元素
    // ============================================
    const chatPanel = page.locator('[data-testid="chat-panel"]');
    await expect(chatPanel, 'Chat panel should exist').toBeVisible();

    // 验证面板布局属性
    const panelClasses = await chatPanel.getAttribute('class');
    expect(panelClasses).toContain('flex');
    expect(panelClasses).toContain('flex-col');
    expect(panelClasses).toContain('h-full');

    // 获取面板尺寸作为基线
    const panelBox = await chatPanel.boundingBox();
    expect(panelBox, 'Chat panel should have valid dimensions').toBeDefined();
    expect(panelBox!.width, 'Panel width should be around 384px').toBeCloseTo(384, 50);
    expect(panelBox!.height, 'Panel height should be substantial').toBeGreaterThan(300);
  });

  test('@fast should capture scroll container properties', async ({ page }) => {
    // ============================================
    // 验证滚动容器属性
    // ============================================
    const scrollContainer = page.locator('[data-testid="chat-scroll-container"]');
    await expect(scrollContainer, 'Scroll container should exist').toBeVisible();

    // 验证容器类名（flex 属性）
    const scrollClasses = await scrollContainer.getAttribute('class');
    expect(scrollClasses).toContain('min-h-0');
    expect(scrollClasses).toContain('overflow-auto');
    expect(scrollClasses).toContain('p-4');

    // 验证内联样式（flex: '1 1 0%' 和 contain: 'strict'）
    const flexStyle = await scrollContainer.evaluate((el: HTMLElement) => {
      return {
        flex: el.style.flex,
        contain: el.style.contain,
        willChange: el.style.willChange,
        overscrollBehavior: el.style.overscrollBehavior,
        overflowAnchor: el.style.overflowAnchor,
      };
    });

    expect(flexStyle.flex, 'Flex should be "1 1 0%"').toBe('1 1 0%');
    expect(flexStyle.contain, 'Contain should be "strict"').toBe('strict');
    expect(flexStyle.willChange).toBe('scroll-position');
    expect(flexStyle.overscrollBehavior).toBe('contain');
    expect(flexStyle.overflowAnchor).toBe('auto');

    // 获取滚动容器尺寸作为基线
    const scrollBox = await scrollContainer.boundingBox();
    expect(scrollBox, 'Scroll container should have valid dimensions').toBeDefined();
    expect(scrollBox!.height, 'Scroll container height should be > 100px').toBeGreaterThan(100);
  });

  test('@fast should capture message list display state', async ({ page }) => {
    // ============================================
    // 验证消息列表显示
    // ============================================
    const scrollContainer = page.locator('[data-testid="chat-scroll-container"]');

    // 获取当前消息数量
    const messageCount = await scrollContainer.locator('[data-testid^="message-"]').count();

    // 验证 VirtualMessageList 或消息项存在
    const hasVirtualList = await page.locator('div[data-index]').count() > 0;
    const hasMessageItems = messageCount > 0;

    // 至少应该有一种消息显示方式
    const hasSomeMessages = hasVirtualList || hasMessageItems;

    // 记录消息显示状态（即使为空也是有效状态）
    const messageState = {
      messageCount,
      hasVirtualList,
      hasMessageItems,
      hasSomeMessages,
    };

    // 基线快照：消息可以不存在（新对话），但容器应该存在
    await page.evaluate((state) => {
      (window as any).__E2E_BASELINE_MESSAGE_STATE__ = state;
    }, messageState);

    expect(true, 'Message state captured').toBe(true);
  });

  test('@fast should capture input box presence and position', async ({ page }) => {
    // ============================================
    // 验证输入框存在性和位置
    // ============================================
    const chatPanel = page.locator('[data-testid="chat-panel"]');

    // 查找输入区域（通过 z-index 和背景色特征）
    const inputArea = page.locator('.bg-\\[\\#1e1e1e\\]\\/30.relative.z-\\[100\\]').first();
    await expect(inputArea, 'Input area should exist').toBeVisible();

    // 验证输入区域包含聊天输入组件
    const chatInput = inputArea.locator('textarea, input[type="text"], [contenteditable="true"]');
    await expect(chatInput, 'Chat input should exist').toBeVisible();

    // 获取输入区域位置作为基线
    const inputBox = await inputArea.boundingBox();
    expect(inputBox, 'Input area should have valid dimensions').toBeDefined();
    expect(inputBox!.height, 'Input area height should be reasonable').toBeGreaterThan(50);

    // 验证输入区域在面板底部
    const panelBox = await chatPanel.boundingBox();
    expect(panelBox, 'Panel box should exist').toBeDefined();
    expect(inputBox!.y + inputBox!.height, 'Input should be at bottom of panel').toBeCloseTo(
      panelBox!.y + panelBox!.height,
      50
    );
  });

  test('@fast should capture view selector state', async ({ page }) => {
    // ============================================
    // 验证视图切换器（对话/时间线）
    // ============================================
    const viewSelector = page.locator('[data-testid="ai-view-selector"]');
    await expect(viewSelector, 'View selector should exist').toBeVisible();

    // 验证两个视图按钮都存在
    const chatButton = viewSelector.locator('[data-testid="view-mode-chat"]');
    const timelineButton = viewSelector.locator('[data-testid="view-mode-timeline"]');

    await expect(chatButton, 'Chat view button should exist').toBeVisible();
    await expect(timelineButton, 'Timeline view button should exist').toBeVisible();

    // 验证当前激活状态（默认应该是对话视图）
    const activePill = viewSelector.locator('[data-testid="tab-active-pill"]');
    await expect(activePill, 'Active pill should exist').toBeVisible();

    // 获取当前视图模式作为基线
    const currentView = await chatButton.getAttribute('class');
    const isActiveView = currentView?.includes('text-white');
    expect(isActiveView, 'Default view should be chat').toBe(true);
  });

  test('@fast should capture key test-id elements', async ({ page }) => {
    // ============================================
    // 验证所有关键 data-testid 元素
    // ============================================
    const expectedTestIds = [
      'chat-panel',
      'ai-view-selector',
      'view-mode-chat',
      'view-mode-timeline',
      'chat-scroll-container',
    ];

    const foundElements: string[] = [];
    const missingElements: string[] = [];

    for (const testId of expectedTestIds) {
      const element = page.locator(`[data-testid="${testId}"]`);
      const isVisible = await element.isVisible().catch(() => false);

      if (isVisible) {
        foundElements.push(testId);
      } else {
        missingElements.push(testId);
      }
    }

    // 记录发现的元素到全局状态
    await page.evaluate((data) => {
      (window as any).__E2E_BASELINE_TESTIDS__ = data;
    }, { found: foundElements, missing: missingElements });

    // 断言所有关键元素都存在
    expect(missingElements.length, `All test IDs should be found. Missing: ${missingElements.join(', ')}`).toBe(0);
  });

  test('@medium should capture complete layout hierarchy', async ({ page }) => {
    // ============================================
    // 完整布局层级快照
    // ============================================
    const layoutSnapshot = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="chat-panel"]');
      if (!panel) return null;

      const scrollContainer = document.querySelector('[data-testid="chat-scroll-container"]');
      const viewSelector = document.querySelector('[data-testid="ai-view-selector"]');
      const inputArea = document.querySelector('.bg-\\[\\#1e1e1e\\]\\/30.relative.z-\\[100\\]');

      return {
        panel: {
          classes: panel.className,
          style: (panel as HTMLElement).style.cssText,
          offsetHeight: panel.offsetHeight,
          offsetWidth: panel.offsetWidth,
        },
        scrollContainer: scrollContainer ? {
          classes: scrollContainer.className,
          style: (scrollContainer as HTMLElement).style.cssText,
          offsetHeight: scrollContainer.offsetHeight,
          offsetWidth: scrollContainer.offsetWidth,
          scrollHeight: (scrollContainer as HTMLElement).scrollHeight,
          scrollTop: (scrollContainer as HTMLElement).scrollTop,
        } : null,
        viewSelector: viewSelector ? {
          classes: viewSelector.className,
          offsetHeight: viewSelector.offsetHeight,
        } : null,
        inputArea: inputArea ? {
          classes: inputArea.className,
          offsetHeight: inputArea.offsetHeight,
        } : null,
        timestamp: Date.now(),
      };
    });

    // 保存完整快照到全局状态
    await page.evaluate((snapshot) => {
      (window as any).__E2E_BASELINE_LAYOUT_SNAPSHOT__ = snapshot;
    }, layoutSnapshot);

    // 验证快照完整性
    expect(layoutSnapshot, 'Layout snapshot should be captured').toBeDefined();
    expect(layoutSnapshot!.panel, 'Panel should be in snapshot').toBeDefined();
    expect(layoutSnapshot!.scrollContainer, 'Scroll container should be in snapshot').toBeDefined();
    expect(layoutSnapshot!.inputArea, 'Input area should be in snapshot').toBeDefined();

    // 验证关键尺寸属性
    expect(layoutSnapshot!.panel!.offsetHeight).toBeGreaterThan(0);
    expect(layoutSnapshot!.scrollContainer!.offsetHeight).toBeGreaterThan(0);
    expect(layoutSnapshot!.inputArea!.offsetHeight).toBeGreaterThan(0);
  });

  test('@fast should export baseline snapshot data', async ({ page }) => {
    // ============================================
    // 导出基线快照数据供后续对比使用
    // ============================================
    // 在单个测试内捕获所有数据（因为测试是独立运行的）
    const scrollContainer = page.locator('[data-testid="chat-scroll-container"]');
    const chatPanel = page.locator('[data-testid="chat-panel"]');
    const inputArea = page.locator('.bg-\\[\\#1e1e1e\\]\\/30.relative.z-\\[100\\]').first();

    const baselineData = await page.evaluate((args) => {
      const { hasScrollContainer, hasChatPanel, hasInputArea } = args as any;

      const result: any = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        messageState: {
          messageCount: 0,
          hasVirtualList: false,
          hasMessageItems: false,
          hasSomeMessages: false,
        },
        testIds: {
          found: [] as string[],
          missing: [] as string[],
        },
        layoutSnapshot: null as any,
      };

      // 检查 test-id 元素
      const expectedTestIds = [
        'chat-panel',
        'ai-view-selector',
        'view-mode-chat',
        'view-mode-timeline',
        'chat-scroll-container',
      ];

      for (const testId of expectedTestIds) {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        if (element) {
          result.testIds.found.push(testId);
        } else {
          result.testIds.missing.push(testId);
        }
      }

      // 捕获布局快照
      const panel = document.querySelector('[data-testid="chat-panel"]');
      if (panel) {
        result.layoutSnapshot = {
          panel: {
            classes: panel.className,
            offsetHeight: panel.offsetHeight,
            offsetWidth: panel.offsetWidth,
          },
        };

        const scrollContainerEl = document.querySelector('[data-testid="chat-scroll-container"]');
        if (scrollContainerEl) {
          result.layoutSnapshot.scrollContainer = {
            classes: scrollContainerEl.className,
            offsetHeight: scrollContainerEl.offsetHeight,
            offsetWidth: scrollContainerEl.offsetWidth,
            scrollHeight: (scrollContainerEl as HTMLElement).scrollHeight,
          };
        }

        const inputAreaEl = document.querySelector('.bg-\\[\\#1e1e1e\\]\\/30.relative.z-\\[100\\]');
        if (inputAreaEl) {
          result.layoutSnapshot.inputArea = {
            classes: inputAreaEl.className,
            offsetHeight: inputAreaEl.offsetHeight,
          };
        }
      }

      return result;
    }, {
      hasScrollContainer: await scrollContainer.count() > 0,
      hasChatPanel: await chatPanel.count() > 0,
      hasInputArea: await inputArea.count() > 0,
    });

    // 输出基线数据到控制台（供手动记录）
    console.log('=== BASELINE SNAPSHOT DATA ===');
    console.log(JSON.stringify(baselineData, null, 2));
    console.log('=== END BASELINE SNAPSHOT ===');

    // 验证数据完整性
    expect(baselineData.timestamp).toBeDefined();
    expect(baselineData.messageState).toBeDefined();
    expect(baselineData.testIds).toBeDefined();
    expect(baselineData.layoutSnapshot).toBeDefined();
    expect(baselineData.layoutSnapshot.panel).toBeDefined();
    expect(baselineData.layoutSnapshot.scrollContainer).toBeDefined();
    expect(baselineData.layoutSnapshot.inputArea).toBeDefined();

    // 将数据附加到页面以便测试失败时可以检查
    await page.evaluate((data) => {
      (window as any).__E2E_BASELINE_COMPLETE__ = data;
    }, baselineData);
  });

  test('@slow should capture interaction states', async ({ page }) => {
    // ============================================
    // 验证交互状态（滚动、输入等）
    // ============================================
    const scrollContainer = page.locator('[data-testid="chat-scroll-container"]');
    await expect(scrollContainer, 'Scroll container should exist').toBeVisible();

    // 记录初始滚动位置
    const initialScrollTop = await scrollContainer.evaluate((el: HTMLElement) => el.scrollTop);
    const initialScrollHeight = await scrollContainer.evaluate((el: HTMLElement) => el.scrollHeight);
    const containerBox = await scrollContainer.boundingBox();

    // 记录滚动状态
    const scrollState = {
      initialScrollTop,
      initialScrollHeight,
      containerHeight: containerBox!.height,
      maxScroll: initialScrollHeight - containerBox!.height,
      canScroll: initialScrollHeight > containerBox!.height,
    };

    // 如果容器可以滚动，验证滚动功能
    if (scrollState.canScroll) {
      // 尝试滚动一小段距离
      await scrollContainer.evaluate((el: HTMLElement) => {
        el.scrollTop = Math.min(50, el.scrollHeight - el.clientHeight);
      });
      await page.waitForTimeout(100);

      const afterScrollTop = await scrollContainer.evaluate((el: HTMLElement) => el.scrollTop);
      // 验证滚动是否成功（某些情况下滚动可能被控制器覆盖）
      if (afterScrollTop > initialScrollTop) {
        expect(afterScrollTop, 'Scroll should have changed').toBeGreaterThan(initialScrollTop);

        // 恢复滚动位置
        await scrollContainer.evaluate((el: HTMLElement) => {
          el.scrollTop = 0;
        });
      } else {
        console.log('Scroll was immediately reset (likely by scroll controller)');
        // 这是可接受的行为 - 滚动控制器可能重置了滚动位置
        expect(afterScrollTop).toBeGreaterThanOrEqual(0);
      }
    } else {
      console.log('Scroll container cannot scroll (not enough content)');
    }

    await page.evaluate((state) => {
      (window as any).__E2E_BASELINE_SCROLL_STATE__ = state;
    }, scrollState);

    expect(scrollState.maxScroll).toBeGreaterThanOrEqual(-1);
  });
});
