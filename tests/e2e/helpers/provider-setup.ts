/**
 * E2E 测试 Provider 配置辅助函数
 *
 * 用于在测试中设置测试用的 Provider 配置
 */

export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  apiKey?: string;
  isCustom?: boolean;
}

/**
 * 在 E2E 测试环境中配置一个测试 Provider
 */
export async function setupTestProvider(page: any) {
  await page.evaluate(() => {
    // 🔥 FIX: 设置 E2E 模式标志，确保工作流使用 Mock 执行
    (window as any).__E2E__ = true;
    console.log('[ProviderSetup] 🧪 E2E mode enabled');

    const settingsStore = (window as any).__settingsStore;
    if (!settingsStore) {
      console.error('[ProviderSetup] ❌ settingsStore not found');
      return false;
    }

    // 创建一个测试 Provider
    const testProvider: ProviderConfig = {
      id: 'test-e2e-provider',
      name: 'Test E2E Provider',
      enabled: true,
      apiKey: 'test-api-key-for-e2e',
      isCustom: false,
    };

    // 更新 settingsStore
    settingsStore.getState().updateSettings({
      providers: [testProvider],
      currentProviderId: 'test-e2e-provider',
      currentModel: 'test-model',
    });

    console.log('[ProviderSetup] ✅ Test provider configured:', testProvider);
    return true;
  });
}

/**
 * 获取当前的 Provider 配置
 */
export async function getCurrentProvider(page: any) {
  return await page.evaluate(() => {
    const settingsStore = (window as any).__settingsStore;
    if (!settingsStore) {
      return { error: 'settingsStore not found' };
    }

    const state = settingsStore.getState();
    return {
      currentProviderId: state.currentProviderId,
      currentModel: state.currentModel,
      providers: state.providers,
      hasProviders: state.providers && state.providers.length > 0,
    };
  });
}
