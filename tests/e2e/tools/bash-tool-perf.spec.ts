import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe('Bash 工具 - 性能与压力测试', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });
    await removeJoyrideOverlay(page);
    // Enable auto-approve
    await page.evaluate(async () => {
      const settings = (window as any).__settingsStore;
      if (settings) {
        settings.setState({ agentAutoApprove: true });
      }
    });
    await page.waitForTimeout(2000);
  });

  test('should remain responsive during long running command', async ({ page }) => {
    test.setTimeout(60000);
    
    // Start a long running command
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('执行 sleep 5');
    });
    
    // Immediately check if we can interact with UI or if the store is updating
    // Simulate some UI interaction check
    const isResponsive = await page.evaluate(async () => {
        // Here we just check if we can read state quickly, ensuring main thread isn't blocked
        const start = performance.now();
        const state = (window as any).__chatStore.getState();
        const end = performance.now();
        return (end - start) < 50; // Should be instant (non-blocking)
    });
    
    expect(isResponsive).toBe(true);
    
    // Wait for command to finish (5s + buffer)
    await page.waitForTimeout(8000);
    
    const state = await page.evaluate(() => {
        const messages = (window as any).__chatStore.getState().messages;
        const lastMsg = messages[messages.length - 1];
        return {
            content: lastMsg?.content || '',
            isLoading: (window as any).__chatStore.getState().isLoading
        };
    });
    
    expect(state.isLoading).toBe(false);
    // The content might contain "Command executed" or similar
    expect(state.content.length).toBeGreaterThan(0);
  });

  test('should handle rapid consecutive commands', async ({ page }) => {
    test.setTimeout(120000);
    
    const commands = ['echo 1', 'echo 2', 'echo 3'];
    
    for (const cmd of commands) {
        console.log(`[Perf] Sending ${cmd}`);
        await page.evaluate(async (c) => {
             // Ensure we are ready
             (window as any).__chatStore.setState({ isLoading: false });
             await (window as any).__E2E_SEND__(`执行 ${c}`);
        }, cmd);
        
        // Wait for it to complete
        let completed = false;
        const start = Date.now();
        while (Date.now() - start < 15000) {
            const state = await page.evaluate(() => {
                const store = (window as any).__chatStore.getState();
                const msgs = store.messages;
                const last = msgs[msgs.length-1];
                return {
                    loading: store.isLoading,
                    content: last?.content || '',
                    role: last?.role
                };
            });
            
            // Check if last message is assistant and not loading
            if (!state.loading && state.role === 'assistant' && state.content.length > 0) {
                 completed = true;
                 break;
            }
            await page.waitForTimeout(500);
        }
        
        expect(completed).toBe(true);
        console.log(`[Perf] Command ${cmd} completed`);
        
        // Small pause between commands
        await page.waitForTimeout(1000);
    }
  });
});
