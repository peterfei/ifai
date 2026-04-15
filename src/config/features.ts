/**
 * Feature Flags 配置
 *
 * 用于控制实验性功能的开关
 * 支持通过环境变量或运行时配置动态切换
 *
 * @version 1.0.0
 */

// ============================================
// 类型定义
// ============================================

export interface FeatureFlags {
  /** 新滚动控制器（修复滚动失焦和卡顿） */
  newScrollController: boolean;
  /** 消息渲染注册表（优化渲染性能） */
  messageRenderRegistry: boolean;
  /** 流式虚拟滚动（长对话性能优化） */
  streamingVirtualScroll: boolean;
  /** StoreMapper 性能优化（减少 setState） */
  storeMapperOptimization: boolean;
  /** 打字机效果 */
  typewriterEffect: boolean;
}

// ============================================
// 默认配置
// ============================================

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  newScrollController: true,
  messageRenderRegistry: false, // 暂未完全实现
  streamingVirtualScroll: true,
  storeMapperOptimization: true,
  typewriterEffect: true,
};

// ============================================
// 环境变量覆盖
// ============================================

function getEnvFeatureFlags(): Partial<FeatureFlags> {
  if (typeof window === 'undefined') return {};

  const env = (window as any).__IFAI_FEATURE_FLAGS__ || {};

  return {
    newScrollController: env.FEATURE_NEW_SCROLL_CONTROLLER !== 'false',
    messageRenderRegistry: env.FEATURE_MESSAGE_RENDER_REGISTRY === 'true',
    streamingVirtualScroll: env.FEATURE_STREAMING_VIRTUAL_SCROLL !== 'false',
    storeMapperOptimization: env.FEATURE_STORE_MAPPER_OPTIMIZATION !== 'false',
    typewriterEffect: env.FEATURE_TYPEWRITER_EFFECT !== 'false',
  };
}

// ============================================
// 合并配置
// ============================================

export const featureFlags: FeatureFlags = {
  ...DEFAULT_FEATURE_FLAGS,
  ...getEnvFeatureFlags(),
};

// ============================================
// 运行时控制
// ============================================

let featureFlagOverrides: Partial<FeatureFlags> = {};

/**
 * 设置 feature flag 覆盖
 */
export function setFeatureFlag(flag: keyof FeatureFlags, value: boolean): void {
  featureFlagOverrides[flag] = value;
  (featureFlags as any)[flag] = value;
}

/**
 * 批量设置 feature flags
 */
export function setFeatureFlags(flags: Partial<FeatureFlags>): void {
  featureFlagOverrides = { ...featureFlagOverrides, ...flags };
  Object.assign(featureFlags, flags);
}

/**
 * 获取当前 feature flag 值
 */
export function getFeatureFlag(flag: keyof FeatureFlags): boolean {
  return featureFlags[flag];
}

/**
 * 重置为默认配置
 */
export function resetFeatureFlags(): void {
  featureFlagOverrides = {};
  Object.assign(featureFlags, DEFAULT_FEATURE_FLAGS);
}

/**
 * 获取所有 feature flags（用于调试）
 */
export function getAllFeatureFlags(): FeatureFlags {
  return { ...featureFlags };
}

// ============================================
// 开发者工具（仅开发环境）
// ============================================

if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as any).__IFAI_DEV_TOOLS__ = {
    ...(window as any).__IFAI_DEV_TOOLS__,
    featureFlags: {
      get: getAllFeatureFlags,
      set: setFeatureFlags,
      setAll: setFeatureFlags,
      reset: resetFeatureFlags,
    },
  };
}
