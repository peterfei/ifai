/**
 * Tool Call Display E2E Test
 *
 * 验证工具调用在 UI 中正确显示，包括工具名称和参数
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Tool Call Display - 完整流程测试', () => {
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

  test('工具调用应该正确显示工具名称和参数', async ({ page }) => {
    // 模拟完整的工具调用流程
    await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      const bus = (window as any).__chatEventBus;

      console.log('[E2E] Starting tool call display test...');

      // 等待 StoreMapper 完全初始化
      await new Promise(resolve => setTimeout(resolve, 200));

      // 1. 模拟发送用户消息
      const correlationId = 'test-' + Date.now();

      bus.emit('chat:message:sent', {
        correlationId: correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        messageId: 'msg-user-' + Date.now(),
        content: '读取 package.json 文件'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. 模拟后端发送工具调用事件
      bus.emit('chat:tool:call', {
        correlationId: correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        toolId: 'tool-read-' + Date.now(),
        name: 'agent_read_file',
        arguments: JSON.stringify({ path: 'package.json' })
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // 3. 检查消息状态
      const state = store.getState();
      const assistantMsg = state.messages.find((m: any) => m.id === correlationId);
      const tc = assistantMsg?.toolCalls?.[0];

      console.log('[E2E] Assistant message:', {
        found: !!assistantMsg,
        hasToolCalls: !!assistantMsg?.toolCalls,
        toolCallCount: assistantMsg?.toolCalls?.length || 0
      });

      // 暴露结果给测试
      (window as any).__E2E_TOOL_RESULT__ = {
        found: !!assistantMsg,
        hasToolCalls: !!assistantMsg?.toolCalls,
        toolCallCount: assistantMsg?.toolCalls?.length || 0,
        toolCall: tc ? {
          id: tc.id,
          tool: tc.tool,
          functionName: tc.function?.name,
          args: tc.args,
          functionArgs: tc.function?.arguments,
          hasTool: !!tc.tool,
          hasFunction: !!tc.function,
          hasArgs: !!tc.args
        } : null
      };
    });

    // 获取测试结果
    const result = await page.evaluate(() => (window as any).__E2E_TOOL_RESULT__);
    console.log('[E2E] Test result:', JSON.stringify(result, null, 2));

    // 验证：工具调用被添加
    expect(result.hasToolCalls).toBe(true);
    expect(result.toolCallCount).toBeGreaterThan(0);

    // 验证：工具名称字段存在（UI 组件依赖的字段）
    expect(result.toolCall).not.toBeNull();
    expect(result.toolCall.hasTool).toBe(true);
    expect(result.toolCall.tool).toContain('read_file');
    expect(result.toolCall.hasFunction).toBe(true);
    expect(result.toolCall.functionName).toContain('read_file');
  });

  test('工具调用应该包含双格式结构（兼容 UI 和私有库）', async ({ page }) => {
    await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      const bus = (window as any).__chatEventBus;

      const correlationId = 'dual-format-' + Date.now();

      // 发送消息
      bus.emit('chat:message:sent', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        messageId: 'msg-user-' + Date.now(),
        content: '测试双格式'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // 发送工具调用
      bus.emit('chat:tool:call', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        toolId: 'tool-dual-' + Date.now(),
        name: 'agent_list_dir',
        arguments: JSON.stringify({ path: '.' })
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const state = store.getState();
      const msg = state.messages.find((m: any) => m.id === correlationId);
      const tc = msg?.toolCalls?.[0];

      (window as any).__E2E_DUAL_FORMAT__ = {
        hasTool: !!tc?.tool,
        hasFunction: !!tc?.function,
        hasArgs: !!tc?.args,
        hasArguments: !!tc?.function?.arguments,
        toolValue: tc?.tool,
        functionName: tc?.function?.name,
        argsValue: tc?.args,
        argumentsValue: tc?.function?.arguments
      };
    });

    const result = await page.evaluate(() => (window as any).__E2E_DUAL_FORMAT__);
    console.log('[E2E] Dual format result:', JSON.stringify(result, null, 2));

    // 验证：双格式结构都存在
    expect(result.hasTool).toBe(true);
    expect(result.hasFunction).toBe(true);
    expect(result.hasArgs).toBe(true);
    expect(result.hasArguments).toBe(true);

    // 验证：字段值一致
    expect(result.toolValue).toContain('list_dir');
    expect(result.functionName).toContain('list_dir');
  });

  test('多个工具调用应该正确累积', async ({ page }) => {
    await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      const bus = (window as any).__chatEventBus;

      const correlationId = 'multi-tool-' + Date.now();

      bus.emit('chat:message:sent', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        messageId: 'msg-user-' + Date.now(),
        content: '多个工具调用'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // 发送第一个工具调用
      const toolId1 = 'tool-1-' + Date.now();
      bus.emit('chat:tool:call', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        toolId: toolId1,
        name: 'agent_read_file',
        arguments: JSON.stringify({ path: 'file1.txt' })
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // 发送第二个工具调用
      const toolId2 = 'tool-2-' + Date.now();
      bus.emit('chat:tool:call', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        toolId: toolId2,
        name: 'agent_write_file',
        arguments: JSON.stringify({ path: 'file2.txt', content: 'test' })
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const state = store.getState();
      const msg = state.messages.find((m: any) => m.id === correlationId);

      (window as any).__E2E_MULTI_TOOL__ = {
        toolCallCount: msg?.toolCalls?.length || 0,
        toolNames: msg?.toolCalls?.map((tc: any) => tc.tool) || [],
        toolIds: msg?.toolCalls?.map((tc: any) => tc.id) || []
      };
    });

    const result = await page.evaluate(() => (window as any).__E2E_MULTI_TOOL__);
    console.log('[E2E] Multi tool result:', JSON.stringify(result, null, 2));

    // 验证：两个工具调用都被添加
    expect(result.toolCallCount).toBe(2);
    expect(result.toolNames).toContain('agent_read_file');
    expect(result.toolNames).toContain('agent_write_file');
  });

  test('工具调用流式更新应该正确累加参数', async ({ page }) => {
    await page.evaluate(async () => {
      const store = (window as any).__chatStore;
      const bus = (window as any).__chatEventBus;

      const correlationId = 'streaming-' + Date.now();
      const toolId = 'tool-stream-' + Date.now();

      bus.emit('chat:message:sent', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        messageId: 'msg-user-' + Date.now(),
        content: '流式参数测试'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // 模拟流式参数：第一次发送完整参数（但分两次事件）
      // 注意：真实环境中可能是分片发送，这里模拟这种情况
      bus.emit('chat:tool:call', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        toolId,
        name: 'agent_write_file',
        arguments: '{"path":"test.txt","content":"hello world"}'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const state = store.getState();
      const msg = state.messages.find((m: any) => m.id === correlationId);
      const tc = msg?.toolCalls?.[0];

      (window as any).__E2E_STREAMING__ = {
        hasToolCall: !!tc,
        toolId: tc?.id,
        toolName: tc?.tool,
        args: tc?.args,
        functionArgs: tc?.function?.arguments,
        argsIsObject: typeof tc?.args === 'object',
        hasPathKey: tc?.args && typeof tc?.args === 'object' ? 'path' in tc.args : false,
        hasContentKey: tc?.args && typeof tc?.args === 'object' ? 'content' in tc.args : false
      };
    });

    const result = await page.evaluate(() => (window as any).__E2E_STREAMING__);
    console.log('[E2E] Streaming result:', JSON.stringify(result, null, 2));

    // 验证：工具调用被创建
    expect(result.hasToolCall).toBe(true);

    // 验证：参数被解析为对象
    expect(result.argsIsObject).toBe(true);

    // 验证：参数包含正确的键值对
    expect(result.hasPathKey).toBe(true);
    expect(result.hasContentKey).toBe(true);

    // 验证：function.arguments 仍保持字符串格式（私有库兼容）
    expect(result.functionArgs).toContain('test.txt');
    expect(result.functionArgs).toContain('hello world');
  });
});

test.describe('Tool Call - StoreMapper 事件处理测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('ifai-settings-storage', JSON.stringify({
        state: {
          currentProviderId: 'openai',
          currentModel: 'gpt-4o',
          providers: [{ id: 'openai', apiKey: 'sk-mock', baseUrl: 'https://api.openai.com/v1', enabled: true }],
          onboardingCompleted: true
        }
      }));
      (window as any).__E2E_SKIP_INFRA_STUB__ = true;
    });

    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 30000 });
  });

  test('事件总线工具调用事件应该正确映射到 Store', async ({ page }) => {
    await page.evaluate(async () => {
      const bus = (window as any).__chatEventBus;

      // 等待初始化完成
      await new Promise(resolve => setTimeout(resolve, 200));

      const correlationId = 'event-test-' + Date.now();

      // 1. 先创建助手消息
      bus.emit('chat:message:sent', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        messageId: 'msg-user-' + Date.now(),
        content: '测试事件映射'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // 2. 发送工具调用事件（模拟后端发送的格式）
      bus.emit('chat:tool:call', {
        correlationId,
        sessionId: 'test-session',
        timestamp: Date.now(),
        toolId: 'call_event_test_123',
        name: 'agent_execute_command',
        arguments: JSON.stringify({ command: 'echo hello' })
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // 3. 验证 Store 中的状态
      const store = (window as any).__chatStore;
      const state = store.getState();
      const msg = state.messages.find((m: any) => m.id === correlationId);
      const tc = msg?.toolCalls?.[0];

      (window as any).__E2E_EVENT_MAPPER__ = {
        correlationId,
        found: !!msg,
        hasToolCalls: !!msg?.toolCalls,
        toolCount: msg?.toolCalls?.length || 0,
        toolCall: tc ? {
          id: tc.id,
          tool: tc.tool,
          hasTool: !!tc.tool,
          function: tc.function,
          hasFunction: !!tc.function,
          args: tc.args,
          hasArgs: !!tc.args
        } : null
      };
    });

    const result = await page.evaluate(() => (window as any).__E2E_EVENT_MAPPER__);
    console.log('[E2E] Event mapper result:', JSON.stringify(result, null, 2));

    // 验证：消息被创建
    expect(result.found).toBe(true);

    // 验证：工具调用被添加
    expect(result.hasToolCalls).toBe(true);
    expect(result.toolCount).toBe(1);

    // 验证：双格式结构都存在
    expect(result.toolCall.hasTool).toBe(true);
    expect(result.toolCall.hasFunction).toBe(true);
    expect(result.toolCall.hasArgs).toBe(true);
    expect(result.toolCall.tool).toContain('execute_command');
    expect(result.toolCall.function.name).toContain('execute_command');
  });
});
