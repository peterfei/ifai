import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  // 同时检查 Vite mode 和环境变量 APP_EDITION
  const isCommercial = mode === 'commercial' || process.env.APP_EDITION === 'commercial';
  // 🔥 检测是否在 E2E 测试环境
  const isE2E = process.env.NODE_ENV === 'test' || process.env.VITE_TEST_ENV === 'e2e';

  // 🔥 E2E 测试环境强制使用社区模式（私有库不存在）
  const shouldUsePrivateCore = isCommercial && !isE2E;

  return {
    plugins: [react()],
    define: {
      'process.env.APP_EDITION': JSON.stringify(process.env.APP_EDITION || mode)
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
    optimizeDeps: {
      exclude: ['@tauri-apps/api', '@tauri-apps/plugin-fs'],
      include: ['monaco-editor'],
    },
    // Build options for Tauri
    build: {
      rollupOptions: {
        // Externalize Tauri plugins (provided at runtime)
        external: ['@tauri-apps/plugin-fs'],
      },
    },
  };
});