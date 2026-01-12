/**
 * 测试环境配置
 *
 * 统一管理 E2E 测试的环境变量和配置
 */

/**
 * 应用版本类型
 */
export type AppEdition = 'community' | 'commercial';

/**
 * 测试环境类型
 */
export type TestEnvironment = 'local' | 'ci' | 'staging' | 'production';

/**
 * 浏览器类型
 */
export type TestBrowser = 'chromium' | 'firefox' | 'webkit';

/**
 * 测试环境配置接口
 */
export interface TestEnvironmentConfig {
  /** 应用版本 */
  edition: AppEdition;

  /** 测试环境类型 */
  environment: TestEnvironment;

  /** 基础 URL */
  baseURL: string;

  /** 是否启用调试模式 */
  debug: boolean;

  /** 是否启用视频录制 */
  recordVideo: boolean;

  /** 是否启用截图 */
  screenshot: 'off' | 'on' | 'only-on-failure';

  /** 超时配置 */
  timeouts: {
    /** 测试超时 (ms) */
    test: number;
    /** 导航超时 (ms) */
    navigation: number;
    /** 动作超时 (ms) */
    action: number;
    /** 期望超时 (ms) */
    expectation: number;
  };

  /** 重试次数 */
  retries: number;

  /** 并发工作进程数 */
  workers: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: TestEnvironmentConfig = {
  edition: 'community',
  environment: 'local',
  baseURL: 'http://localhost:1420',
  debug: false,
  recordVideo: false,
  screenshot: 'only-on-failure',
  timeouts: {
    test: 60 * 1000,
    navigation: 30 * 1000,
    action: 15 * 1000,
    expectation: 10 * 1000,
  },
  retries: 0,
  workers: 4,
};

/**
 * 从环境变量读取配置
 */
export function getTestEnvironmentConfig(): TestEnvironmentConfig {
  const config = { ...DEFAULT_CONFIG };

  // 读取应用版本
  const edition = (process.env.APP_EDITION || process.env.TEST_EDITION || 'community').toLowerCase();
  if (edition === 'commercial' || edition === 'community') {
    config.edition = edition as AppEdition;
  } else {
    console.warn(`Invalid APP_EDITION value: ${edition}, defaulting to community`);
    config.edition = 'community';
  }

  // 读取测试环境
  const environment = (process.env.TEST_ENV || process.env.NODE_ENV || 'local').toLowerCase();
  if (['local', 'ci', 'staging', 'production'].includes(environment)) {
    config.environment = environment as TestEnvironment;
  }

  // 读取基础 URL
  if (process.env.BASE_URL) {
    config.baseURL = process.env.BASE_URL;
  }

  // 读取调试模式
  if (process.env.TEST_DEBUG === 'true' || process.env.DEBUG === 'true') {
    config.debug = true;
  }

  // 读取视频录制
  if (process.env.RECORD_VIDEO === 'true') {
    config.recordVideo = true;
  }

  // 读取截图配置
  if (process.env.SCREENSHOT) {
    const value = process.env.SCREENSHOT.toLowerCase();
    if (value === 'on' || value === 'off' || value === 'only-on-failure') {
      config.screenshot = value as TestEnvironmentConfig['screenshot'];
    }
  }

  // 读取超时配置
  if (process.env.TEST_TIMEOUT) {
    config.timeouts.test = parseInt(process.env.TEST_TIMEOUT, 10);
  }
  if (process.env.NAVIGATION_TIMEOUT) {
    config.timeouts.navigation = parseInt(process.env.NAVIGATION_TIMEOUT, 10);
  }
  if (process.env.ACTION_TIMEOUT) {
    config.timeouts.action = parseInt(process.env.ACTION_TIMEOUT, 10);
  }

  // 读取重试次数
  if (process.env.TEST_RETRIES) {
    config.retries = parseInt(process.env.TEST_RETRIES, 10);
  }

  // 读取并发数
  if (process.env.TEST_WORKERS) {
    const workers = process.env.TEST_WORKERS.toLowerCase();
    if (workers === '50%') {
      config.workers = Math.max(1, Math.floor(require('os').cpus().length / 2));
    } else {
      config.workers = parseInt(workers, 10);
    }
  }

  // CI 环境自动调整
  if (config.environment === 'ci') {
    config.retries = config.retries || 2;
    config.workers = config.workers || 2;
    config.recordVideo = true;
  }

  return config;
}

/**
 * 获取当前应用版本
 */
export function getAppEdition(): AppEdition {
  return getTestEnvironmentConfig().edition;
}

/**
 * 检查是否为商业版
 */
export function isCommercialEdition(): boolean {
  return getAppEdition() === 'commercial';
}

/**
 * 检查是否为社区版
 */
export function isCommunityEdition(): boolean {
  return getAppEdition() === 'community';
}

/**
 * 检查是否为 CI 环境
 */
export function isCIEnvironment(): boolean {
  return process.env.CI === 'true' || getTestEnvironmentConfig().environment === 'ci';
}

/**
 * 检查是否启用调试模式
 */
export function isDebugEnabled(): boolean {
  return getTestEnvironmentConfig().debug;
}

/**
 * 获取环境变量摘要（用于日志）
 */
export function getEnvironmentSummary(): string {
  const config = getTestEnvironmentConfig();

  return `
========================================
Test Environment Summary
========================================
Edition:        ${config.edition}
Environment:     ${config.environment}
Base URL:        ${config.baseURL}
Debug Mode:      ${config.debug}
Video Recording: ${config.recordVideo}
Screenshots:     ${config.screenshot}
Timeouts:
  - Test:        ${config.timeouts.test}ms
  - Navigation:  ${config.timeouts.navigation}ms
  - Action:      ${config.timeouts.action}ms
Retries:        ${config.retries}
Workers:        ${config.workers}
========================================
`;
}

/**
 * 设置环境变量（用于测试前）
 */
export function setTestEnvironment(edition: AppEdition): void {
  process.env.APP_EDITION = edition;
  process.env.E2E_TEST = 'true';
}

/**
 * 验证环境配置
 */
export function validateEnvironmentConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const config = getTestEnvironmentConfig();

  // 验证基础 URL
  try {
    new URL(config.baseURL);
  } catch {
    errors.push(`Invalid baseURL: ${config.baseURL}`);
  }

  // 验证超时配置
  if (config.timeouts.test < 1000) {
    errors.push('Test timeout too low (minimum 1000ms)');
  }
  if (config.timeouts.navigation < 1000) {
    errors.push('Navigation timeout too low (minimum 1000ms)');
  }
  if (config.timeouts.action < 1000) {
    errors.push('Action timeout too low (minimum 1000ms)');
  }

  // 验证并发数
  if (config.workers < 1) {
    errors.push('Workers must be at least 1');
  }
  if (config.workers > 16) {
    errors.push('Workers too high (maximum 16)');
  }

  // 验证重试次数
  if (config.retries < 0 || config.retries > 5) {
    errors.push('Retries must be between 0 and 5');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 导出配置供 Playwright 使用
 */
export const testConfig = getTestEnvironmentConfig();

/**
 * 导出便捷函数
 */
export const env = {
  getAppEdition,
  isCommercialEdition,
  isCommunityEdition,
  isCIEnvironment,
  isDebugEnabled,
  getEnvironmentSummary,
  setTestEnvironment,
  validateEnvironmentConfig,
};
