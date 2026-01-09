import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E测试配置
 *
 * 优化要点：
 * - 分层测试支持（@fast, @medium, @slow, @regression）
 * - 多种报告格式（HTML、GitHub、JSON）
 * - CI/CD环境优化
 * - 失败时截图、视频、trace记录
 * - 合理的超时和重试策略
 */
export default defineConfig({
  // 测试目录
  testDir: './tests/e2e',

  // 完全并行执行测试
  fullyParallel: true,

  // CI环境下禁止使用 test.only
  forbidOnly: !!process.env.CI,

  // 重试策略
  retries: process.env.CI ? 2 : 0,

  // 并发工作进程数
  workers: process.env.CI ? 2 : 4,

  // 全局超时设置（单个测试的最大执行时间）
  timeout: 60 * 1000, // 60秒

  // 期望超时（断言超时）
  expect: {
    timeout: 10 * 1000, // 10秒
  },

  // 报告器配置
  reporter: [
    // HTML报告（适合本地开发）
    ['html', {
      open: 'never',
      outputFolder: 'test-results/html-report'
    }],
    // GitHub Actions报告（CI环境）
    ['github'],
    // JSON报告（用于分析）
    ['json', {
      outputFile: 'test-results/results.json'
    }],
    // 控制台报告
    ['list'],
  ],

  // 测试用例默认配置
  use: {
    // 基础URL
    baseURL: 'http://localhost:1420',

    // 截图配置
    screenshot: 'only-on-failure',

    // 视频录制配置
    video: 'retain-on-failure',

    // Trace配置（用于调试）
    trace: 'retain-on-failure',

    // 浏览器上下文配置
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,

    // 导航超时
    navigationTimeout: 30 * 1000, // 30秒

    // 动作超时
    actionTimeout: 15 * 1000, // 15秒
  },

  // 测试项目配置
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chromium特定配置
        launchOptions: {
          args: ['--disable-web-security'] // 如果需要测试跨域
        }
      },
    },

    // 可选：添加其他浏览器测试
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // 开发服务器配置
  webServer: {
    // 启动命令（商业模式 + E2E环境）
    command: 'APP_EDITION=commercial VITE_TEST_ENV=e2e npm run dev',
    url: 'http://localhost:1420',
    // 重用已存在的服务器（本地开发时）
    reuseExistingServer: !process.env.CI,
    // 服务器启动超时
    timeout: 120 * 1000, // 120秒
    // 日志输出
    stdout: 'pipe',
    stderr: 'pipe',
  },

  // 测试元数据
  metadata: {
    'E2E Test Suite': 'IFA Editor',
    'Test Environment': process.env.CI ? 'CI' : 'Local',
  },

  // 全局设置
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});
