import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// 🔥 读取 package.json 获取版本号
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, './package.json'), 'utf-8'));
const appVersion = packageJson.version;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  // 同时检查 Vite mode 和环境变量 APP_EDITION
  const isCommercial = mode === 'commercial' || process.env.APP_EDITION === 'commercial';

  // 🔥 检测是否在 E2E 测试环境（多种检测方式，确保可靠性）
  // 1. 检查环境变量（NODE_ENV 或 VITE_TEST_ENV）
  // 2. 检查 .env.e2e 标记文件是否存在（作为后备方案）
  const hasTestEnv = process.env.NODE_ENV === 'test' || process.env.VITE_TEST_ENV === 'e2e';
  const e2eFlagPath = path.resolve(__dirname, './tests/e2e/.env.e2e');
  const hasE2EFlagFile = fs.existsSync(e2eFlagPath);
  const isE2E = hasTestEnv || hasE2EFlagFile;

  // 🔥 调试日志：总是输出 E2E 检测结果
  console.log('[Vite Config] E2E detection:', {
    NODE_ENV: process.env.NODE_ENV,
    VITE_TEST_ENV: process.env.VITE_TEST_ENV,
    APP_EDITION: process.env.APP_EDITION,
    mode,
    hasTestEnv,
    hasE2EFlagFile,
    e2eFlagPath,
    isE2E: isE2E
  });

  // 🔥 E2E 测试环境强制使用社区模式（私有库不存在）
  const shouldUsePrivateCore = isCommercial && !isE2E;
  const appEdition = process.env.APP_EDITION || mode;

  return {
    plugins: [react()],
    define: {
      'process.env.APP_EDITION': JSON.stringify(appEdition),
      'import.meta.env.APP_EDITION': JSON.stringify(appEdition),
      'import.meta.env.VITE_APP_EDITION': JSON.stringify(appEdition),
      // 🔥 注入版本号
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'process.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        // 🔥 商业版：指向 ifainew-core 目录（让 Vite 通过 package.json 解析入口点）
        // 社区版：使用 mock-core
        // E2E 测试：使用 mock-core（避免私有库路径问题）
        "ifainew-core": shouldUsePrivateCore
          ? path.resolve(__dirname, process.env.APP_CORE_PATH || "../ifainew-core/typescript")
          : path.resolve(__dirname, "./src/core/mock-core"),
        // 🔥 CommandBar 私有库：
        // - E2E 测试环境：始终使用占位模块
        // - 商业版（非 E2E）：指向真实私有库路径
        // - 社区版：使用占位模块
        "@ifai/core/commandBar": shouldUsePrivateCore
          ? path.resolve(__dirname, "../ifainew-core/typescript/src/commandBar")
          : path.resolve(__dirname, "./src/core/commandBar/pro-placeholder"),
        // 🔥 E2E 测试环境：使用 Tauri API mocks
        ...(isE2E ? {
          '@tauri-apps/api/event': path.resolve(__dirname, './src/tauri-mocks/api/event'),
          '@tauri-apps/api/window': path.resolve(__dirname, './src/tauri-mocks/api/window'),
          '@tauri-apps/api/app': path.resolve(__dirname, './src/tauri-mocks/api/app'),
          '@tauri-apps/api/core': path.resolve(__dirname, './src/tauri-mocks/api/core'),
          '@tauri-apps/plugin-fs': path.resolve(__dirname, './src/tauri-mocks/plugin-fs'),
          '@tauri-apps/plugin-dialog': path.resolve(__dirname, './src/tauri-mocks/plugin-dialog'),
          '@tauri-apps/plugin-shell': path.resolve(__dirname, './src/tauri-mocks/plugin-shell'),
          '@tauri-apps/plugin-os': path.resolve(__dirname, './src/tauri-mocks/plugin-os'),
        } : {})
      }
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
    // Configure worker handling
    worker: {
      format: 'es',
      plugins: () => [react()],
    },
    // Optimize dependencies
    // 🔥 E2E 测试环境：不要排除 Tauri API，让别名生效
    optimizeDeps: {
      exclude: isE2E
        ? []  // E2E: 允许所有 Tauri API 被处理（应用别名）
        : ['@tauri-apps/api', '@tauri-apps/plugin-fs'],  // 非E2E: 排除真实 Tauri API
      include: ['monaco-editor'],
    },
    // Build options for Tauri
    build: {
      rollupOptions: {
        // Externalize all Tauri plugins (provided at runtime)
        external: [
          '@tauri-apps/plugin-fs',
          '@tauri-apps/plugin-shell',
          '@tauri-apps/plugin-dialog',
          '@tauri-apps/plugin-os',
          '@tauri-apps/plugin-opener',
        ],
      },
    },
  };
});