/**
 * 真实 LLM E2E 测试 - 复现并修复消息断连问题
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from '../setup';

test.describe('Message Disconnect Real LLM E2E Tests', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
    });

    await page.goto('/');
    await page.waitForFunction(() => {
      return (window as any).__chatStore !== undefined;
    }, { timeout: 30000 });
  });

  test('scenario A: generate 2048 game', async ({ page }) => {
    console.log('[E2E] Starting Scenario A test...');

    const config = await getRealAIConfig(page);
    console.log('[E2E] Config:', config);

    // 发送消息
    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, {
      text: '生成 2048 小游戏',
      providerId: config.providerId,
      modelId: config.modelId
    });

    // 等待助手消息出现
    await page.waitForFunction(() => {
      const messages = (window as any).__chatStore?.getState().messages || [];
      return messages.some((m: any) => m.role === 'assistant');
    }, { timeout: 60000 });

    console.log('[E2E] Assistant message appeared');

    // 等待响应完成
    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      for (let i = 0; i < 180; i++) {
        const messages = chatStore.getState().messages;
        const assistantMsg = [...messages].reverse().find(m => m.role === 'assistant');

        if (assistantMsg && !assistantMsg.isStreaming) {
          return {
            success: true,
            content: assistantMsg.content?.substring(0, 200),
            toolCalls: assistantMsg.toolCalls?.length || 0,
            isLoading: chatStore.getState().isLoading
          };
        }

        await new Promise(r => setTimeout(r, 500));
      }
      return { success: false, reason: 'Timeout' };
    }, { timeout: 90000 });

    console.log('[E2E] Test result:', result);
    expect(result.success).toBe(true);
    expect(result.isLoading).toBe(false);
  });
});
