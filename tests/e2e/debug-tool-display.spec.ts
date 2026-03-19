/**
 * Debug Test - 工具显示问题
 *
 * 用于调试工具调用不显示的问题
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Debug: 工具显示问题', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('ifai-settings-storage', JSON.stringify({
        state: {
          currentProviderId: 'openai',
          currentModel: 'gpt-4o',
          providers: [{ id: 'openai', name: 'OpenAI', apiKey: 'sk-mock', baseUrl: 'https://api.openai.com/v1', enabled: true }],
          onboardingCompleted: true
        },
        version: 0
      }));
      (window as any).__E2E_SKIP_INFRA_STUB__ = true;
    });

    await setupE2ETestEnvironment(page, { skipWelcome: true });

    await page.waitForFunction(() =>
      (window as any).__chatStore !== undefined &&
      (window as any).__chatEventBus !== undefined &&
      (window as any).__APP_READY__ === true,
      { timeout: 30000 }
    );
  });

  test('调试：检查事件总线到 Store 的映射', async ({ page }) => {
    const testId = 'debug-' + Date.now();

    // 1. 手动触发消息发送事件
    await page.evaluate(async (id) => {
      const bus = (window as any).__chatEventBus;
      const correlationId = 'corr-' + id;

      console.log('[Debug] Step 1: Emitting chat:message:sent');
      bus.emit('chat:message:sent', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        messageId: 'msg-' + id,
        content: 'Test message'
      });

      // 检查 Store 状态
      const store = (window as any).__chatStore;
      const state = store.getState();
      console.log('[Debug] Messages after chat:message:sent:', state.messages.length);
      console.log('[Debug] Messages:', JSON.stringify(state.messages, null, 2));

      // 等待一下让 StoreMapper 处理
      await new Promise(resolve => setTimeout(resolve, 100));

      // 再次检查
      const state2 = store.getState();
      console.log('[Debug] Messages after 100ms:', state2.messages.length);

      // 检查是否有 assistant 消息
      const assistantMsg = state2.messages.find((m: any) => m.role === 'assistant');
      console.log('[Debug] Assistant message:', assistantMsg ? 'Found' : 'Not found');

      // 2. 测试流式 chunk 事件
      console.log('[Debug] Step 2: Emitting chat:stream:chunk');
      bus.emit('chat:stream:chunk', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        delta: 'Hello from AI',
        isFinal: false
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const state3 = store.getState();
      console.log('[Debug] Messages after stream:chunk:', state3.messages.length);
      const assistantMsg2 = state3.messages.find((m: any) => m.id === correlationId);
      console.log('[Debug] Assistant message content:', assistantMsg2?.content || 'No content');

      // 3. 测试工具调用事件
      console.log('[Debug] Step 3: Emitting chat:tool:call');
      bus.emit('chat:tool:call', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        toolId: 'tool-' + id,
        name: 'readFile',
        arguments: '{"path":"test.txt"}'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const state4 = store.getState();
      const assistantMsg3 = state4.messages.find((m: any) => m.id === correlationId);
      console.log('[Debug] Assistant message after tool:call:', JSON.stringify(assistantMsg3, null, 2));

      // 暴露结果给测试环境
      (window as any).__DEBUG_RESULT__ = {
        initialMessages: state.messages.length,
        afterSentMessages: state2.messages.length,
        afterChunkMessages: state3.messages.length,
        afterToolMessages: state4.messages.length,
        assistantAfterTool: assistantMsg3
      };
    }, testId);

    // 4. 验证结果
    const result = await page.evaluate(() => (window as any).__DEBUG_RESULT__);

    console.log('[Test] Debug Results:', JSON.stringify(result, null, 2));

    // 基本断言
    expect(result.afterSentMessages).toBeGreaterThan(0);
    expect(result.assistantAfterTool).toBeDefined();
    expect(result.assistantAfterTool.toolCalls).toBeDefined();
    expect(result.assistantAfterTool.toolCalls.length).toBeGreaterThan(0);
  });
});
