/**
 * 状态检测器类型定义
 *
 * 元编程架构核心：通过配置定义状态检测规则
 * 避免过程化检测逻辑，实现"检测器即数据"的设计理念
 */

import { LoadingEvent } from './StateMachineTypes';

/**
 * 路径解析结果
 * @internal
 */
export interface ResolvedPath {
  /** 路径分段 */
  segments: string[];
  /** 是否是全局路径（以 $ 开头） */
  isGlobal: boolean;
}

/**
 * 检测器配置
 *
 * @example
 * ```ts
 * const detector: DetectorConfig = {
 *   event: 'messages:loaded',
 *   source: '$chatStore.messages.length',
 *   condition: (v) => v > 0,
 *   debounce: 100,
 * };
 * ```
 */
export interface DetectorConfig {
  /** 触发的事件名称 */
  event: LoadingEvent;
  /** 数据源路径（支持 $ 前缀表示全局对象） */
  source: string;
  /** 条件判断函数 */
  condition: (value: any) => boolean;
  /** 防抖延迟（毫秒） */
  debounce?: number;
}

/**
 * 检测器状态
 * @internal
 */
export interface DetectorState {
  /** 配置 */
  config: DetectorConfig;
  /** 当前值 */
  currentValue: any;
  /** 上次触发时间 */
  lastTriggerTime: number;
  /** 是否已触发 */
  triggered: boolean;
}

/**
 * 检测器执行选项
 */
export interface DetectorRunnerOptions {
  /** 是否启用调试日志 */
  debug?: boolean;
  /** 检测间隔（毫秒） */
  interval?: number;
  /** 事件回调 */
  onEvent?: (event: LoadingEvent, value: any) => void;
}

/**
 * 路径解析器接口
 */
export interface PathResolver {
  /** 解析路径字符串 */
  parse(path: string): ResolvedPath;
  /** 从对象中获取路径值 */
  resolve(obj: any, path: ResolvedPath): any;
}

/**
 * 检测器执行器接口
 */
export interface IDetectorRunner {
  /** 启动检测循环 */
  start(): void;
  /** 停止检测循环 */
  stop(): void;
  /** 手动触发一次检测 */
  tick(): void;
  /** 添加检测器 */
  addDetector(config: DetectorConfig): void;
  /** 移除检测器 */
  removeDetector(event: LoadingEvent): void;
  /** 获取所有检测器状态 */
  getStates(): DetectorState[];
}

/**
 * 全局对象类型定义
 * 用于路径解析器
 */
export interface GlobalObjects {
  chatStore?: any;
  store?: any;
  inputReady?: boolean;
  elapsed?: number;
  [key: string]: any;
}

/**
 * 默认全局对象获取函数
 * @internal
 */
export function getDefaultGlobalObjects(): GlobalObjects {
  if (typeof window === 'undefined') {
    return {};
  }

  return {
    chatStore: (window as any).__chatStore,
    store: (window as any).__store,
    inputReady: (window as any).__inputReady,
    elapsed: (window as any).__skeletonElapsed,
  };
}

/**
 * 路径解析器实现
 * @internal
 */
export class DefaultPathResolver implements PathResolver {
  parse(path: string): ResolvedPath {
    const trimmedPath = path.trim();
    const isGlobal = trimmedPath.startsWith('$');

    const segments = isGlobal
      ? trimmedPath.substring(1).split('.')
      : trimmedPath.split('.');

    return { segments, isGlobal };
  }

  resolve(obj: any, path: ResolvedPath): any {
    if (path.isGlobal) {
      obj = getDefaultGlobalObjects();
    }

    let current = obj;
    for (const segment of path.segments) {
      if (current == null) {
        return undefined;
      }
      current = current[segment];
    }

    return current;
  }
}

/**
 * 防抖函数
 * @internal
 */
export function createDebounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * 节流函数
 * @internal
 */
export function createThrottle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number
): (...args: Parameters<T>) => void {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall >= interval) {
      fn.apply(this, args);
      lastCallTime = now;
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        fn.apply(this, args);
        lastCallTime = Date.now();
        timeoutId = null;
      }, interval - timeSinceLastCall);
    }
  };
}
