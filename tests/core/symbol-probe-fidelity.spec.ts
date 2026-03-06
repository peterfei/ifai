import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../e2e/setup/index';

/**
 * 🏆 PIVO 3.0: Symbol-Aware 探测集成验证
 */

test.describe('PIVO 3.0 Symbol Probe Fidelity', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__APP_READY__ === true, { timeout: 30000 });
  });

  test('@pivo3 Should return high-fidelity symbols for core store files', async ({ page }) => {
    // 调用后端指令
    const response: any = await page.evaluate(async () => {
        const tauri = (window as any).__TAURI__;
        if (!tauri) throw new Error('Tauri API not found');
        
        const path = 'src/stores/settingsStore.ts'; 
        try {
            return await tauri.core.invoke('probe_symbols', { path });
        } catch (e) {
            return { error: String(e) };
        }
    });

    console.log('[Pivo3] Raw Response Type:', typeof response);
    console.log('[Pivo3] Raw Response:', JSON.stringify(response));

    // 🏆 PIVO 3.0: 处理 Tauri Result 包装 (如果是 Result 类型)
    const symbols = response?.status === 'success' ? response.data : (Array.isArray(response) ? response : response);

    expect(symbols).toBeDefined();
    // 如果失败了，我们打印出详细信息，不强行断言 Array
    if (!Array.isArray(symbols)) {
        console.error('[Pivo3] ❌ Symbols is not an array:', symbols);
    }

    expect(Array.isArray(symbols)).toBe(true);
    expect(symbols.length).toBeGreaterThan(0);
    
    console.log('[Pivo3] ✅ Probing Verified.');
  });
});
