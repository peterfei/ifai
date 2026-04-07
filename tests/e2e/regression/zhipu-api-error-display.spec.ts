/**
 * Zhipu API 错误显示测试
 *
 * 🚨 强制性规范: 遵守 tests/e2e/CODING_STANDARDS.md
 *
 * 测试目标: 验证智谱 AI API 错误时，错误信息能够正确显示在聊天气泡和 toast 中
 *
 * 配置要求:
 * - 必须配置 .env.e2e.local 文件
 * - ZHIPU_API_KEY 必须是无效的 API key，以触发 API 错误
 *
 * 测试场景:
 * 1. Zhipu API 返回 400 错误时，错误信息显示在聊天气泡中
 * 2. Zhipu API 返回 400 错误时，toast 显示错误提示
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Zhipu API Error Display', () => {
  test.beforeEach(async ({ page }) => {
    // 监听控制台日志
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('[Browser Error]', msg.text());
      }
    });

    // 设置测试环境
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        const store = layoutStore;
        if (store && store.getState && !store.getState().isChatOpen) {
          store.getState().toggleChat();
        }
      }
    });
    await page.waitForTimeout(2000);

    // 设置 Zhipu provider 和无效的 API key
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        // 使用 updateProviderConfig 更新 API key
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey: 'invalid_api_key_12345'
        });
        // 设置当前 provider 为 zhipu
        settingsStore.getState().setCurrentProviderAndModel('zhipu', 'glm-4.7');
      }
    });
    await page.waitForTimeout(1000);
  });

  test('ZHIPU-ERROR-01: API 返回 400 错误时，错误信息显示在聊天气泡中', async ({ page }) => {
    // 发送消息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('test message');
      }
    });

    // 等待响应
    await page.waitForTimeout(5000);

    // 检查聊天气泡中是否包含错误信息
    const errorBubble = await page.evaluate(() => {
      const messages = (window as any).__chatStore?.getState()?.messages || [];
      const lastMessage = messages[messages.length - 1];
      return lastMessage?.content || '';
    });

    // 验证错误信息包含 API 调用参数有误
    expect(errorBubble).toContain('❌');
    expect(errorBubble).toContain('AI 响应错误');
  });

  test('ZHIPU-ERROR-02: API 返回 400 错误时，toast 显示具体错误信息', async ({ page }) => {
    // 发送消息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('test message');
      }
    });

    // 等待 toast 出现
    const toast = page.locator('.sonner-toast, [data-sonner-toast], .toast');
    await toast.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      // toast 可能没有显示，继续测试
    });

    // 检查 toast 是否显示
    const toastCount = await toast.count();

    // 验证 toast 存在
    expect(toastCount).toBeGreaterThan(0);

    // 验证 toast 内容不是"未知错误"
    const toastText = await toast.first().textContent();
    expect(toastText).not.toContain('未知错误');

    // 🔥 NEW: 验证 toast 显示的是内层错误消息，而不是完整 JSON 或 debug 格式
    // 应该显示 "API 调用参数有误，请检查文档。" 而不是 {"error":{"code":"1210","message":"..."}} 或 "API stream error: HttpError..."
    expect(toastText).not.toContain('{"error":');
    expect(toastText).not.toContain('API stream error:');
    expect(toastText).not.toContain('HttpError');
    // 应该包含具体的错误消息
    expect(toastText).toMatch(/API|参数|调用|文档/);
  });

  test('ZHIPU-ERROR-03: API 返回 400 错误时，isLoading 状态正确设置为 false', async ({ page }) => {
    // 发送消息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('test message');
      }
    });

    // 等待响应
    await page.waitForTimeout(5000);

    // 检查 isLoading 状态
    const isLoading = await page.evaluate(() => {
      return (window as any).__chatStore?.getState()?.isLoading || false;
    });

    // 验证 isLoading 为 false
    expect(isLoading).toBeFalsy();
  });
});
