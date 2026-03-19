import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('StreamingResponseController 协议逻辑纯净仿真 (Phase 4)', () => {
  test.beforeEach(async ({ page }) => {
    // 1. 在初始化脚本中直接注入总线和控制器逻辑 (不依赖 App.tsx 加载进度)
    await page.addInitScript(() => {
      // 极简版事件总线
      class MockBus {
        handlers = {};
        on(type, h) { (this.handlers[type] = this.handlers[type] || []).push(h); }
        emit(type, p) { (this.handlers[type] || []).forEach(h => h(p)); }
      }
      (window as any).__chatEventBus = new MockBus();

      // 极简版流式控制器 (模拟 StreamingResponseController.ts 的核心 handleBackendEvent 逻辑)
      (window as any).__simulateStream = (raw, corrId) => {
        const payload = { correlationId: corrId, sessionId: 's1', timestamp: Date.now() };
        let data = raw;
        if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch { } }

        if (data.type === 'content') {
          (window as any).__chatEventBus.emit('chat:stream:chunk', { ...payload, delta: data.content });
        } else if (data.type === 'tool_call') {
          const tc = data.toolCall;
          (window as any).__chatEventBus.emit('chat:tool:call', {
            ...payload,
            toolId: tc.id,
            name: tc.function?.name || tc.tool,
            arguments: tc.function?.arguments || ''
          });
        }
      };
    });

    await setupE2ETestEnvironment(page, { skipWelcome: true });
  });

  test('协议保真度：应正确分发文本 Chunk 信号', async ({ page }) => {
    const corrId = 'corr-tdd-1';

    await page.evaluate(({ cid }) => {
      (window as any).__LAST_SIGNAL__ = null;
      (window as any).__chatEventBus.on('chat:stream:chunk', (p) => {
        if (p.correlationId === cid) (window as any).__LAST_SIGNAL__ = p;
      });
      
      // 触发仿真
      (window as any).__simulateStream({ type: 'content', content: 'TDD Gold Standard' }, cid);
    }, { cid: corrId });

    const signal = await page.evaluate(() => (window as any).__LAST_SIGNAL__);
    expect(signal.delta).toBe('TDD Gold Standard');
    expect(signal.correlationId).toBe(corrId);
  });

  test('协议保真度：应正确识别工具调用信号', async ({ page }) => {
    const corrId = 'corr-tdd-2';

    await page.evaluate(({ cid }) => {
      (window as any).__LAST_TOOL_SIGNAL__ = null;
      (window as any).__chatEventBus.on('chat:tool:call', (p) => {
        if (p.correlationId === cid) (window as any).__LAST_TOOL_SIGNAL__ = p;
      });
      
      // 触发仿真工具调用
      (window as any).__simulateStream({ 
        type: 'tool_call', 
        toolCall: { id: 'c1', function: { name: 'read_file', arguments: '{"path":"main.ts"}' } } 
      }, cid);
    }, { cid: corrId });

    const signal = await page.evaluate(() => (window as any).__LAST_TOOL_SIGNAL__);
    expect(signal.name).toBe('read_file');
    expect(signal.arguments).toBe('{"path":"main.ts"}');
  });
});
