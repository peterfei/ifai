/**
 * Debug Test - 完整消息发送流程
 *
 * 用于诊断工具调用不显示的问题
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('Debug: 完整消息发送流程', () => {
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
      // 启用自动审批
      window.localStorage.setItem('ifai-chat-ui-storage', JSON.stringify({
        state: { agentAutoApprove: true }
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

  test('调试：通过 sendMessage 发送完整流程', async ({ page }) => {
    // 模拟发送消息
    await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      const bus = (window as any).__chatEventBus;

      console.log('[Debug] Starting full pipeline test...');

      // 1. 发送消息
      console.log('[Debug] Step 1: Sending message...');
      try {
        await store.getState().sendMessage('执行 echo hello', 'openai', 'gpt-4o');
      } catch (e) {
        console.log('[Debug] Send error (expected in test env):', e.message);
      }

      // 等待一下让事件处理
      await new Promise(resolve => setTimeout(resolve, 500));

      // 检查消息状态
      const state = store.getState();
      console.log('[Debug] Messages after send:', state.messages.length);

      // 打印每条消息的详情
      state.messages.forEach((msg: any, idx: number) => {
        console.log(`[Debug] Message ${idx}:`, {
          id: msg.id,
          role: msg.role,
          contentLength: msg.content?.length || 0,
          contentPreview: msg.content?.substring(0, 50),
          hasToolCalls: !!msg.toolCalls,
          toolCallCount: msg.toolCalls?.length || 0,
          status: msg.status
        });
      });

      // 暴露结果给测试
      (window as any).__DEBUG_FULL_RESULT__ = {
        messageCount: state.messages.length,
        lastMessage: state.messages[state.messages.length - 1],
        allMessages: state.messages.map((m: any) => ({
          role: m.role,
          contentLength: m.content?.length || 0,
          hasToolCalls: !!m.toolCalls,
          toolCallCount: m.toolCalls?.length || 0,
          status: m.status
        }))
      };
    });

    // 获取结果
    const result = await page.evaluate(() => (window as any).__DEBUG_FULL_RESULT__);
    console.log('[Test] Full pipeline result:', JSON.stringify(result, null, 2));

    // 验证：应该有用户消息和助手消息
    expect(result.messageCount).toBeGreaterThanOrEqual(2);

    // 验证：最后一条消息应该是助手
    expect(result.lastMessage.role).toBe('assistant');
  });

  test('调试：手动触发工具调用事件', async ({ page }) => {
    await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      const bus = (window as any).__chatEventBus;

      // 先创建用户消息和助手消息
      const correlationId = 'corr-' + Date.now();
      bus.emit('chat:message:sent', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        messageId: 'msg-user-' + Date.now(),
        content: 'Read file test.txt'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // 模拟工具调用
      bus.emit('chat:tool:call', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        toolId: 'tool-read-' + Date.now(),
        name: 'readFile',
        arguments: '{"path":"test.txt"}'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // 检查工具调用是否添加到消息中
      const state = store.getState();
      const assistantMsg = state.messages.find((m: any) => m.id === correlationId);

      console.log('[Debug] Assistant message:', {
        found: !!assistantMsg,
        hasToolCalls: !!assistantMsg?.toolCalls,
        toolCallCount: assistantMsg?.toolCalls?.length || 0,
        toolCalls: assistantMsg?.toolCalls
      });

      // 暴露结果
      (window as any).__DEBUG_TOOL_RESULT__ = {
        found: !!assistantMsg,
        hasToolCalls: !!assistantMsg?.toolCalls,
        toolCallCount: assistantMsg?.toolCalls?.length || 0,
        toolCallName: assistantMsg?.toolCalls?.[0]?.function?.name
      };
    });

    const result = await page.evaluate(() => (window as any).__DEBUG_TOOL_RESULT__);
    console.log('[Test] Tool call result:', JSON.stringify(result, null, 2));

    // 验证工具调用被正确添加
    expect(result.hasToolCalls).toBe(true);
    expect(result.toolCallCount).toBeGreaterThan(0);
  });
});
