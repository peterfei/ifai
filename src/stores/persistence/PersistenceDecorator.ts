/**
 * 🔥 元编程持久化系统（Metaprogramming Persistence System）
 *
 * 核心哲学：
 * - "代码生成代码"：用配置代替过程式逻辑
 * - "声明式优先"：声明做什么，而非怎么做
 * - "DRY 极限化"：持久化逻辑只写一次
 *
 * @example
 * ```typescript
 * // ❌ 过程式（旧代码）
 * addMessage: (message) => {
 *   set({ messages: [...state.messages, message] });
 *   // ... 20 行持久化代码
 * }
 *
 * // ✅ 声明式（元编程）
 * @persist(PersistenceStrategies.debounce)
 * addMessage: (message) => {
 *   set({ messages: [...state.messages, message] });
 *   // 持久化自动化！
 * }
 * ```
 */

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 持久化策略配置
 */
export interface PersistenceStrategy {
  /** 延迟执行时间（毫秒）或特殊策略名 */
  delay: number | 'requestIdleCallback';
  /** 批处理配置 */
  batch?: boolean | 'same-thread' | { count: number };
  /** 降级延迟（用于 requestIdleCallback） */
  fallback?: number;
  /** 优先级（用于优先级队列） */
  priority?: 'high' | 'normal' | 'low';
}

/**
 * 持久化上下文
 */
interface PersistenceContext {
  threadId: string;
  methodName: string;
  timestamp: number;
}

// ============================================================================
// 策略库：声明式配置
// ============================================================================

/**
 * 📜 预定义策略库（开箱即用）
 */
export const PersistenceStrategies = {
  /**
   * 立即保存（默认）
   */
  immediate: {
    delay: 0,
    batch: false
  } as PersistenceStrategy,

  /**
   * 防抖保存（推荐用于用户输入）
   * 等待 500ms 无新操作后才保存
   */
  debounce: {
    delay: 500,
    batch: 'same-thread'
  } as PersistenceStrategy,

  /**
   * 空闲时保存（最佳用户体验）
   * 在浏览器空闲时执行，完全不阻塞 UI
   */
  idle: {
    delay: 'requestIdleCallback',
    batch: false,
    fallback: 100  // 100ms 后强制执行
  } as PersistenceStrategy,

  /**
   * 批量保存
   * 每 N 次调用触发一次保存
   */
  batch: (count: number = 10): PersistenceStrategy => ({
    delay: 0,
    batch: { count }
  }),

  /**
   * 激进防抖（更长的延迟）
   * 用于高频操作场景
   */
  aggressiveDebounce: {
    delay: 1000,
    batch: 'same-thread'
  } as PersistenceStrategy,

  /**
   * 保守防抖（更短的延迟）
   * 用于需要更快保存的场景
   */
  conservativeDebounce: {
    delay: 200,
    batch: 'same-thread'
  } as PersistenceStrategy
};

// ============================================================================
// 策略执行器：自动生成的逻辑（元编程核心）
// ============================================================================

/**
 * 🎭 策略执行器工厂
 * 返回实际执行持久化的函数
 */
class StrategyExecutorFactory {
  private static debounceTimers = new Map<string, any>();
  private static batchQueues = new Map<string, Set<any>>();
  private static batchCounters = new Map<string, number>();

  /**
   * 创建立即执行器
   */
  static createImmediate(executor: () => void): void {
    executor();
  }

  /**
   * 创建防抖执行器（同一线程批处理）
   */
  static createDebounce(
    threadId: string,
    delay: number,
    executor: () => void
  ): void {
    // 清除之前的定时器
    const existingTimer = this.debounceTimers.get(threadId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 设置新的定时器
    const timer = setTimeout(() => {
      executor();
      this.debounceTimers.delete(threadId);
    }, delay);

    this.debounceTimers.set(threadId, timer);
  }

  /**
   * 创建空闲时执行器
   */
  static createIdle(executor: () => void, fallback: number = 100): void {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(
        () => executor(),
        { timeout: fallback }
      );
    } else {
      // 降级方案
      setTimeout(() => executor(), fallback);
    }
  }

  /**
   * 创建批量执行器
   */
  static createBatch(
    threadId: string,
    batchSize: number,
    executor: () => void
  ): void {
    const currentCount = (this.batchCounters.get(threadId) || 0) + 1;
    this.batchCounters.set(threadId, currentCount);

    if (currentCount >= batchSize) {
      // 达到批量大小，执行保存
      executor();
      this.batchCounters.set(threadId, 0);
    }
  }

