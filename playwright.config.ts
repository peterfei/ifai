import { defineConfig, devices } from '@playwright/test';
import { getTestEnvironmentConfig } from './tests/e2e/config/test-environment';

/**
 * 读取测试环境配置
 */
const testConfig = getTestEnvironmentConfig();

/**
 * Playwright E2E测试配置
 *
 * 优化要点：
 * - 分层测试支持（@fast, @medium, @slow, @regression）
 * - 多种报告格式（HTML、GitHub、JSON）
 * - CI/CD环境优化
 * - 失败时截图、视频、trace记录
 * - 合理的超时和重试策略
 * - 环境变量统一管理
 * - 测试覆盖率报告支持
 */
export default defineConfig({
  // 🏆 PIVO 3.0: 统一测试根目录
  testDir: './tests',

  // 包含 core (金标准) 和 e2e 目录
  testMatch: [
    'tests/core/**/*.spec.ts',
    'tests/reproduction/**/*.spec.ts',
    'tests/e2e/**/*.spec.ts'
  ],

  // 排除模板、版本归档、依赖真实AI、过时/不稳定的测试 (2026-04-14 更新)
  testIgnore: [
    // ---- 模板文件 ----
    '**/templates/**',

    // ---- 版本归档目录 (过时) ----
    'tests/e2e/v0.2.9/**',
    'tests/e2e/v0.3.0/**',
    'tests/e2e/v0.3.1/**',
    'tests/e2e/v0_3_3/**',
    'tests/e2e/v0.3.3/**',

    // ---- 依赖真实 AI/LLM 后端 ----
    'tests/e2e/agent_tools_regression.spec.ts',
    'tests/e2e/agent-file-reading/**',
    'tests/e2e/agent/**',
    'tests/e2e/approval-policy-p0.spec.ts',
    'tests/e2e/chat-store/agent-high-fidelity-v2.spec.ts',
    'tests/e2e/chat-store/agent-tool-fidelity.spec.ts',
    'tests/e2e/chat-store/full-pipeline-orchestration.spec.ts',
    'tests/e2e/chat-store/orchestrator-intent.spec.ts',
    'tests/e2e/chat-store/persistence-transaction.spec.ts',
    'tests/e2e/chat-store/streaming-signal-fidelity.spec.ts',
    'tests/e2e/composer-real-ai.spec.ts',
    'tests/e2e/composer-real-filesystem.spec.ts',
    'tests/e2e/debug-full-pipeline.spec.ts',
    'tests/e2e/integration/commercial-inline-full-chain.spec.ts',
    'tests/e2e/integration/real-llm-clean-flow.spec.ts',
    'tests/e2e/integration/tauri-commercial-real-llm.spec.ts',
    'tests/e2e/regression/agent-real-llm-scenario.spec.ts',
    'tests/e2e/regression/agent-zhipu-real-llm.spec.ts',
    'tests/e2e/regression/empty-bubble-real-llm.spec.ts',
    'tests/e2e/regression/message-disconnect-real-llm-simple.spec.ts',
    'tests/e2e/regression/real-ai-char-array.spec.ts',
    'tests/e2e/regression/user-message-display-real-llm.spec.ts',
    'tests/e2e/section5/auto-compression-real.spec.ts',
    'tests/e2e/ui/test-thread-title-real-llm.spec.ts',
    'tests/e2e/vibe_mode_auto_approve.spec.ts',
    'tests/e2e/workflow/workflow-real-backend-verification.spec.ts',
    'tests/e2e/workflow/workflow-real-llm-flow.spec.ts',
    'tests/e2e/workflow/workflow-real-llm-monitor.spec.ts',
    'tests/e2e/workflow/workflow-refresh-persistence-real.spec.ts',
    'tests/e2e/workflow/workflow-streaming-sse-real.spec.ts',

    // ---- 过时/不稳定/复杂 mock ----
    'tests/e2e/composer-accept-reject-cycle.spec.ts',
    'tests/e2e/composer-conflict-detection.spec.ts',
    'tests/e2e/diff/diff-summary-accuracy.spec.ts',
    'tests/e2e/dual_mode_*.spec.ts',
    'tests/e2e/editor/tab-context-menu.spec.ts',
    'tests/e2e/performance_regression.spec.ts',
    'tests/e2e/regression/agent-diff-after-refactor.spec.ts',
    'tests/e2e/regression/agent-streaming-verification.spec.ts',
    'tests/e2e/regression/agent-tool-approval.spec.ts',
    'tests/e2e/regression/test-tool-approval-flow.spec.ts',
    'tests/e2e/regression/test-tool-terminal-state.spec.ts',
    'tests/e2e/repro_deepseek_tool_fail.spec.ts',
    'tests/e2e/settings/auto-approve-*.spec.ts',
    'tests/e2e/tools/file-read-result.spec.ts',
    'tests/e2e/ui/image_*.spec.ts',
    'tests/e2e/ui/repro-styling-issue.spec.ts',
    'tests/e2e/ui/sidebar_optimization.spec.ts',

    // ---- 诊断/调试类 (非回归测试) ----
    'tests/e2e/debug-event-id.spec.ts',
    'tests/e2e/debug-rollback-ui.spec.ts',
    'tests/e2e/debug-tool-display.spec.ts',
    'tests/e2e/workflow/workflow-debug-events.spec.ts',
    'tests/e2e/workflow/workflow-diagnostic*.spec.ts',
    'tests/e2e/workflow/workflow-streaming-diagnostic.spec.ts',
    'tests/e2e/workflow/workflow-timing-diagnostic.spec.ts',
    'tests/e2e/workflow/workflow-ui-render-debug.spec.ts',
    'tests/e2e/stream-ordering/debug-events.spec.ts',

    // ---- 压力/性能测试 (需要专门环境) ----
    'tests/e2e/chat/stress-test.spec.ts',
    'tests/e2e/chat/scroll-performance.spec.ts',
    'tests/e2e/performance_stress.spec.ts',
    'tests/e2e/performance/file-read-performance.spec.ts',
    'tests/e2e/tools/bash-tool-perf.spec.ts',

    // ---- TDD RED 测试 (功能尚未实现) ----
    'tests/e2e/section2/access-control.spec.ts',
    'tests/e2e/section3/p3-tool-system-ui.spec.ts',
    'tests/e2e/section4/import-export.spec.ts',
    'tests/e2e/section5/conversation-summary.spec.ts',
    'tests/e2e/section5/auto-compression.spec.ts',
    'tests/e2e/section5/validation.spec.ts',
    'tests/e2e/workflow/workflow-streaming-red-green.spec.ts',

    // ---- 依赖智谱 API (需要有效 ZHIPU_API_KEY) ----
    'tests/e2e/regression/zhipu-api-error-display.spec.ts',
    'tests/e2e/regression/zhipu-tool-choice-param.spec.ts',
    'tests/e2e/reproduction/zhipu-write-failure.spec.ts',
    'tests/e2e/regression/agent-zhipu-dedup-test.spec.ts',
    'tests/e2e/regression/agent-zhipu-real-scenario-debug.spec.ts',
    'tests/e2e/regression/agent-zhipu-streaming-format-test.spec.ts',
    'tests/e2e/regression/agent-zhipu-tools-debug.spec.ts',
    'tests/e2e/regression/agent-zhipu-tool-check.spec.ts',
    'tests/e2e/regression/agent-zhipu-api-format-test.spec.ts',
    'tests/e2e/regression/agent-zhipu-approval-redirect.spec.ts',
    'tests/e2e/regression/zhipu-todowrite-functionality.spec.ts',

    // ---- 依赖真实 AI/LLM 后端 (第二轮排除) ----
    'tests/e2e/regression/file-tree-refresh-after-write.spec.ts',
    'tests/e2e/regression/task-continuation-after-todowrite.spec.ts',
    'tests/e2e/p2-todowrite.spec.ts',

    // ---- 诊断/调试类 (非回归测试) ----
    'tests/e2e/stream-ordering/direct-controller.spec.ts',
    'tests/e2e/streaming/snapshot-comparison.spec.ts',
    'tests/e2e/reproduction/typewriter-effect.spec.ts',
    'tests/e2e/reproduction/pivo-tree-rendering.spec.ts',
  ],

  // 完全并行执行测试
  fullyParallel: true,

  // CI环境下禁止使用 test.only
  forbidOnly: !!process.env.CI,

  // 重试策略
  retries: testConfig.retries,

  // 并发工作进程数
  workers: testConfig.workers,

  // 全局超时设置（单个测试的最大执行时间）
  timeout: testConfig.timeouts.test,

  // 期望超时（断言超时）
  expect: {
    timeout: testConfig.timeouts.expectation,
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
    baseURL: testConfig.baseURL,

    // 截图配置
    screenshot: testConfig.screenshot,

    // 视频录制配置
    video: testConfig.recordVideo ? 'retain-on-failure' : 'off',

    // Trace配置（用于调试）
    trace: testConfig.debug ? 'retain-on-failure' : 'on-first-retry',

    // 浏览器上下文配置
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,

    // 导航超时
    navigationTimeout: testConfig.timeouts.navigation,

    // 动作超时
    actionTimeout: testConfig.timeouts.action,
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
    // 🔥 FIX v0.3.8: 支持使用真实 Tauri 后端进行 E2E 测试
    // 通过环境变量 TAURI_DEV=true 启用真实 Tauri 后端
    // 例如: TAURI_DEV=true npm run test:e2e
    //
    // 🔥 FIX v0.3.8.1: Agent 功能只在 commercial 版本中可用
    // 当使用 TAURI_DEV=true 时，强制使用 commercial 版本
    //
    // 🔥 CRITICAL FIX: 使用真实 Tauri 后端时，不设置 VITE_TEST_ENV=e2e
    // 这样可以避免触发 Tauri mock，从而执行真实的后端命令
    command: process.env.TAURI_DEV === 'true'
      ? 'APP_EDITION=commercial npm run tauri:dev:commercial-local-llm'
      : (testConfig.edition === 'commercial'
          ? 'APP_EDITION=commercial VITE_TEST_ENV=e2e npm run dev'
          : 'APP_EDITION=community VITE_TEST_ENV=e2e npm run dev'),
    url: testConfig.baseURL,
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
    'Test Environment': testConfig.environment,
    'App Edition': testConfig.edition,
  },

  // 全局设置
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});
