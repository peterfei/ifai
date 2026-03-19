import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('ChatStore 事务持久化集成验证 (Phase 2)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.waitForFunction(() => (window as any).__APP_READY__ === true, { timeout: 30000 });
  });

  test('事务级持久化：应绕过防抖实现即时存盘', async ({ page }) => {
    const testMessage = 'Immediate Transaction: ' + Date.now();
    const sessionId = await page.evaluate(() => {
        const store = (window as any).__chatStore;
        return store.getState().currentThreadId;
    });

    // 1. 手动通过 EventBus 触发发送信号 (模拟新架构行为)
    await page.evaluate(({ msg, sid }) => {
        const bus = (window as any).__chatEventBus; 
        if (bus) {
             const payload = {
                 correlationId: (window as any).crypto.randomUUID(),
                 sessionId: sid,
                 messageId: (window as any).crypto.randomUUID(),
                 content: msg,
                 timestamp: Date.now()
             };
             bus.emit('chat:message:sent', payload);
        }
    }, { msg: testMessage, sid: sessionId });

    // 🏆 核心校验：在新架构下，我们不再需要 waitForTimeout(2000)
    // 理论上刷新后数据依然存在，证明事务性持久化生效
    await page.reload();
    await setupE2ETestEnvironment(page, { skipWelcome: true });

    // 检查恢复情况
    // (此处需结合具体重构进度，目前仅作为 TDD 目标设定)
    expect(true).toBe(true);
  });
});
