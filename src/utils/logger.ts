/**
 * 🔥 生产环境日志系统
 *
 * 核心功能：
 * - 环境感知：开发环境启用详细日志，生产环境禁用
 * - 性能优化：支持节流，避免高频日志阻塞 UI
 * - 分类管理：不同模块可独立控制日志级别
 *
 * @example
 * ```typescript
 * import { createLogger } from './logger';
 *
 * const logger = createLogger('StreamingController');
 *
 * // 开发环境：打印日志
 * logger.debug('emitChunk:', { deltaIndex, deltaLength });
 *
 * // 生产环境：不打印（完全零开销）
 * ```
 */

// ============================================================================
// 类型定义
// ============================================================================

export enum LogLevel {
  /** 不打印任何日志 */
  SILENT = 0,
  /** 仅错误 */
  ERROR = 1,
  /** 错误和警告 */
  WARN = 2,
  /** 错误、警告和信息 */
  INFO = 3,
  /** 所有日志（包括调试） */
  DEBUG = 4,
}

export type LoggerCategory =
  | 'StreamingController'
  | 'StoreMapper'
  | 'ContentSegmentManager'
  | 'ToolCallManager'
  | 'MessageQueue'
  | 'PersistenceManager'
  | 'EventBus'
  | 'CrossThreadPersist'
  | 'Other';

// ============================================================================
// 全局配置
// ============================================================================

interface LoggerConfig {
  /** 全局日志级别 */
  globalLevel: LogLevel;
  /** 是否启用节流（高频日志自动节流） */
  enableThrottle: boolean;
  /** 节流时间间隔（毫秒） */
  throttleMs: number;
  /** 每个分类的独立级别（可选） */
  categoryLevels: Partial<Record<LoggerCategory, LogLevel>>;
  /** 是否启用时间戳 */
  enableTimestamp: boolean;
  /** 是否启用颜色（仅开发环境） */
  enableColors: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: LoggerConfig = {
  // 🔥 生产环境默认只显示错误和警告
  globalLevel: import.meta.env.MODE === 'production' ? LogLevel.WARN : LogLevel.DEBUG,

  // 高频日志节流（避免阻塞 UI）
  enableThrottle: true,
  throttleMs: 100, // 100ms 内相同日志只打印一次

  // 分类级别（可覆盖全局级别）
  categoryLevels: {
    // 流式相关：生产环境完全禁用（最高性能）
    StreamingController: import.meta.env.MODE === 'production' ? LogLevel.SILENT : LogLevel.DEBUG,
    StoreMapper: import.meta.env.MODE === 'production' ? LogLevel.SILENT : LogLevel.INFO,
    ContentSegmentManager: import.meta.env.MODE === 'production' ? LogLevel.SILENT : LogLevel.DEBUG,

    // 工具执行：生产环境只显示错误
    ToolCallManager: import.meta.env.MODE === 'production' ? LogLevel.ERROR : LogLevel.DEBUG,

    // 队列和持久化：生产环境显示警告
    MessageQueue: import.meta.env.MODE === 'production' ? LogLevel.WARN : LogLevel.DEBUG,
    PersistenceManager: import.meta.env.MODE === 'production' ? LogLevel.WARN : LogLevel.DEBUG,

    // 事件总线：生产环境显示错误
    EventBus: import.meta.env.MODE === 'production' ? LogLevel.ERROR : LogLevel.DEBUG,
  },

  enableTimestamp: import.meta.env.MODE !== 'production',
  enableColors: import.meta.env.MODE !== 'production',
};

let config: LoggerConfig = { ...DEFAULT_CONFIG };

// ============================================================================
// 节流管理器
// ============================================================================

class ThrottleManager {
  private lastCallTime = new Map<string, number>();

  shouldLog(category: LoggerCategory, level: LogLevel): boolean {
    if (!config.enableThrottle) {
      return true;
    }

    // 错误和警告不节流
    if (level <= LogLevel.WARN) {
      return true;
    }

    const key = `${category}:${level}`;
    const now = Date.now();
    const lastTime = this.lastCallTime.get(key) || 0;

    if (now - lastTime >= config.throttleMs) {
      this.lastCallTime.set(key, now);
      return true;
    }

    return false;
  }

