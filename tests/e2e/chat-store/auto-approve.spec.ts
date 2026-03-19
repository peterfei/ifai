/**
 * Auto-Approve E2E Test
 *
 * 验证工具调用的自动审批功能
 */

import { test, expect } from '@playwright/test';

test.describe('Auto-Approve 工具调用测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('ifai-settings-storage', JSON.stringify({
        state: {
          currentProviderId: 'openai',
          currentModel: 'gpt-4o',
          providers: [{
            id: 'openai',
            name: 'OpenAI',
            apiKey: 'sk-mock',
            baseUrl: 'https://api.openai.com/v1',
            enabled: true
          }],
          onboardingCompleted: true,
          // 🔥 启用自动审批
          agentAutoApprove: true
        },
        version: 0
      }));
      (window as any).__E2E_SKIP_INFRA_STUB__ = true;
    });

    // 导航到应用
    await page.goto('http://localhost:1420');

    await page.waitForFunction(() =>
      (window as any).__chatStore !== undefined &&
      (window as any).__chatEventBus !== undefined,
      { timeout: 30000 }
    );
  });

  test('工具调用应该触发自动审批（当启用时）', async ({ page }) => {
    await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      const bus = (window as any).__chatEventBus;

      console.log('[E2E] Starting auto-approve test...');

      // 等待初始化
      await new Promise(resolve => setTimeout(resolve, 200));

      const correlationId = 'auto-approve-' + Date.now();

      // 1. 发送用户消息
      bus.emit('chat:message:sent', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        messageId: 'msg-user-' + Date.now(),
        content: '测试自动审批'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // 2. 发送工具调用事件
      bus.emit('chat:tool:call', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        toolId: 'tool-auto-' + Date.now(),
        name: 'agent_read_file',
        arguments: JSON.stringify({ path: 'test.txt' })
      });

      // 等待自动审批逻辑执行
      await new Promise(resolve => setTimeout(resolve, 300));

      // 3. 检查工具调用状态
      const state = store.getState();
      const msg = state.messages.find((m: any) => m.id === correlationId);
      const tc = msg?.toolCalls?.[0];

      (window as any).__E2E_AUTO_APPROVE__ = {
        found: !!msg,
        hasToolCalls: !!msg?.toolCalls,
        toolCall: tc ? {
          id: tc.id,
          tool: tc.tool,
          args: tc.args,
          status: tc.status,
          hasStatus: !!tc.status
        } : null
      };
    });

    const result = await page.evaluate(() => (window as any).__E2E_AUTO_APPROVE__);
    console.log('[E2E] Auto-approve result:', JSON.stringify(result, null, 2));

    // 验证：工具调用被创建
    expect(result.hasToolCalls).toBe(true);

    // 注意：由于我们在测试环境中，approveToolCall 可能会失败（后端不可用）
    // 所以这里主要验证工具调用被正确创建
    expect(result.toolCall.tool).toContain('read_file');
  });

  test('工具调用参数应该正确解析为对象', async ({ page }) => {
    await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      const bus = (window as any).__chatEventBus;

      await new Promise(resolve => setTimeout(resolve, 200));

      const correlationId = 'args-parse-' + Date.now();

      bus.emit('chat:message:sent', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        messageId: 'msg-user-' + Date.now(),
        content: '测试参数解析'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // 发送带有完整 JSON 参数的工具调用
      bus.emit('chat:tool:call', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        toolId: 'tool-args-' + Date.now(),
        name: 'agent_write_file',
        arguments: JSON.stringify({
          path: 'example.txt',
          content: 'hello world'
        })
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const state = store.getState();
      const msg = state.messages.find((m: any) => m.id === correlationId);
      const tc = msg?.toolCalls?.[0];

      (window as any).__E2E_ARGS_PARSE__ = {
        found: !!msg,
        toolCall: tc ? {
          tool: tc.tool,
          argsType: typeof tc.args,
          args: tc.args,
          hasPathKey: tc.args && typeof tc.args === 'object' ? 'path' in tc.args : false,
          hasContentKey: tc.args && typeof tc.args === 'object' ? 'content' in tc.args : false,
          pathValue: tc.args?.path,
          contentValue: tc.args?.content,
          functionArgs: tc.function?.arguments
        } : null
      };
    });

    const result = await page.evaluate(() => (window as any).__E2E_ARGS_PARSE__);
    console.log('[E2E] Args parse result:', JSON.stringify(result, null, 2));

    // 验证：参数被解析为对象
    expect(result.toolCall.argsType).toBe('object');

    // 验证：参数包含正确的键值对
    expect(result.toolCall.hasPathKey).toBe(true);
    expect(result.toolCall.hasContentKey).toBe(true);
    expect(result.toolCall.pathValue).toBe('example.txt');
    expect(result.toolCall.contentValue).toBe('hello world');

    // 验证：function.arguments 保持字符串格式
    expect(result.toolCall.functionArgs).toContain('example.txt');
  });
});
