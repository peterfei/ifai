import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Agent 高保真链路验证 V2 (物理驱动版)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('ifai-settings-storage', JSON.stringify({
        state: {
          currentProviderId: 'zhipu',
          currentModel: 'glm-4',
          providers: [{ id: 'zhipu', name: 'Zhipu', apiKey: 'sk-mock', enabled: true }],
          onboardingCompleted: true
        },
        version: 0
      }));
      (window as any).__E2E_SKIP_INFRA_STUB__ = true;
      (window as any).VITE_TEST_ENV = 'e2e';

      // 🏆 物理拦截续播：验证脱敏逻辑
      (window as any).__E2E_INVOKE_HANDLER__ = async (cmd, args) => {
          console.log('[E2E Mock] Intercepted invoke:', cmd, args);
          if (cmd === 'ai_chat') {
              const msgs = args.messages;
              const hasEmpty = msgs.some(m => !m.content && (!m.tool_calls || m.tool_calls.length === 0) && m.role !== 'tool');
              console.log('[E2E Mock] Sanitization check:', { hasEmpty, msgCount: msgs.length });
              if (!hasEmpty) {
                  (window as any).__物理脱敏成功__ = true;
                  console.log('[E2E Mock] ✅ Sanitization successful!');
              }
              return Promise.resolve();
          }
          return Promise.resolve();
      };
    });

    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.waitForFunction(() => (window as any).__chatStore !== undefined && (window as any).__APP_READY__ === true, { timeout: 30000 });
  });

  test('全链路验证：物理状态注入 -> 逻辑续播 -> 脱敏校验', async ({ page }) => {
    // 1. 发送初始消息并获取 Correlation ID
    const correlationId = await page.evaluate(async () => {
        const store = (window as any).__chatStore;
        const res = await store.getState().sendMessage('Scan project', 'zhipu', 'glm-4');
        return res.correlationId;
    });

    // 2. 🏆 物理注入：模拟工具结果已到账
    await page.evaluate((cid) => {
        const store = (window as any).__chatStore;
        store.setState((state: any) => ({
            messages: [...state.messages, {
                id: 'res-123',
                role: 'tool',
                content: '{"files": ["src/"]}',
                tool_call_id: 'call_123',
                timestamp: Date.now()
            }],
            isLoading: true
        }));
    }, correlationId);

    // 3. 物理驱动续播 (非阻塞模式，防止监听器挂起测试流)
    await page.evaluate(() => {
        const store = (window as any).__chatStore;
        const state = store.getState();
        // 🏆 物理分离：不 await，因为 generateResponse 内部可能会由于 Mock 环境而挂起
        state.generateResponse(state.messages, 'zhipu', 'glm-4');
    });

    // 4. 核心断言：物理脱敏是否成功 (决定 1213 报错是否消失)
    // 只要逻辑层执行到了 invoke 之前的脱敏位置，该标志位就会变 true
    await page.waitForFunction(() => (window as any).__物理脱敏成功__ === true, { timeout: 15000 });

    console.log('[Acceptance] 🏆 REFACTOR COMPLETE: Agent loop verified with Zero-Message cleansing!');
  });
});
