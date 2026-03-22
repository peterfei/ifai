/**
 * Tauri API 可用性检查
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('Tauri API 检查', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.waitForTimeout(3000);
  });

  test('检查 Tauri API', async ({ page }) => {
    const result = await page.evaluate(() => {
      const w = window as any;

      return {
        hasTAURI: !!w.__TAURI__,
        hasTAURI_INTERNALS: !!w.__TAURI_INTERNALS__,
        hasTAURICore: !!(w.__TAURI__?.core),
        hasE2ERealTauriMode: w.__E2E_REAL_TAURI_MODE__,

        // 检查 invoke
        invokeType: typeof (w.__TAURI__?.core?.invoke || w.__TAURI_INTERNALS__?.invoke),

        // 检查 listen
        listenType: typeof (w.__TAURI__?.core?.listen || w.__TAURI_INTERNALS__?.listen),

        // 检查 event
        hasEvent: !!(w.__TAURI__?.event),

        // 详细信息
        tauriCoreKeys: w.__TAURI__?.core ? Object.keys(w.__TAURI__?.core) : [],
        tauriEventKeys: w.__TAURI__?.event ? Object.keys(w.__TAURI__?.event) : [],
      };
    });

    console.log('[测试] Tauri API 检查结果:');
    console.log(JSON.stringify(result, null, 2));

    if (result.listenType === 'undefined') {
      console.error('[测试] ❌ listen 函数不可用！');
      console.error('[测试]    可用的 Tauri.core API:', result.tauriCoreKeys);
      console.error('[测试]    可用的 Tauri.event API:', result.tauriEventKeys);
    }
  });
});
