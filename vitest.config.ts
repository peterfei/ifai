/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'ifainew-core': path.resolve(__dirname, '../ifainew-core/typescript/src'),
      // 在测试中，私有库指向占位模块
      '@ifai/core/commandBar': path.resolve(__dirname, './src/core/commandBar/pro-placeholder'),
      // 确保 Tauri API 从应用层解析
      '@tauri-apps/api': path.resolve(__dirname, './node_modules/@tauri-apps/api'),
    },
    // 确保从应用层的 node_modules 解析依赖
    conditions: ['module', 'import', 'browser'],
  },
  optimizeDeps: {
    include: ['@tauri-apps/api'],
    exclude: ['ifainew-core'],
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './tests/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'tests/e2e/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/setup.ts', 'src/vite-env.d.ts', 'tests/e2e/**'],
    },
  },
});
