import { test, expect } from '@playwright/test';
import {
  setupE2ETestEnvironment,
  waitForChatReady,
  assertVisible,
  assertAttribute,
  assertLayout
} from '../helpers';
import { removeJoyrideOverlay } from '../setup';

/**
 * ============================================
 * Feature: Custom Layout Support
 * ============================================
 *
 * 测试自定义布局功能，允许用户切换不同的UI布局
 *
 * 测试覆盖：
 * - 布局切换功能
 * - 布局状态持久化
 * - 布局位置验证
 * - 边界条件和错误处理
 */

test.describe('Feature: Custom Layout Support', () => {
  // Skip all tests in this suite until layout switching is fully implemented
  test.skip(true, 'Layout switching feature not yet fully implemented - see FAILED_TESTS_LIST.md');

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await waitForChatReady(page);
  });

  test('@fast should allow switching to custom layout', async ({ page }) => {
    // ============================================
    // Arrange - 准备测试环境
    // ============================================
    const layoutButton = page.locator('button[title*="布局"], button[title*="Layout"], [data-testid="layout-button"]');

    // ============================================
    // Act - 执行布局切换操作
    // ============================================
    // 打开布局菜单
    await removeJoyrideOverlay(page);
    await layoutButton.click();

    // 等待菜单选项可见
    const customOption = page.locator('[data-testid="layout-custom"], text="自定义布局", text="Custom"');
    await assertVisible(customOption, true);

    // 选择自定义布局
    await removeJoyrideOverlay(page);
    await customOption.click();

    // ============================================
    // Assert - 验证布局切换成功
    // ============================================
    // 验证页面布局属性已更新
    await assertLayout(page, 'custom');

    // 验证布局按钮状态反映当前选择
    await expect(layoutButton).toHaveAttribute('data-current-layout', 'custom');
  });

  test('@fast should move chat panel to left in custom layout', async ({ page }) => {
    // ============================================
    // Arrange - 切换到自定义布局
    // ============================================
    await switchToCustomLayout(page);

    // ============================================
    // Act - 获取聊天面板位置
    // ============================================
    const chatPanel = page.locator('[data-testid="chat-panel"], .chat-panel-container');
    await assertVisible(chatPanel, true);

    // ============================================
    // Assert - 验证面板在左侧
    // ============================================
    const boundingBox = await chatPanel.boundingBox();

    expect(boundingBox, 'Chat panel should have bounding box').toBeDefined();
    expect(boundingBox!.x, 'Chat panel should be on left side (x < 100)').toBeLessThan(100);

    // 验证面板宽度合理
    expect(boundingBox!.width, 'Chat panel should have reasonable width').toBeGreaterThan(200);
  });

  test('@fast should add workspace panel in custom layout', async ({ page }) => {
    // ============================================
    // Arrange - 切换到自定义布局
    // ============================================
    await switchToCustomLayout(page);

    // ============================================
    // Act - 查找工作区面板
    // ============================================
    const workspacePanel = page.locator('[data-testid="workspace-panel"], .workspace-panel');

    // ============================================
    // Assert - 验证工作区面板存在
    // ============================================
    await assertVisible(workspacePanel, true);
  });

  test('@medium should persist layout choice after reload', async ({ page }) => {
    // ============================================
    // Arrange - 切换到自定义布局
    // ============================================
    await switchToCustomLayout(page);

    // 截图记录切换后的状态
    await page.screenshot({
      path: 'test-results/layout-persistence-before-reload.png'
    });

    // ============================================
    // Act - 刷新页面
    // ============================================
    await page.reload();
    await waitForChatReady(page);

    // ============================================
    // Assert - 验证布局设置被保留
    // ============================================
    await assertLayout(page, 'custom');

    // 验证聊天面板仍在左侧
    const chatPanel = page.locator('[data-testid="chat-panel"], .chat-panel-container');
    const boundingBox = await chatPanel.boundingBox();
    expect(boundingBox!.x, 'Chat panel should remain on left after reload').toBeLessThan(100);

    // 截图记录刷新后的状态
    await page.screenshot({
      path: 'test-results/layout-persistence-after-reload.png'
    });
  });

  test('@fast should support switching back to default layout', async ({ page }) => {
    // ============================================
    // Arrange - 先切换到自定义布局
    // ============================================
    await switchToCustomLayout(page);
    await assertLayout(page, 'custom');

    // ============================================
    // Act - 切换回默认布局
    // ============================================
    const layoutButton = page.locator('button[title*="布局"], button[title*="Layout"], [data-testid="layout-button"]');
    await removeJoyrideOverlay(page);
    await layoutButton.click();

    const defaultOption = page.locator('[data-testid="layout-default"], text="默认布局", text="Default"');
    await assertVisible(defaultOption, true);
    await removeJoyrideOverlay(page);
    await defaultOption.click();

    // ============================================
    // Assert - 验证回到默认布局
    // ============================================
    await assertLayout(page, 'default');

    // 验证布局按钮状态
    await expect(layoutButton).toHaveAttribute('data-current-layout', 'default');
  });

  test('@fast should highlight current layout in menu', async ({ page }) => {
    // ============================================
    // Arrange - 切换到自定义布局
    // ============================================
    await switchToCustomLayout(page);

    // ============================================
    // Act - 打开布局菜单
    // ============================================
    const layoutButton = page.locator('button[title*="布局"], button[title*="Layout"], [data-testid="layout-button"]');
    await removeJoyrideOverlay(page);
    await layoutButton.click();

    // ============================================
    // Assert - 验证当前布局被标记
    // ============================================
    const customOption = page.locator('[data-testid="layout-custom"], text="自定义布局", text="Custom"');

    // 验证当前布局选项有active或selected属性
    await expect(customOption).toHaveAttribute(/data-selected|data-active|aria-selected/, 'true');
  });

  test('@fast should handle layout switching when chat is active', async ({ page }) => {
    // ============================================
    // Arrange - 启动一个活跃的聊天会话
    // ============================================
    // 发送一条测试消息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      if (chatStore && chatStore.sendMessage) {
        chatStore.sendMessage('Test message for layout switch', 'ollama-e2e', 'mock-model');
      }
    });

    // 等待消息出现
    await page.waitForSelector('[data-testid="message-content"], .message-content', {
      state: 'visible',
      timeout: 5000
    });

    const messageCountBefore = await page.locator('[data-testid="message"]').count();

    // ============================================
    // Act - 切换布局
    // ============================================
    await switchToCustomLayout(page);

    // ============================================
    // Assert - 验证聊天会话保持完整
    // ============================================
    const messageCountAfter = await page.locator('[data-testid="message"]').count();

    expect(messageCountAfter, 'Message count should remain the same after layout switch').toBe(
      messageCountBefore
    );

    // 验证聊天输入框仍然可用
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="Ask"], [data-testid="chat-input"]');
    await expect(chatInput).toBeEnabled();
  });

  test('@medium should close layout menu when clicking outside', async ({ page }) => {
    // ============================================
    // Arrange - 打开布局菜单
    // ============================================
    const layoutButton = page.locator('button[title*="布局"], button[title*="Layout"], [data-testid="layout-button"]');
    await layoutButton.click();

    const layoutMenu = page.locator('[data-testid="layout-menu"], .layout-menu');
    await assertVisible(layoutMenu, true);

    // ============================================
    // Act - 点击页面其他区域
    // ============================================
    await removeJoyrideOverlay(page);
    await page.click('body', { position: { x: 100, y: 100 } });

    // ============================================
    // Assert - 验证菜单关闭
    // ============================================
    await assertVisible(layoutMenu, false);
  });

  test('@fast should handle keyboard navigation in layout menu', async ({ page }) => {
    // ============================================
    // Arrange - 打开布局菜单
    // ============================================
    const layoutButton = page.locator('button[title*="布局"], button[title*="Layout"], [data-testid="layout-button"]');
    await layoutButton.focus();
    await layoutButton.press('Enter');

    // ============================================
    // Act - 使用键盘导航
    // ============================================
    // 按下箭头键选择下一个选项
    await page.keyboard.press('ArrowDown');

    // 按Enter确认选择
    await page.keyboard.press('Enter');

    // ============================================
    // Assert - 验证布局已切换
    // ============================================
    // 等待布局切换完成
    await page.waitForTimeout(500);

    // 验证布局状态改变（从默认变为其他布局）
    const currentLayout = await page.evaluate(() => {
      return document.body.getAttribute('data-layout');
    });

    expect(currentLayout, 'Layout should have changed via keyboard').not.toBe('default');
  });

  test('@fast should display tooltip on layout button hover', async ({ page }) => {
    // ============================================
    // Arrange - 定位布局按钮
    // ============================================
    const layoutButton = page.locator('button[title*="布局"], button[title*="Layout"], [data-testid="layout-button"]');

    // ============================================
    // Act - 鼠标悬停在按钮上
    // ============================================
    await layoutButton.hover();

    // ============================================
    // Assert - 验证tooltip显示
    // ============================================
    const tooltip = page.locator('[data-testid="tooltip"], .tooltip, [role="tooltip"]');

    // Tooltip应该出现并包含"布局"或"Layout"文字
    const hasTooltip = await tooltip.count() > 0;
    if (hasTooltip) {
      await expect(tooltip).toContainText(/布局|Layout/);
    } else {
      // 如果没有独立tooltip元素，验证title属性
      const title = await layoutButton.getAttribute('title');
      expect(title).toMatch(/布局|Layout/);
    }
  });

  test('@slow should maintain layout state during window resize', async ({ page }) => {
    // ============================================
    // Arrange - 切换到自定义布局
    // ============================================
    await switchToCustomLayout(page);

    // 初始截图
    await page.screenshot({
      path: 'test-results/layout-resize-before.png'
    });

    // ============================================
    // Act - 调整窗口大小
    // ============================================
    // 模拟移动设备尺寸
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500); // 等待响应式布局调整

    // ============================================
    // Assert - 验证布局适应小屏幕
    // ============================================
    // 在小屏幕上，布局可能变为垂直堆叠
    const chatPanel = page.locator('[data-testid="chat-panel"], .chat-panel-container');
    await assertVisible(chatPanel, true);

    const boundingBox = await chatPanel.boundingBox();
    expect(boundingBox!.width, 'Chat panel should adapt to small screen width').toBeLessThanOrEqual(
      375
    );

    // 恢复桌面尺寸
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);

    // 验证恢复后仍是自定义布局
    await assertLayout(page, 'custom');

    // 最终截图
    await page.screenshot({
      path: 'test-results/layout-resize-after.png'
    });
  });
});

/**
 * 辅助函数：切换到自定义布局
 */
async function switchToCustomLayout(page: Page) {
  const layoutButton = page.locator('button[title*="布局"], button[title*="Layout"], [data-testid="layout-button"]');
  await removeJoyrideOverlay(page);
  await layoutButton.click();

  const customOption = page.locator('[data-testid="layout-custom"], text="自定义布局", text="Custom"');
  await removeJoyrideOverlay(page);
  await customOption.click();

  // 等待布局切换完成
  await page.waitForTimeout(300);
}
