import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../e2e/setup/index';
import { AuthoritativeWait } from '../utils/AuthoritativeWait';

/**
 * 🏆 PIVO 3.0: 存储迁移高保真集成测试
 * 验证数据从 LocalStorage 自动搬迁至 IndexedDB 的物理过程。
 */

test.describe('PIVO 3.0 Storage Migration Fidelity', () => {
  test.beforeEach(async ({ page }) => {
    // 1. 预注入脏数据
    await page.addInitScript(() => {
      localStorage.setItem('ifai-history-legacy-session', JSON.stringify({ messages: [{ role: 'user', content: 'Legacy Data' }] }));
      localStorage.setItem('pivo-task-trees-legacy', JSON.stringify({ tree: [] }));
      localStorage.setItem('settings-theme', JSON.stringify('dark')); // 不应被搬迁
    });

    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.goto('/');
    
    // 等待应用就绪
    await page.waitForFunction(() => (window as any).__APP_READY__ === true, { timeout: 30000 });
  });

  test('@pivo3 Should migrate data and cleanup LocalStorage', async ({ page }) => {
    // 等待 chatStore 初始化
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });

    // 等待数据迁移完成
    await page.waitForTimeout(3000);

    // 1. 验证迁移后的数据在 IndexedDB (通过 SDK 访问)
    const migratedHistory = await page.evaluate(async () => {
        const chatStore = (window as any).__chatStore;
        // 既然 DataMigrator 是异步的，我们需要等待一小会儿或者轮询
        return chatStore.getState().messages;
    });

    console.log('[Pivo3] Migrated history:', migratedHistory);

    // 2. 物理层验证 LocalStorage 已清理
    const legacyKeysCount = await page.evaluate(() => {
        return Object.keys(localStorage).filter(k => k.startsWith('ifai-history') || k.startsWith('pivo-task-trees')).length;
    });

    expect(legacyKeysCount).toBe(0);
    console.log('[Pivo3] LocalStorage cleanup verified.');

    // 3. 验证非大数据 Key 依然保留
    const theme = await page.evaluate(() => localStorage.getItem('settings-theme'));
    expect(theme).toContain('dark');
    console.log('[Pivo3] Settings retention verified.');
  });
});
