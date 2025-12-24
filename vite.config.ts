import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  // 同时检查 Vite mode 和环境变量 APP_EDITION
  const isCommercial = mode === 'commercial' || process.env.APP_EDITION === 'commercial';

  return {
    plugins: [react()],
    define: {
      'process.env.APP_EDITION': JSON.stringify(process.env.APP_EDITION || mode)
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "ifainew-core": isCommercial
          ? path.resolve(__dirname, process.env.APP_CORE_PATH || "../ifainew-core/typescript")
          : path.resolve(__dirname, "./src/core/mock-core")
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
      exclude: ['@tauri-apps/api'],
      include: ['monaco-editor'],
    },
  };
});