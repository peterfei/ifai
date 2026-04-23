/**
 * 📜 数据流日志装饰器（元编程）
 *
 * 核心功能：
 * - 自动追踪指定的字段
 * - 零侵入日志注入
 * - 性能监控
 * - 支持类和方法装饰
 *
 * @module LogDataFlow
 */

/**
 * 日志配置
 */
interface LogDataFlowConfig {
  /** 日志级别 */
  level?: 'debug' | 'info' | 'warn' | 'error';

  /** 追踪的字段列表 */
  trackFields?: string[];

  /** 是否追踪性能 */
  trackPerformance?: boolean;

  /** 慢执行阈值（毫秒） */
  slowExecutionThreshold?: number;
}

/**
 * 应用日志到单个方法
 */
function applyLogDecorator(
  target: any,
  key: string | symbol,
  descriptor: PropertyDescriptor,
  className: string,
  config: Required<LogDataFlowConfig>
): void {
  const originalMethod = descriptor.value;

  descriptor.value = function (this: any, ...args: any[]) {
    const startTime = Date.now();

    // 📊 自动追踪指定字段
    if (config.level === 'debug') {
      const trackedData: any = {};

      for (const arg of args) {
        if (arg && typeof arg === 'object') {
          for (const field of config.trackFields) {
            if (field in arg) {
              const value = arg[field];
              trackedData[field] = {
                hasValue: value !== undefined && value !== null,
                itemCount: Array.isArray(value) ? value.length : 0,
                types: Array.isArray(value)
                  ? value.map((c: any) => c.type || typeof c)
                  : typeof value,
              };
            }
          }
        }
      }

      if (Object.keys(trackedData).length > 0) {
        const methodName = String(key);
        console.log(`[${className}] 📸 [${methodName}] Data flow:`, trackedData);
      }
    }

    // 执行原方法
    const result = originalMethod.apply(this, args);

    // 性能监控
    if (config.trackPerformance) {
      const elapsed = Date.now() - startTime;
      if (elapsed > (config.slowExecutionThreshold || 100)) {
        console.warn(
          `[${className}] ⚠️ [${String(key)}] Slow execution: ${elapsed}ms`
        );
      }
    }

    return result;
  };

  Object.defineProperty(descriptor.value, 'name', { value: originalMethod.name });
}

/**
 * 数据流日志装饰器
 *
 * @example
 * ```typescript
 * // 应用到类（所有方法自动应用）
 * @LogDataFlow({ trackFields: ['multiModalContent'] })
 * class MyClass {
 *   myMethod(data: any) { ... }
 * }
 *
 * // 应用到方法
 * class MyClass {
 *   @LogDataFlow({ trackFields: ['multiModalContent'] })
 *   myMethod(data: any) { ... }
 * }
 * ```
 */
export function LogDataFlow(
  config: LogDataFlowConfig = {}
): any {
  const finalConfig: Required<LogDataFlowConfig> = {
    level: config.level || 'debug',
    trackFields: config.trackFields || ['multiModalContent'],
    trackPerformance: config.trackPerformance !== false,
    slowExecutionThreshold: config.slowExecutionThreshold || 100,
  };

  // 返回装饰器函数
  return function (
    target: any,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor
  ): any {
    // 装饰类：所有方法自动应用日志
    if (!propertyKey && !descriptor) {
      const className = target.name;
      for (const key of Object.getOwnPropertyNames(target.prototype)) {
        if (key !== 'constructor') {
          const methodDescriptor = Object.getOwnPropertyDescriptor(target.prototype, key);
          if (methodDescriptor?.value) {
            applyLogDecorator(target.prototype, key, methodDescriptor, className, finalConfig);
          }
        }
      }
      return target;
    }

    // 装饰方法
    if (descriptor?.value) {
      applyLogDecorator(
        target,
        propertyKey,
        descriptor,
        target.constructor?.name || 'Unknown',
        finalConfig
      );
    }

    return descriptor;
  };
}
