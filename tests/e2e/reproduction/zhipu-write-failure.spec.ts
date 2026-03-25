
import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Reproduction: Zhipu Write Failure (Missing BatchId)', () => {
  test.beforeEach(async ({ page }) => {
    // 监听浏览器控制台日志
    page.on('console', msg => {
      console.log('[Browser Console]', msg.text());
    });

    // 强制设置 vibe 模式以启用 batching
    await page.addInitScript(() => {
      (window as any).__IFAI_EDITOR_MODE__ = 'vibe';
    });

    await setupE2ETestEnvironment(page, { skipWelcome: true });

    await page.waitForFunction(() =>
      (window as any).__chatStore !== undefined &&
      (window as any).__chatEventBus !== undefined &&
      (window as any).__APP_READY__ === true,
      { timeout: 30000 }
    );
  });

  test('should assign the same batchId to multiple agent_write_file calls', async ({ page }) => {
    const testId = 'zhipu-' + Date.now();
    await page.waitForTimeout(2000);

    const correlationId = 'corr-' + testId;

    await page.evaluate(async ({ id, correlationId }) => {
      const bus = (window as any).__chatEventBus;

      // 0. 初始化 Assistant 消息
      bus.emit('chat:message:sent', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        messageId: correlationId,
        content: '',
        isAssistantOnly: true
      });

      // 等待一下让 StoreMapper 处理
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 验证消息是否已创建
      const state1 = (window as any).__chatStore.getState();
      console.log('[E2E Debug] Messages after sent:', state1.messages.map(m => ({ id: m.id, role: m.role })));

      // 如果还是空，尝试直接在 store 中添加 (兜底)
      if (state1.messages.length === 0) {
        console.log('[E2E Debug] ⚠️ Messages still empty, forcing add...');
        (window as any).__chatStore.setState({
          messages: [{ id: correlationId, role: 'assistant', content: '', status: 'streaming', timestamp: Date.now() }]
        });
      }

      // 1. 开始流式响应
      bus.emit('chat:stream:start', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        messageId: correlationId
      });

      // 2. 第一个 agent_write_file 调用
      bus.emit('chat:tool:call', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        toolId: 'tool-1-' + id,
        name: 'agent_write_file',
        arguments: '{"rel_path":"file1.ts","content":"const a = 1;"}'
      });

      // 等待一下让 StoreMapper 处理
      await new Promise(resolve => setTimeout(resolve, 500));

      // 验证消息是否已创建
      const state2 = (window as any).__chatStore.getState();
      console.log('[E2E Debug] Messages after tool call 1:', state2.messages.map(m => ({ id: m.id, role: m.role })));

      // 3. 第二个 agent_write_file 调用
      bus.emit('chat:tool:call', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        toolId: 'tool-2-' + id,
        name: 'agent_write_file',
        arguments: '{"rel_path":"file2.ts","content":"const b = 2;"}'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // 4. 结束流
      bus.emit('chat:stream:finished', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now()
      });
    }, { id: testId, correlationId });

    // 5. 验证两个工具调用是否具有相同的 batchId
    const messages = await page.evaluate(() => (window as any).__chatStore.getState().messages);
    const assistantMsg = messages.find((m: any) => m.id === correlationId);
    
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.toolCalls).toBeDefined();
    expect(assistantMsg.toolCalls.length).toBe(2);

    const tool1 = assistantMsg.toolCalls[0];
    const tool2 = assistantMsg.toolCalls[1];

    console.log('Tool 1:', JSON.stringify(tool1, null, 2));
    console.log('Tool 2:', JSON.stringify(tool2, null, 2));

    expect(tool1.batchId).toBeDefined();
    expect(tool2.batchId).toBeDefined();
    expect(tool1.batchId).toBe(tool2.batchId);
  }, { timeout: 60000 });

  test('should handle partial JSON for agent_write_file content from Zhipu', async ({ page }) => {
    const testId = 'zhipu-partial-' + Date.now();
    await page.waitForTimeout(2000);

    const correlationId = 'corr-' + testId;

    await page.evaluate(async ({ id, correlationId }) => {
      const bus = (window as any).__chatEventBus;

      // 0. 初始化 Assistant 消息
      bus.emit('chat:message:sent', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        messageId: correlationId,
        content: '',
        isAssistantOnly: true
      });

      // 等待一下让 StoreMapper 处理
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 如果还是空，尝试直接在 store 中添加 (兜底)
      const state = (window as any).__chatStore.getState();
      if (state.messages.length === 0) {
        console.log('[E2E Debug] ⚠️ Messages still empty, forcing add...');
        (window as any).__chatStore.setState({
          messages: [{ id: correlationId, role: 'assistant', content: '', status: 'streaming', timestamp: Date.now() }]
        });
      }

      // 1. 开始流
      bus.emit('chat:stream:start', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        messageId: correlationId
      });

      // 2. 发送一个不完整的 agent_write_file 调用 (没有闭合 JSON)
      bus.emit('chat:tool:call', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        toolId: 'tool-partial-' + id,
        name: 'agent_write_file',
        arguments: '{"rel_path":"partial.ts","content":"const x ='
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // 3. 继续发送剩余内容
      bus.emit('chat:tool:call', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now(),
        toolId: 'tool-partial-' + id,
        name: 'agent_write_file',
        arguments: '{"rel_path":"partial.ts","content":"const x = 123;"}'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // 4. 结束流
      bus.emit('chat:stream:finished', {
        correlationId: correlationId,
        sessionId: 'default',
        timestamp: Date.now()
      });
    }, { id: testId, correlationId });

    // 验证结果
    const messages = await page.evaluate(() => (window as any).__chatStore.getState().messages);
    const assistantMsg = messages.find((m: any) => m.id === correlationId);
    
    expect(assistantMsg.toolCalls.length).toBe(1);
    const tool = assistantMsg.toolCalls[0];

    // 验证内容被正确合并
    expect(tool.args.content).toBe('const x = 123;');
    expect(tool.args.rel_path).toBe('partial.ts');
  });
});
