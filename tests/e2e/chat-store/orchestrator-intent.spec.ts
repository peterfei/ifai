import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('SendMessageOrchestrator 编排器与意图识别验证 (Phase 3)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    
    // 等待核心基础设施挂载完成
    await page.waitForFunction(() => 
      (window as any).__sendMessageOrchestrator && 
      (window as any).__chatEventBus &&
      (window as any).__APP_READY__ === true, 
      { timeout: 30000 }
    );
  });

  test('Orchestrator 应该正确识别并分发斜杠命令意图', async ({ page }) => {
    const testCommand = '/explore src/core';
    
    // 1. 监听事件总线
    await page.evaluate(() => {
      (window as any).__LAST_INTENT__ = null;
      (window as any).__chatEventBus.on('chat:intent:detected', (payload) => {
        (window as any).__LAST_INTENT__ = payload;
      });
    });

    // 2. 调用编排器
    await page.evaluate(async (cmd) => {
      await (window as any).__sendMessageOrchestrator.send(cmd, 'openai', 'gpt-4o');
    }, testCommand);

    // 3. 校验识别结果
    const intentPayload = await page.evaluate(() => (window as any).__LAST_INTENT__);
    expect(intentPayload).toBeTruthy();
    expect(intentPayload.intent.type).toBe('slash');
    expect(intentPayload.metadata.command).toBe('/explore');
    // 🏆 修正
    expect(intentPayload.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/); 
  });

  test('Orchestrator 发送消息后应通过总线触发持久化落盘', async ({ page }) => {
    const testMsg = 'Persistence Signal Test ' + Date.now();
    
    // 1. 监听 chat:message:sent 事件，确保信号发出
    const signalEmitted = await page.evaluate(async (msg) => {
      return new Promise((resolve) => {
        (window as any).__chatEventBus.on('chat:message:sent', (p) => {
          if (p.content.includes(msg)) resolve(true);
        });
        (window as any).__sendMessageOrchestrator.send(msg, 'openai', 'gpt-4o');
        setTimeout(() => resolve(false), 5000);
      });
    }, testMsg);

    expect(signalEmitted).toBe(true);
  });
});
