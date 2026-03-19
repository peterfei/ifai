import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('ToolCallManager 全生命周期验证 (Phase 4.2)', () => {
  test.beforeEach(async ({ page }) => {
    // 注入仿真环境，确保总线和管理器逻辑独立运行
    await page.addInitScript(() => {
      (window as any).__E2E_SKIP_INFRA_STUB__ = true;
    });

    await setupE2ETestEnvironment(page, { skipWelcome: true });
    
    // 等待核心基础设施挂载完成
    await page.waitForFunction(() => 
      (window as any).__chatEventBus && 
      (window as any).__toolCallManager &&
      (window as any).__APP_READY__ === true, 
      { timeout: 30000 }
    );
  });

  test('工具生命周期：应正确拼装碎片化参数并触发执行', async ({ page }) => {
    const correlationId = 'corr-tool-tdd-1';
    const toolId = 'call_abc_123';

    // 1. 设置监听结果
    await page.evaluate(({ cid, tid }) => {
      (window as any).__TOOL_RESULT__ = null;
      (window as any).__chatEventBus.on('chat:tool:completed', (p) => {
        if (p.toolId === tid && p.correlationId === cid) {
          (window as any).__TOOL_RESULT__ = p;
        }
      });
    }, { cid: correlationId, tid: toolId });

    // 2. 仿真流式分段流入工具参数
    await page.evaluate(async ({ cid, tid }) => {
      const bus = (window as any).__chatEventBus;
      const base = { correlationId: cid, sessionId: 's1', timestamp: Date.now(), toolId: tid, name: 'readFile' };
      
      // 第一段参数
      bus.emit('chat:tool:call', { ...base, arguments: '{"path":' });
      // 第二段参数
      bus.emit('chat:tool:call', { ...base, arguments: '"src/App.tsx"}' });
      
      // 3. 仿真流结束，触发 ToolCallManager 自动执行
      bus.emit('chat:stream:finished', { correlationId: cid, sessionId: 's1', timestamp: Date.now() });
    }, { cid: correlationId, tid: toolId });

    // 4. 校验结果
    await page.waitForFunction(() => (window as any).__TOOL_RESULT__ !== null, { timeout: 5000 });
    const result = await page.evaluate(() => (window as any).__TOOL_RESULT__);
    
    expect(result).toBeTruthy();
    expect(result.result).toContain('Mock result for readFile');
    console.log('[TDD] Tool lifecycle completed successfully');
  });
});
