import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('ChatStore 全管道编排集成验证 (Phase 3)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.waitForFunction(() => 
      (window as any).__sendMessageOrchestrator && 
      (window as any).__APP_READY__ === true, 
      { timeout: 30000 }
    );
  });

  test('全管道闭环：应正确处理引用注入并触发持久化信号', async ({ page }) => {
    // 使用一个存在的项目文件作为引用
    const testMsg = 'Analyze this file: [#main.tsx](src/main.tsx)';
    
    // 1. 监听 chat:message:sent，捕捉最终构建的内容
    const result = await page.evaluate(async (msg) => {
      return new Promise((resolve) => {
        const bus = (window as any).__chatEventBus;
        bus.on('chat:message:sent', (payload) => {
          // 校验是否包含了注入的文件内容
          const hasFileContent = payload.content.includes('--- FILE: src/main.tsx ---');
          resolve({
            success: true,
            hasFileContent,
            correlationId: payload.correlationId,
            contentLength: payload.content.length
          });
        });
        
        (window as any).__sendMessageOrchestrator.send(msg, 'openai', 'gpt-4o');
        
        // 超时保护
        setTimeout(() => resolve({ success: false }), 8000);
      });
    }, testMsg);

    expect(result.success).toBe(true);
    expect(result.hasFileContent).toBe(true);
    expect(result.correlationId).toMatch(/^corr-/);
    console.log(`[Integration] Pipe execution successful, content length: ${result.contentLength}`);
  });

  test('上下文选择：应符合 Token 限制逻辑', async ({ page }) => {
    // 此测试验证 ContextSelector 是否被 Orchestrator 正确调度
    const result = await page.evaluate(async () => {
      const res = await (window as any).__sendMessageOrchestrator.send('ping', 'openai', 'gpt-4o');
      return {
        contextLength: res.context.length,
        hasSystemMsg: res.context.some(m => m.role === 'system')
      };
    });

    expect(result.contextLength).toBeGreaterThan(0);
    // 理论上初始 Session 至少包含一条系统消息
    expect(result.hasSystemMsg).toBe(true);
  });
});
