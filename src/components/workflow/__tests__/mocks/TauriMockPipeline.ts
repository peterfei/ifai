/**
 * Tauri API Mock 管线
 *
 * 解决 Tauri 架构约束，提供完整的测试环境 Mock
 * 用于在非 Tauri 环境（测试、浏览器）中运行 Tauri 组件
 */

import { vi } from 'vitest';

// ==================== 类型定义 ====================

export interface TauriEventListener {
  <T = any>(event: string, handler: (event: { payload: T }) => void): Promise<() => void>;
}

export interface TauriInvokeFunction {
  <T = any>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

// ==================== 测试事件总线 ====================

/**
 * 测试专用事件总线
 * 模拟 Tauri 的后端事件系统
 */
class TestEventBus {
  private listeners = new Map<string, Set<(event: { payload: any }) => void>>();

  /** 注册事件监听器 */
  on<T>(event: string, handler: (event: { payload: T }) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    // 返回取消监听函数
    return () => {
      this.off(event, handler);
    };
  }

  /** 取消事件监听器 */
  off<T>(event: string, handler: (event: { payload: T }) => void): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /** 触发事件（用于测试） */
  emit<T>(event: string, payload: T): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const eventWrapper = { payload };
      handlers.forEach((handler) => {
        try {
          handler(eventWrapper);
        } catch (error) {
          console.error(`[TestEventBus] Error in handler for ${event}:`, error);
        }
      });
    }
  }

  /** 清除所有监听器 */
  clear(): void {
    this.listeners.clear();
  }

  /** 获取监听器数量（用于调试） */
  getListenerCount(event: string): number {
    return this.listeners.get(event)?.size || 0;
  }

  /** 获取所有事件名称（用于调试） */
  getEventNames(): string[] {
    return Array.from(this.listeners.keys());
  }
}

// ==================== Tauri Mock 实现 ====================

/**
 * Tauri Invoke Mock
 * 模拟 Tauri 的命令调用功能
 */
const mockInvoke: TauriInvokeFunction = vi.fn((cmd: string, args?) => {
  console.warn(`[Tauri Mock] invoke called: ${cmd}`, args);
  return Promise.reject(new Error(`[Tauri Mock] Command '${cmd}' not implemented in test environment`));
});

/**
 * Tauri Event Mock
 * 模拟 Tauri 的事件监听功能
 */
function createMockListen(testEventBus: TestEventBus): TauriEventListener {
  return vi.fn(<T>(event: string, handler: (event: { payload: T }) => void) => {
    // 使用测试事件总线注册监听器
    const unlisten = testEventBus.on<T>(event, handler);

    // 返回 Promise，模拟 Tauri 的异步 API
    return Promise.resolve(unlisten);
  });
}

// ==================== Tauri 全局对象 Mock ====================

/**
 * 创建 Tauri 全局对象 Mock
 */
function createTauriGlobalMock() {
  return {
    __TAURI__: {
      core: {
        transformCallback: vi.fn((callback: any, _once: boolean = false) => {
          // 返回一个简单的回调 ID
          return Math.random();
        }),
        invoke: mockInvoke,
      },
      event: {
        listen: createMockListen(globalTestEventBus),
        emit: vi.fn((event: string, payload: any) => {
          // 使用测试事件总线触发事件
          globalTestEventBus.emit(event, payload);
          return Promise.resolve();
        }),
      },
    },
  };
}

// ==================== 全局测试事件总线 ====================

/** 全局测试事件总线实例 */
export const globalTestEventBus = new TestEventBus();

// ==================== Mock 管线初始化 ====================

/**
 * 初始化 Tauri Mock 管线
 *
 * 这个函数会：
 * 1. 创建 Tauri 全局对象 Mock
 * 2. 设置 Vitest 的自动 Mock
 * 3. 返回测试辅助函数
 */
export function setupTauriMockPipeline() {
  // 设置 Tauri 全局对象
  const tauriMock = createTauriGlobalMock();
  Object.assign(globalThis, tauriMock);

  // 设置 Vitest Mock
  vi.mock('@tauri-apps/api/core', () => ({
    invoke: mockInvoke,
  }));

  vi.mock('@tauri-apps/api/event', () => ({
    listen: createMockListen(globalTestEventBus),
    emit: vi.fn((event: string, payload: any) => {
      globalTestEventBus.emit(event, payload);
      return Promise.resolve();
    }),
  }));

  // 返回测试辅助函数
  return {
    /** 触发测试事件 */
    emitEvent: <T>(event: string, payload: T) => {
      globalTestEventBus.emit(event, payload);
    },

    /** 清除所有监听器 */
    clearListeners: () => {
      globalTestEventBus.clear();
    },

    /** 获取监听器数量 */
    getListenerCount: (event: string) => {
      return globalTestEventBus.getListenerCount(event);
    },

    /** 获取所有事件名称 */
    getEventNames: () => {
      return globalTestEventBus.getEventNames();
    },

    /** 检查是否有监听器 */
    hasListeners: (event: string) => {
      return globalTestEventBus.getListenerCount(event) > 0;
    },
  };
}

// ==================== 导出 ====================

export type { TauriEventListener, TauriInvokeFunction };
export { mockInvoke, createMockListen, createTauriGlobalMock };
export { globalTestEventBus as testEventBus };
