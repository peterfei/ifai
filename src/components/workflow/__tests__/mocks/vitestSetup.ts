/**
 * Vitest 全局设置 - Tauri Mock 管线
 *
 * 在所有测试之前运行
 */

import { vi } from 'vitest';

// ==================== 全局测试事件总线 ====================

class GlobalTestEventBus {
  private listeners = new Map<string, Set<any>>();

  on(event: string, handler: any): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  emit(event: string, payload: any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler({ payload });
        } catch (e) {
          console.error(`[TestEventBus] Error in handler for ${event}:`, e);
        }
      });
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  hasListeners(event: string): boolean {
    return (this.listeners.get(event)?.size || 0) > 0;
  }
}

// 创建全局实例
const globalTestEventBus = new GlobalTestEventBus();

// ==================== 设置全局 Tauri Mock ====================

Object.defineProperty(globalThis, '__TAURI__', {
  value: {
    core: {
      transformCallback: vi.fn(() => 1),
      invoke: vi.fn(),
    },
  },
  writable: true,
  configurable: true,
});

// ==================== Mock Tauri 模块 ====================

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: any) => {
    return Promise.resolve(globalTestEventBus.on(event, handler));
  }),
  emit: vi.fn((event: string, payload: any) => {
    globalTestEventBus.emit(event, payload);
    return Promise.resolve();
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// ==================== 导出全局测试辅助函数 ====================

(globalThis as any).__TEST_EVENT_BUS__ = globalTestEventBus;

// 在每个测试后清理
afterEach(() => {
  globalTestEventBus.clear();
});
