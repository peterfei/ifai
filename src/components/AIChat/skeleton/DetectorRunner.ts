/**
 * 检测器执行器实现
 *
 * 元编程架构核心：通用检测器执行引擎
 * 通过配置定义状态检测规则，避免过程化检测逻辑
 */

import { LoadingEvent } from './StateMachineTypes';
import {
  DetectorConfig,
  DetectorState,
  DetectorRunnerOptions,
  IDetectorRunner,
  PathResolver,
  DefaultPathResolver,
  createDebounce,
  createThrottle,
  getDefaultGlobalObjects,
  GlobalObjects,
} from './DetectorTypes';

/**
 * 检测器包装器
 * @internal
 */
interface DetectorWrapper {
  config: DetectorConfig;
  state: DetectorState;
  pathResolver: PathResolver;
  debouncedDetect?: () => void;
  throttledDetect?: () => void;
}

/**
 * 检测器执行器实现
 */
export class DetectorRunner implements IDetectorRunner {
  private detectors: Map<LoadingEvent, DetectorWrapper> = new Map();
  private isRunning = false;
  private rafId: number | null = null;
  private startTime = 0;

  private readonly options: Required<DetectorRunnerOptions>;
  private readonly globalObjects: GlobalObjects;

  constructor(
    detectors: DetectorConfig[] = [],
    options: DetectorRunnerOptions = {}
  ) {
    this.options = {
      debug: options.debug ?? false,
      interval: options.interval ?? 16, // ~60fps
      onEvent: options.onEvent ?? (() => {}),
    };

    this.globalObjects = getDefaultGlobalObjects();

    // 添加检测器
    for (const config of detectors) {
      this.addDetector(config);
    }

    this.log('DetectorRunner initialized', { detectorCount: this.detectors.size });
  }

  /**
   * 启动检测循环
   */
  start(): void {
    if (this.isRunning) {
      this.log('DetectorRunner already running');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.log('DetectorRunner started');

    const loop = () => {
      if (!this.isRunning) {
        return;
      }

      this.tick();
      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  /**
   * 停止检测循环
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.log('DetectorRunner stopped');
  }

  /**
   * 手动触发一次检测
   */
  tick(): void {
    const elapsed = Date.now() - this.startTime;
    (this.globalObjects as any).__skeletonElapsed = elapsed;

    for (const wrapper of this.detectors.values()) {
      this.detectWrapper(wrapper);
    }
  }

  /**
   * 添加检测器
   */
  addDetector(config: DetectorConfig): void {
    if (this.detectors.has(config.event)) {
      this.log(`Detector for event ${config.event} already exists, skipping`);
      return;
    }

    const pathResolver = new DefaultPathResolver();
    const debouncedDetect = config.debounce
      ? createDebounce(() => this.detectAndTrigger(config, pathResolver), config.debounce)
      : undefined;

    const throttledDetect = config.debounce
      ? createThrottle(() => this.detectAndTrigger(config, pathResolver), config.debounce)
      : undefined;

    const wrapper: DetectorWrapper = {
      config,
      state: {
        config,
        currentValue: undefined,
        lastTriggerTime: 0,
        triggered: false,
      },
      pathResolver,
      debouncedDetect,
      throttledDetect,
    };

    this.detectors.set(config.event, wrapper);
    this.log(`Detector added for event ${config.event}`);
  }

  /**
   * 移除检测器
   */
  removeDetector(event: LoadingEvent): void {
    const removed = this.detectors.delete(event);
    if (removed) {
      this.log(`Detector removed for event ${event}`);
    }
  }

  /**
   * 获取所有检测器状态
   */
  getStates(): DetectorState[] {
    return Array.from(this.detectors.values()).map((wrapper) => wrapper.state);
  }

  /**
   * 检测包装器
   * @internal
   */
  private detectWrapper(wrapper: DetectorWrapper): void {
    if (wrapper.debouncedDetect) {
      wrapper.debouncedDetect();
    } else if (wrapper.throttledDetect) {
      wrapper.throttledDetect();
    } else {
      this.detectAndTrigger(wrapper.config, wrapper.pathResolver);
    }
  }

  /**
   * 检测并触发事件
   * @internal
   */
  private detectAndTrigger(config: DetectorConfig, pathResolver: PathResolver): void {
    try {
      // 解析路径
      const resolvedPath = pathResolver.parse(config.source);

      // 获取当前值
      const currentValue = pathResolver.resolve(this.globalObjects, resolvedPath);

      // 检查条件
      const conditionMet = config.condition(currentValue);

      // 更新状态
      const wrapper = this.detectors.get(config.event);
      if (wrapper) {
        wrapper.state.currentValue = currentValue;
      }

      // 触发事件
      if (conditionMet && !wrapper?.state.triggered) {
        this.triggerEvent(config.event, currentValue);
        if (wrapper) {
          wrapper.state.triggered = true;
          wrapper.state.lastTriggerTime = Date.now();
        }
      } else if (!conditionMet && wrapper?.state.triggered) {
        // 重置触发状态
        wrapper.state.triggered = false;
      }
    } catch (error) {
      this.log(`Error detecting event ${config.event}:`, error);
    }
  }

  /**
   * 触发事件
   * @internal
   */
  private triggerEvent(event: LoadingEvent, value: any): void {
    this.log(`Event triggered: ${event}`, { value });
    this.options.onEvent(event, value);
  }

  /**
   * 调试日志
   * @internal
   */
  private log(message: string, data?: any): void {
    if (this.options.debug) {
      console.log(`[DetectorRunner] ${message}`, data ?? '');
    }
  }
}

/**
 * 创建检测器执行器的便捷函数
 */
export function createDetectorRunner(
  detectors: DetectorConfig[],
  options?: DetectorRunnerOptions
): DetectorRunner {
  return new DetectorRunner(detectors, options);
}
