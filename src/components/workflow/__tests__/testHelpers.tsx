/**
 * Tauri API 测试辅助模块
 *
 * 提供测试环境下的 Tauri API Mock
 */

import { vi } from 'vitest';

// 全局事件监听器存储（用于测试）
const testEventListeners = new Map<string, Array<(event: any) => void>>();

/**
 * 清理测试事件监听器
 */
export function clearTestEventListeners() {
  testEventListeners.clear();
}

/**
 * 触发测试事件
 */
export function emitTestEvent(event: string, payload: any) {
  const listeners = testEventListeners.get(event) || [];
  listeners.forEach((handler) => {
    handler({ payload });
  });
}

/**
 * Mock Tauri invoke 函数
 */
export function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return Promise.reject(new Error(`Tauri invoke not implemented in test: ${cmd}`));
}

/**
 * Mock Tauri listen 函数
 */
export function mockListen<T>(
  event: string,
  handler: (event: { payload: T }) => void
): () => void {
  if (!testEventListeners.has(event)) {
    testEventListeners.set(event, []);
  }
  testEventListeners.get(event)!.push(handler);

  // 返回 unlisten 函数
  return () => {
    const listeners = testEventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(handler);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  };
}

/**
 * 设置测试环境
 */
export function setupTestEnvironment() {
  // 设置全局标记
  (window as any).__TAURI__ = {
    transformCallback: () => 1,
    addMessageListener: () => {},
  };

  return () => {
    delete (window as any).__TAURI__;
  };
}

// 自动设置测试环境
setupTestEnvironment();