  /**
   * 创建同一线程批处理执行器
   */
  static createSameThreadBatch(
    threadId: string,
    delay: number,
    executor: () => void
  ): void {
    // 获取或创建该线程的队列
    let queue = this.batchQueues.get(threadId);
    if (!queue) {
      queue = new Set<any>();
      this.batchQueues.set(threadId, queue);
    }

    // 标记需要持久化
    queue.add({
      threadId,
      methodName: 'unknown',
      timestamp: Date.now()
    });

    // 清除之前的定时器
    const existingTimer = this.debounceTimers.get(threadId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 设置延迟执行
    const timer = setTimeout(() => {
      // 执行持久化
      executor();

      // 清空队列
      this.batchQueues.delete(threadId);
      this.debounceTimers.delete(threadId);
    }, delay);

    this.debounceTimers.set(threadId, timer);
  }

  /**
   * 清理资源（线程销毁时调用）
   */
  static cleanup(threadId: string): void {
    const timer = this.debounceTimers.get(threadId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(threadId);
    }

    this.batchQueues.delete(threadId);
    this.batchCounters.delete(threadId);
  }

  /**
   * 清理所有资源
   */
  static cleanupAll(): void {
    this.debounceTimers.forEach((timer, threadId) => {
      clearTimeout(timer);
    });
    this.debounceTimers.clear();
    this.batchQueues.clear();
    this.batchCounters.clear();
  }
}

// ============================================================================
// 🎭 持久化装饰器（高阶函数生成器）
// ============================================================================

/**
 * 🔧 持久化装饰器工厂
 *
 * 返回一个方法包装器，在原方法执行后自动应用持久化策略
 *
 * @param strategy 持久化策略配置
 * @returns 方法包装函数
 *
 * @example
 * ```typescript
 * // 在 Zustand store 中使用
 * import { persist } from './persistence/PersistenceDecorator';
 *
 * const useChatStore = create((set, get) => ({
 *   addMessage: persist(PersistenceStrategies.debounce)((message) => {
 *     set({ messages: [...get().messages, message] });
 *   })
 * }));
 * ```
 */
export function persist<T extends (...args: any[]) => any>(
  strategy: PersistenceStrategy
): (originalMethod: T) => T {
  return function (originalMethod: T): T {
    return function (this: any, ...args: any[]): any {
      // 1. 执行原始方法
      const result = originalMethod.apply(this, args);

      // 2. 提取线程ID（从 Zustand store 的 get 方法或直接从 this）
      const threadId = this.currentThreadId ??
                       this.getState?.()?.currentThreadId;

      if (!threadId) {
        // 无线程ID，跳过持久化
        return result;
      }

      // 3. 创建持久化执行器
      const executor = () => {
        // 动态导入避免循环依赖
        import('./threadPersistence')
          .then(({ autoSaveThread }) => {
            // 🔥 FIX: autoSaveThread 返回 void，不是 Promise
            // 直接调用，不处理返回值
            try {
              autoSaveThread(threadId);
            } catch (error) {
              console.error(`[Persist] Failed to save thread ${threadId}:`, error);
            }
          })
          .catch((error) => {
            console.error(`[Persist] Failed to import threadPersistence:`, error);
          });
      };

      // 4. 根据策略类型选择执行器
      if (typeof strategy.delay === 'number') {
        if (strategy.batch === 'same-thread') {
          // 防抖 + 批处理
          StrategyExecutorFactory.createSameThreadBatch(
            threadId,
            strategy.delay,
            executor
          );
        } else if (typeof strategy.batch === 'object' && 'count' in strategy.batch) {
          // 固定批量
          StrategyExecutorFactory.createBatch(
            threadId,
            strategy.batch.count,
            executor
          );
        } else {
          // 简单延迟
          setTimeout(executor, strategy.delay);
        }
      } else if (strategy.delay === 'requestIdleCallback') {
        // 空闲时执行
        StrategyExecutorFactory.createIdle(executor, strategy.fallback);
      } else {
        // 立即执行
        executor();
      }

      return result;
    } as any;
  };
}

/**
 * 🔧 创建持久化包装器（用于现有方法）
 *
 * @param originalMethod 原始方法
 * @param strategy 持久化策略
 * @returns 包装后的方法
 */
export function withPersistence<T extends (...args: any[]) => any>(
  originalMethod: T,
  strategy: PersistenceStrategy
): T {
  return persist(strategy).bind({ originalMethod }) as any;
}

// ============================================================================
// 🎯 辅助工具
// ============================================================================

/**
 * 清理指定线程的资源
 */
export function cleanupThreadPersistence(threadId: string): void {
  StrategyExecutorFactory.cleanup(threadId);
}

/**
 * 清理所有资源
 */
export function cleanupAllPersistence(): void {
  StrategyExecutorFactory.cleanupAll();
}

// ============================================================================
// 🎭 使用示例（文档）
// ============================================================================

/**
 * @example
 * ```typescript
 * import { persist, PersistenceStrategies } from './persistence/PersistenceDecorator';
 *
 * // ✅ 声明式持久化（推荐）
 * const useChatStore = create((set, get) => ({
 *   // 防抖保存（用户输入）
 *   addMessage: persist(PersistenceStrategies.debounce)((message) => {
 *     set({ messages: [...get().messages, message] });
 *   }),
 *
 *   // 空闲时保存（设置更新）
 *   updateSettings: persist(PersistenceStrategies.idle)((settings) => {
 *     set({ settings });
 *   }),
 *
 *   // 批量保存（高频操作）
 *   streamChunk: persist(PersistenceStrategies.batch(20))((chunk) => {
 *     // ...
 *   }),
 *
 *   // 立即保存（关键操作）
 *   deleteThread: persist(PersistenceStrategies.immediate)((threadId) => {
 *     // ...
 *   })
 * }));
 * ```
 */
