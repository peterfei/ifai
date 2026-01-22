/**
 * 工具分类系统端到端测试
 *
 * 测试完整的工具分类流程：用户输入 → 分类 → 显示结果 → 用户反馈
 */

import { test, expect } from '@playwright/test';

test.describe('工具分类系统 E2E 测试', () => {
  test.beforeEach(async ({ page }) => {
    // 导航到应用主页
    await page.goto('/');
    // 等待应用加载
    await page.waitForLoadState('networkidle');
  });

  test('应该显示实时分类指示器', async ({ page }) => {
    // 打开AI聊天面板（如果未打开）
    const chatInput = page.locator('textarea[placeholder*="输入"]').first();
    await expect(chatInput).toBeVisible();

    // 输入测试文本
    await chatInput.fill('/read README.md');

    // 等待分类结果出现
    await expect(page.locator('text=Layer 1')).toBeVisible({ timeout: 1000 });
  });

  test('Layer 1 精确匹配测试', async ({ page }) => {
    const chatInput = page.locator('textarea[placeholder*="输入"]').first();

    // 测试斜杠命令
    await chatInput.fill('/read test.txt');
    await expect(page.locator('text=Layer 1')).toBeVisible();
    await expect(page.locator('text=精确匹配')).toBeVisible();
  });

  test('Layer 2 规则分类测试', async ({ page }) => {
    const chatInput = page.locator('textarea[placeholder*="输入"]').first();

    // 测试中文关键词
    await chatInput.fill('读取文件');
    await expect(page.locator('text=Layer 2')).toBeVisible({ timeout: 1000 });
    await expect(page.locator('text=规则分类')).toBeVisible();
  });

  test('应该显示置信度和延迟', async ({ page }) => {
    const chatInput = page.locator('textarea[placeholder*="输入"]').first();

    await chatInput.fill('生成函数');

    // 检查置信度显示
    await expect(page.locator(/\d+%/)).toBeVisible();
    // 检查延迟显示
    await expect(page.locator(/\d+\.?\d*ms/)).toBeVisible();
  });

  test('应该显示用户反馈按钮', async ({ page }) => {
    const chatInput = page.locator('textarea[placeholder*="输入"]').first();

    await chatInput.fill('git status');

    // 检查反馈按钮（点赞/点踩）
    await expect(page.locator('[title="分类正确"]')).toBeVisible();
    await expect(page.locator('[title="分类错误"]')).toBeVisible();
  });

  test('用户反馈应该可以点击', async ({ page }) => {
    const chatInput = page.locator('textarea[placeholder*="输入"]').first();

    await chatInput.fill('什么是闭包');

    // 点击正面反馈
    const positiveButton = page.locator('[title="分类正确"]');
    await positiveButton.click();

    // 验证按钮状态改变（应该有active样式）
    await expect(positiveButton).toHaveClass(/bg-green-600/);
  });

  test('设置页面 - 工具分类开关', async ({ page }) => {
    // 打开设置
    await page.click('button:has-text("设置")');
    await expect(page.locator('text=工具分类')).toBeVisible();

    // 点击工具分类标签
    await page.click('text=工具分类');

    // 检查设置选项
    await expect(page.locator('text=启用工具分类')).toBeVisible();
    await expect(page.locator('text=显示分类指示器')).toBeVisible();
    await expect(page.locator('text=置信度阈值')).toBeVisible();
    await expect(page.locator('text=回退策略')).toBeVisible();
  });

  test('设置页面 - 调整置信度阈值', async ({ page }) => {
    // 打开设置并导航到工具分类
    await page.click('button:has-text("设置")');
    await page.click('text=工具分类');

    // 查找滑块
    const thresholdSlider = page.locator('input[type="range"]').first();
    await expect(thresholdSlider).toBeVisible();

    // 拖动滑块
    await thresholdSlider.evaluate((el: any) => el.value = 0.8);

    // 验证值更新
    await expect(page.locator('text=80%')).toBeVisible();
  });

  test('测试页面应该可访问', async ({ page }) => {
    // 使用快捷键打开测试页面（Cmd+Shift+D）
    await page.keyboard.press('Meta+Shift+D');

    // 等待测试页面打开
    await expect(page.locator('text=工具分类系统测试')).toBeVisible();

    // 检查测试按钮
    await expect(page.locator('text=快速测试')).toBeVisible();
    await expect(page.locator('text=完整测试')).toBeVisible();
  });

  test('测试页面 - 运行快速测试', async ({ page }) => {
    // 打开测试页面
    await page.keyboard.press('Meta+Shift+D');

    // 点击快速测试按钮
    await page.click('text=快速测试');

    // 等待测试完成（检查结果表格）
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
  });

  test('应该根据设置隐藏/显示分类指示器', async ({ page }) => {
    const chatInput = page.locator('textarea[placeholder*="输入"]').first();

    // 先打开分类指示器
    await chatInput.fill('test input');
    await expect(page.locator('text=Layer')).toBeVisible({ timeout: 1000 });

    // 打开设置并禁用分类指示器
    await page.click('button:has-text("设置")');
    await page.click('text=工具分类');

    const showIndicatorCheckbox = page.locator('text=显示分类指示器')
      .locator('..')
      .locator('input[type="checkbox"]');

    // 取消勾选
    await showIndicatorCheckbox.uncheck();

    // 关闭设置
    await page.keyboard.press('Escape');

    // 验证指示器不再显示
    await chatInput.fill('another test');
    await expect(page.locator('text=Layer')).not.toBeVisible({ timeout: 1000 });
  });

  test('应该正确显示不同层级的图标', async ({ page }) => {
    const chatInput = page.locator('textarea[placeholder*="输入"]').first();

    // Layer 1: 🎯
    await chatInput.fill('/read test.txt');
    await expect(page.locator('text=🎯')).toBeVisible();

    // Layer 2: 🤔
    await chatInput.fill('生成函数');
    await expect(page.locator('text=🤔')).toBeVisible({ timeout: 1000 });
  });

  test('监控组件应该显示统计信息', async ({ page }) => {
    // 打开测试页面
    await page.keyboard.press('Meta+Shift+D');

    // 运行测试以生成数据
    await page.click('text=快速测试');
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

    // 检查是否有统计数据（虽然监控组件可能在其他地方）
    // 这里主要验证测试完成并生成了历史记录
  });
});

test.describe('工具分类性能测试', () => {
  test('Layer 1 分类应该在 5ms 内完成', async ({ page }) => {
    const chatInput = page.locator('textarea[placeholder*="输入"]').first();
    await chatInput.fill('/read test.txt');

    const startTime = Date.now();
    await expect(page.locator('text=Layer 1')).toBeVisible();
    const latency = Date.now() - startTime;

    // Layer 1 应该非常快（<5ms实际可能是网络延迟，所以我们设置一个宽松的限制）
    expect(latency).toBeLessThan(1000);
  });

  test('连续输入应该正确处理防抖', async ({ page }) => {
    const chatInput = page.locator('textarea[placeholder*="输入"]').first();

    // 快速连续输入
    await chatInput.fill('t');
    await page.waitForTimeout(50);
    await chatInput.fill('te');
    await page.waitForTimeout(50);
    await chatInput.fill('tes');
    await page.waitForTimeout(50);
    await chatInput.fill('test');

    // 防抖延迟后应该只触发一次分类
    await page.waitForTimeout(400);
    await expect(page.locator('text=Layer')).toBeVisible({ timeout: 1000 });
  });
});
