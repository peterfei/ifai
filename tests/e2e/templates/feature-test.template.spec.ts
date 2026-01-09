import { test, expect } from '@playwright/test';
import {
  setupE2ETestEnvironment,
  waitForChatReady,
  assertMessageContent
} from '../helpers';

/**
 * ============================================
 * E2E测试模板 - 功能测试
 * ============================================
 *
 * 使用说明：
 * 1. 复制此模板到新位置
 * 2. 替换 [功能名称] 为实际功能名
 * 3. 根据 TDD 流程编写测试：
 *    - Red: 先写测试，运行失败
 *    - Green: 实现功能，测试通过
 *    - Refactor: 重构代码，保持测试通过
 *
 * 测试命名规范：[feature]-[scenario].spec.ts
 * 示例：chat-message-order.spec.ts, editor-persistence.spec.ts
 */

test.describe('Feature: [功能名称]', () => {
  // 每个测试前的通用设置
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await waitForChatReady(page);
  });

  test('should [期望行为 - 正常场景]', async ({ page }) => {
    // ============================================
    // Arrange - 准备测试数据和环境
    // ============================================
    const testData = {
      input: '测试输入',
      expected: '期望输出'
    };

    // ============================================
    // Act - 执行被测试的操作
    // ============================================
    await page.fill('[data-testid="chat-input"]', testData.input);
    await page.click('[data-testid="send-button"]');

    // ============================================
    // Assert - 验证结果符合预期
    // ============================================
    await assertMessageContent(page, testData.expected);
  });

  test('should [期望行为 - 边界条件]', async ({ page }) => {
    // 测试边界情况，例如：
    // - 空输入
    // - 超长输入
    // - 特殊字符
    // - 极限值

    const emptyInput = '';

    await page.fill('[data-testid="chat-input"]', emptyInput);

    // 验证适当的错误处理或默认行为
    const input = page.locator('[data-testid="chat-input"]');
    await expect(input).toBeFocused(); // 输入框保持聚焦
  });

  test('should [期望行为 - 错误处理]', async ({ page }) => {
    // 测试错误场景，例如：
    // - 网络错误
    // - 无效输入
    // - 权限错误
    // - 资源不存在

    // 模拟错误场景
    await page.evaluate(() => {
      // Mock错误响应
    });

    // 验证友好的错误提示
    const errorSelector = '[data-testid="error-message"]';
    await expect(page.locator(errorSelector)).toBeVisible();
  });

  test('should [期望行为 - 状态变化]', async ({ page }) => {
    // 测试状态变化，例如：
    // - 加载状态
    // - 禁用/启用状态
    // - 可见/隐藏状态

    const button = page.locator('[data-testid="action-button"]');

    // 初始状态
    await expect(button).toBeEnabled();

    // 触发状态变化
    await button.click();

    // 新状态
    await expect(button).toBeDisabled();
  });

  test('should handle [复杂场景] correctly', async ({ page }) => {
    // 测试复杂用户流程，例如：
    // - 多步骤操作
    // - 跨组件交互
    // - 异步操作

    // 步骤1
    await page.click('[data-testid="step-1"]');
    await expect(page.locator('[data-testid="result-1"]')).toBeVisible();

    // 步骤2
    await page.click('[data-testid="step-2"]');
    await expect(page.locator('[data-testid="result-2"]')).toBeVisible();

    // 最终验证
    const finalState = await page.evaluate(() => {
      return (window as any).__store?.getState();
    });
    expect(finalState).toBeDefined();
  });

  test('should maintain [数据一致性]', async ({ page }) => {
    // 测试数据一致性，例如：
    // - 页面刷新后数据保留
    // - 多处UI同步更新
    // - 本地存储正确保存

    // 执行操作
    await page.fill('[data-testid="input"]', 'test data');
    await page.click('[data-testid="save"]');

    // 刷新页面
    await page.reload();
    await waitForChatReady(page);

    // 验证数据保留
    const value = await page.inputValue('[data-testid="input"]');
    expect(value).toBe('test data');
  });

  test('should have [性能要求] met', async ({ page }) => {
    // 测试性能要求，例如：
    // - 响应时间
    // - 渲染速度
    // - 动画流畅度

    const startTime = Date.now();

    await page.click('[data-testid="action-button"]');
    await page.waitForSelector('[data-testid="result"]', {
      state: 'visible'
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    // 验证响应时间在可接受范围内（例如 < 2秒）
    expect(duration).toBeLessThan(2000);
  });
});

/**
 * ============================================
 * 测试最佳实践提示
 * ============================================
 *
 * 1. 使用data-testid定位元素
 *    ✅ page.locator('[data-testid="submit-button"]')
 *    ❌ page.locator('button.btn-primary')
 *
 * 2. 使用语义化的断言
 *    ✅ await expect(element).toBeVisible()
 *    ❌ expect(await element.isVisible()).toBe(true)
 *
 * 3. 等待元素状态而非固定时间
 *    ✅ await page.waitForSelector(selector, { state: 'visible' })
 *    ❌ await page.waitForTimeout(1000)
 *
 * 4. 每个测试只验证一个行为
 *    ✅ 每个测试专注于单一功能点
 *    ❌ 一个测试验证多个不相关功能
 *
 * 5. 使用清晰的测试命名
 *    ✅ 'should save file when clicking save button'
 *    ❌ 'test1'
 *
 * 6. 添加测试标签用于分类
 *    test('@fast chat', async () => { ... })
 *    test('@medium editor', async () => { ... })
 *    test('@slow workflow', async () => { ... })
 *    test('@regression bug-fix', async () => { ... })
 */
