import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe.skip('Chat Double Bubble Reproduction - TODO: Fix this test', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
    });

    await page.goto('/');
    
    // 等待核心加载
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 30000 });
    
    // 强制关闭所有可能的对话框，确保输入框可点击
    await page.evaluate(() => {
      // 关闭欢迎对话框
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      
      // 打开聊天面板
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.getState().updateSettings({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(1000);
  });

  test('should not show duplicate user messages when local model returns should_use_local but no immediate result', async ({ page }) => {
    await page.waitForFunction(() => (window as any).__settingsStore !== undefined);
    
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      
      settingsStore.setState({
        providers: [{
          id: 'mock-p', name: 'Mock', protocol: 'openai', 
          baseUrl: 'http://localhost:1234', apiKey: 'sk-mock-key', 
          models: ['m1'], enabled: true, isCustom: true
        }],
        currentProviderId: 'mock-p',
        currentModel: 'm1'
      });

      if ((window as any).__tauriSetInvokeHandler__) {
        (window as any).__tauriSetInvokeHandler__((cmd: string, args?: any) => {
          if (cmd === 'local_model_preprocess') {
            return {
              should_use_local: true,
              has_tool_calls: false,
              local_response: null,
              route_reason: 'Testing double bubble'
            };
          }
          if (cmd === 'ai_chat') return Promise.resolve();
          if (cmd === 'count_tokens' || cmd === 'estimate_tokens_cmd') return 10;
          return {};
        });
      }
    });

    // 使用更强制的手段找到并点击输入框
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.scrollIntoViewIfNeeded();
    await chatInput.click({ force: true });
    
    const testMessage = 'Double Bubble Test ' + Date.now();
    await chatInput.fill(testMessage);
    await chatInput.press('Enter');

    await page.waitForTimeout(2000);

    const messages = await page.evaluate(() => {
      return (window as any).__chatStore.getState().messages;
    });

    const userMessages = messages.filter((m: any) => m.role === 'user' && m.content === testMessage);
    
    console.log(`[Test] User messages count: ${userMessages.length}`);
    
    // 如果复现成功，这里应该是 2
    expect(userMessages.length).toBe(1);
  });
});
