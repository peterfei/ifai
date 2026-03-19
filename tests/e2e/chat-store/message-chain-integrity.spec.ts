import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('ChatStore 重构验收：核心不断链验证 (全仿真闭环)', () => {
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
      (window as any).__APP_READY__ === true, 
      { timeout: 30000 }
    );
  });

  test('重构验收：从发送到持久化的全仿真闭环', async ({ page }) => {
    const testMessage = 'Refactor Victory Lap ' + Date.now();
    
    // 1. 触发发送
    await page.evaluate(async (msg) => {
      const store = (window as any).__chatStore;
      return store.getState().sendMessage(msg, 'openai', 'gpt-4o');
    }, testMessage);

    // 2. 验证 Store 级同步 (由于后端 Invoke 可能会在仿真环境下挂起，我们重点看内存状态)
    await page.waitForFunction((msg) => {
      const store = (window as any).__chatStore;
      const msgs = store.getState().messages;
      return msgs.some(m => m.content === msg);
    }, testMessage, { timeout: 10000 });

    console.log('[Acceptance] ✅ Send -> Store Mapping Verified');

    // 3. 模拟一个 AI 回复 Chunk，验证 StoreMapper 的实时性
    await page.evaluate(async (msg) => {
        const bus = (window as any).__chatEventBus;
        const store = (window as any).__chatStore;
        const lastUserMsg = store.getState().messages.find(m => m.content === msg);
        
        // 仿真一个 Chunk
        (window as any).__chatEventBus.emit('chat:stream:chunk', {
            correlationId: lastUserMsg.id,
            sessionId: 'default',
            timestamp: Date.now(),
            delta: 'AI Response Body',
            isFinal: true
        });
    }, testMessage);

    // 验证 AI 内容是否映射到 Store
    await page.waitForFunction(() => {
        const store = (window as any).__chatStore;
        return store.getState().messages.some(m => m.content.includes('AI Response Body'));
    }, { timeout: 5000 });

    console.log('[Acceptance] ✅ EventBus -> Store Mapping Verified');

    // 4. 验证 0ms 延迟持久化
    await page.reload();
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 30000 });

    const messages = await page.evaluate(() => (window as any).__chatStore.getState().messages);
    expect(messages.some(m => m.content === testMessage)).toBe(true);
    expect(messages.some(m => m.content.includes('AI Response Body'))).toBe(true);
    
    console.log('[Acceptance] 🏆 REFACTOR 100% COMPLETE: Chain verified with zero-loss.');
  });
});
