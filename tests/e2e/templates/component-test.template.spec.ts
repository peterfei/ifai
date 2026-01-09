import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../helpers';

/**
 * ============================================
 * E2E测试模板 - 组件测试
 * ============================================
 *
 * 用于测试单个UI组件的行为
 * 重点关注：渲染、交互、状态变化
 */

test.describe('Component: [组件名称]', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
  });

  test('should render correctly', async ({ page }) => {
    // 验证组件正确渲染
    const component = page.locator('[data-testid="[component-name]"]');

    await expect(component).toBeVisible();
    await expect(component).toHaveCount(1);
  });

  test('should display initial state', async ({ page }) => {
    // 验证组件的初始状态
    const component = page.locator('[data-testid="[component-name]"]');

    await expect(component).toHaveText('初始文本');
    await expect(component).toHaveAttribute('data-state', 'idle');
  });

  test('should respond to user interaction', async ({ page }) => {
    // 测试用户交互
    const component = page.locator('[data-testid="[component-name]"]');
    const button = component.locator('button');

    await button.click();

    // 验证交互结果
    await expect(component).toHaveAttribute('data-state', 'active');
  });

  test('should handle disabled state', async ({ page }) => {
    // 测试禁用状态
    const component = page.locator('[data-testid="[component-name]"]');

    // 设置为禁用
    await component.evaluate((el: any) => el.setAttribute('disabled', 'true'));

    // 验证禁用行为
    await expect(component).toBeDisabled();
    await component.click(); // 点击不应生效
    await expect(component).toHaveAttribute('data-state', 'idle');
  });

  test('should handle loading state', async ({ page }) => {
    // 测试加载状态
    const component = page.locator('[data-testid="[component-name]"]');

    // 触发加载状态
    await component.evaluate((el: any) => {
      el.setAttribute('data-loading', 'true');
    });

    // 验证加载指示器
    const spinner = component.locator('[data-testid="spinner"]');
    await expect(spinner).toBeVisible();
  });

  test('should handle error state', async ({ page }) => {
    // 测试错误状态
    const component = page.locator('[data-testid="[component-name]"]');

    // 模拟错误
    await component.evaluate((el: any) => {
      el.setAttribute('data-error', 'true');
    });

    // 验证错误显示
    const errorMessage = component.locator('[data-testid="error-message"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText(/error/i);
  });

  test('should update when props change', async ({ page }) => {
    // 测试props变化时的更新
    const component = page.locator('[data-testid="[component-name]"]');

    // 模拟props更新
    await component.evaluate((el: any) => {
      el.setAttribute('data-value', 'new-value');
    });

    // 验证更新
    await expect(component).toHaveAttribute('data-value', 'new-value');
  });

  test('should be accessible', async ({ page }) => {
    // 测试可访问性
    const component = page.locator('[data-testid="[component-name]"]');

    // 验证ARIA属性
    await expect(component).toHaveAttribute('role');
    await expect(component).toHaveAttribute('aria-label');

    // 验证键盘导航
    await component.focus();
    await expect(component).toBeFocused();

    // 测试键盘操作
    await page.keyboard.press('Enter');
    // 验证Enter键的预期行为
  });

  test('should have correct visual appearance', async ({ page }) => {
    // 测试视觉效果
    const component = page.locator('[data-testid="[component-name]"]');

    // 验证CSS类
    await expect(component).toHaveClass(/component-name/);

    // 验证样式（如果需要）
    const box = await component.boundingBox();
    expect(box).toBeDefined();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('should handle multiple rapid interactions', async ({ page }) => {
    // 测试快速连续交互
    const component = page.locator('[data-testid="[component-name]"]');
    const button = component.locator('button');

    // 快速点击多次
    for (let i = 0; i < 5; i++) {
      await button.click();
    }

    // 验证最终状态（应该是最后点击的结果，而不是5个操作）
    await expect(component).toHaveAttribute('data-click-count', '1');
  });
});

/**
 * 组件测试检查清单：
 *
 * 渲染
 * ✅ 组件正确显示
 * ✅ 初始状态正确
 * ✅ 子组件正确渲染
 *
 * 交互
 * ✅ 点击响应
 * ✅ 输入响应
 * ✅ 拖拽响应
 * ✅ 手势响应
 *
 * 状态
 * ✅ 正常状态
 * ✅ 禁用状态
 * ✅ 加载状态
 * ✅ 错误状态
 * ✅ 成功状态
 *
 * 可访问性
 * ✅ ARIA属性
 * ✅ 键盘导航
 * ✅ 屏幕阅读器支持
 * ✅ 焦点管理
 *
 * 边界情况
 * ✅ 空数据
 * ✅ 超长内容
 * ✅ 特殊字符
 * ✅ 极限值
 * ✅ 快速连续操作
 */