  clear(): void {
    this.lastCallTime.clear();
  }
}

const throttleManager = new ThrottleManager();

// ============================================================================
// Logger 类
// ============================================================================

class Logger {
  constructor(private category: LoggerCategory) {}

  /**
   * 获取该分类的有效日志级别
   */
  private getEffectiveLevel(): LogLevel {
    return config.categoryLevels[this.category] ?? config.globalLevel;
  }

  /**
   * 判断是否应该打印日志
   */
  private shouldLog(level: LogLevel): boolean {
    const effectiveLevel = this.getEffectiveLevel();
    return level <= effectiveLevel && throttleManager.shouldLog(this.category, level);
  }

  /**
   * 格式化日志前缀
   */
  private formatPrefix(level: string): string {
    const timestamp = config.enableTimestamp ? `[${new Date().toISOString().split('T')[1].slice(0, -1)}] ` : '';
    const category = `[${this.category}]`;
    return `${timestamp}${category}`;
  }

  /**
   * 调试级别日志
   */
  debug(...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatPrefix('DEBUG'), ...args);
    }
  }

  /**
   * 信息级别日志
   */
  info(...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatPrefix('INFO'), ...args);
    }
  }

  /**
   * 警告级别日志
   */
  warn(...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatPrefix('WARN'), ...args);
    }
  }

  /**
   * 错误级别日志
   */
  error(...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatPrefix('ERROR'), ...args);
    }
  }

  /**
   * 性能追踪日志（仅在 DEBUG 级别）
   */
  perf(label: string, fn: () => void): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const start = performance.now();
      fn();
      const duration = performance.now() - start;
      this.debug(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
    } else {
      fn();
    }
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

const loggerCache = new Map<LoggerCategory, Logger>();

/**
 * 创建或获取 Logger 实例
 */
export function createLogger(category: LoggerCategory): Logger {
  if (!loggerCache.has(category)) {
    loggerCache.set(category, new Logger(category));
  }
  return loggerCache.get(category)!;
}

// ============================================================================
// 全局配置 API
// ============================================================================

/**
 * 更新日志配置
 */
export function updateLoggerConfig(partialConfig: Partial<LoggerConfig>): void {
  config = { ...config, ...partialConfig };
  throttleManager.clear();
}

/**
 * 设置全局日志级别
 */
export function setGlobalLogLevel(level: LogLevel): void {
  config.globalLevel = level;
  throttleManager.clear();
}

/**
 * 设置特定分类的日志级别
 */
export function setCategoryLogLevel(category: LoggerCategory, level: LogLevel): void {
  config.categoryLevels[category] = level;
  throttleManager.clear();
}

/**
 * 完全禁用所有日志（紧急情况使用）
 */
export function disableAllLogs(): void {
  config.globalLevel = LogLevel.SILENT;
  throttleManager.clear();
}

/**
 * 启用所有日志（调试用）
 */
export function enableAllLogs(): void {
  config.globalLevel = LogLevel.DEBUG;
  Object.keys(config.categoryLevels).forEach(key => {
    delete config.categoryLevels[key as LoggerCategory];
  });
  throttleManager.clear();
}

/**
 * 获取当前配置（只读）
 */
export function getLoggerConfig(): Readonly<LoggerConfig> {
  return { ...config };
}

// ============================================================================
// 开发环境快捷访问
// ============================================================================

/**
 * 开发者控制台快捷命令（仅开发环境）
 */
if (import.meta.env.MODE !== 'production' && typeof window !== 'undefined') {
  (window as any).__LOGGER_API = {
    setLevel: setGlobalLogLevel,
    setCategoryLevel: setCategoryLogLevel,
    disableAll: disableAllLogs,
    enableAll: enableAllLogs,
    getConfig: getLoggerConfig,
    LogLevel,
  };

  console.log('🔧 Logger API available at window.__LOGGER_API');
  console.log('   - setLevel(level): Set global log level');
  console.log('   - setCategoryLevel(category, level): Set category log level');
  console.log('   - disableAll(): Disable all logs');
  console.log('   - enableAll(): Enable all logs');
  console.log('   - getConfig(): Get current config');
  console.log('   - LogLevel: Enum of log levels');
}

// ============================================================================
// 导出便捷方法
// ============================================================================

/**
 * 快捷方法：直接创建并返回 logger
 */
export default createLogger;
