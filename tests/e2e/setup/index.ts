/**
 * E2E 测试设置 - 统一导出模块
 *
 * 提供模块化的 E2E 测试设置功能，同时保持向后兼容性。
 *
 * @module setup
 */

// 导出配置类型和函数
export {
  loadE2EConfig,
  buildRuntimeConfig,
  getRealAIProviderConfig,
  type E2ETestEnvironmentOptions,
  type RealAIConfig
} from './env-config.js';

// 导出主要的设置函数（向后兼容）
// 这个函数会使用 setup-utils.ts 中的实现
export { setupE2ETestEnvironment, removeJoyrideOverlay, safeClick, skipOnboardingTour } from '../setup-utils.js';

// 重新导出类型以保持向后兼容
export type { E2ETestEnvironmentOptions } from '../setup-utils.js';

/**
 * 获取真实 AI 配置（在测试中使用）
 *
 * 这个辅助函数从页面中提取真实 AI 配置
 *
 * @example
 * ```typescript
 * const config = await getRealAIConfig(page);
 * await page.evaluate(async (payload) => {
 *   const chatStore = (window as any).__chatStore;
 *   await chatStore.getState().sendMessage(
 *     payload.text,
 *     payload.providerId,
 *     payload.modelId
 *   );
 * }, { text: 'prompt', providerId: config.providerId, modelId: config.modelId });
 * ```
 */
export async function getRealAIConfig(page: any): Promise<{
  providerId: string;
  modelId: string;
}> {
  return page.evaluate(() => {
    const config = (window as any).__E2E_REAL_AI_CONFIG__;
    return {
      providerId: (config as any)?.providerId || 'real-ai-e2e',
      modelId: (config as any)?.realAIModel || 'deepseek-chat'
    };
  });
}
