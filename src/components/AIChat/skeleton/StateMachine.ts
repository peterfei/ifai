/**
 * 状态机引擎实现
 *
 * 元编程架构核心：通用状态机解释器
 * 通过配置定义状态转换逻辑，避免过程化代码
 */

import {
  IStateMachine,
  LoadingPhase,
  LoadingEvent,
  StateMachineConfig,
  StateMachineOptions,
  StateMachineSnapshot,
  StateTransitionEvent,
  StateMachineError,
} from './StateMachineTypes';

/**
 * 状态机实现
 */
export class StateMachine implements IStateMachine {
  private currentPhase: LoadingPhase;
  private transitionCount = 0;
  private history: StateTransitionEvent[] = [];
  private lastTransitionTime: number | null = null;
  private isRunning = false;
  private rafId: number | null = null;

  private readonly phaseConfigs: Map<LoadingPhase, StateMachineConfig[number]>;
  private readonly options: Required<StateMachineOptions>;

  constructor(config: StateMachineConfig, options: StateMachineOptions = {}) {
    // 验证配置
    this.validateConfig(config);

    // 初始化阶段配置映射
    this.phaseConfigs = new Map();
    for (const phaseConfig of config) {
      this.phaseConfigs.set(phaseConfig.phase, phaseConfig);
    }

    // 初始化选项
    this.options = {
      maxTransitions: options.maxTransitions ?? 100,
      debug: options.debug ?? false,
      onTransition: options.onTransition ?? (() => {}),
    };

    // 初始状态为第一个配置的阶段
    this.currentPhase = config[0]?.phase ?? 'initial';

    this.log('StateMachine initialized', { currentPhase: this.currentPhase });
  }

  /**
   * 获取当前状态
   */
  getCurrentPhase(): LoadingPhase {
    return this.currentPhase;
  }

  /**
   * 触发状态转换
   */
  transition(event: LoadingEvent): void {
    const currentConfig = this.phaseConfigs.get(this.currentPhase);
    if (!currentConfig) {
      throw new StateMachineError(
        `Invalid current phase: ${this.currentPhase}`,
        'INVALID_STATE'
      );
    }

    const targetPhase = currentConfig.transitions[event];
    if (!targetPhase) {
      this.log(`No transition for event ${event} from phase ${this.currentPhase}`);
      return;
    }

    this.performTransition(this.currentPhase, targetPhase, event);
  }

  /**
   * 自动检测并转换状态
   */
  tick(): void {
    for (const [phase, config] of this.phaseConfigs) {
      if (config.detect()) {
        if (phase !== this.currentPhase) {
          // 找到第一个匹配的状态，直接切换
          const fromConfig = this.phaseConfigs.get(this.currentPhase);
          const toConfig = this.phaseConfigs.get(phase);

          if (fromConfig && toConfig) {
            this.performTransition(this.currentPhase, phase as LoadingPhase, 'detect' as LoadingEvent);
          }
        }
        break;
      }
    }
  }

  /**
   * 启动自动检测循环
   */
  start(): void {
    if (this.isRunning) {
      this.log('StateMachine already running');
      return;
    }

    this.isRunning = true;
    this.log('StateMachine started');

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
   * 停止自动检测循环
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

    this.log('StateMachine stopped');
  }

  /**
   * 获取状态快照
   */
  getSnapshot(): StateMachineSnapshot {
    return {
      currentPhase: this.currentPhase,
      transitionCount: this.transitionCount,
      history: [...this.history],
      lastTransitionTime: this.lastTransitionTime,
    };
  }

  /**
   * 重置状态机
   */
  reset(): void {
    this.stop();
    this.currentPhase = 'initial';
    this.transitionCount = 0;
    this.history = [];
    this.lastTransitionTime = null;
    this.log('StateMachine reset');
  }

  /**
   * 执行状态转换
   * @internal
   */
  private performTransition(
    from: LoadingPhase,
    to: LoadingPhase,
    trigger: LoadingEvent
  ): void {
    // 检查最大转换次数
    if (this.transitionCount >= this.options.maxTransitions) {
      throw new StateMachineError(
        `Max transitions (${this.options.maxTransitions}) exceeded`,
        'MAX_TRANSITIONS_EXCEEDED'
      );
    }

    // 执行 exit 钩子
    const fromConfig = this.phaseConfigs.get(from);
    fromConfig?.exit?.();

    // 转换状态
    const oldPhase = this.currentPhase;
    this.currentPhase = to;
    this.transitionCount++;
    this.lastTransitionTime = Date.now();

    // 记录转换事件
    const event: StateTransitionEvent = {
      from,
      to,
      trigger,
      timestamp: this.lastTransitionTime,
    };
    this.history.push(event);

    // 执行 enter 钩子
    const toConfig = this.phaseConfigs.get(to);
    toConfig?.enter?.();

    // 触发监听器
    this.options.onTransition(event);

    this.log('State transition', { from, to, trigger, count: this.transitionCount });
  }

  /**
   * 转换到指定状态
   * @internal
   */
  private transitionTo(phase: LoadingPhase, trigger: LoadingEvent): void {
    const targetConfig = this.phaseConfigs.get(phase);
    if (!targetConfig) {
      throw new StateMachineError(
        `Invalid target phase: ${phase}`,
        'INVALID_STATE'
      );
    }

    this.performTransition(this.currentPhase, phase, trigger);
  }

  /**
   * 验证配置
   * @internal
   */
  private validateConfig(config: StateMachineConfig): void {
    if (config.length === 0) {
      throw new StateMachineError(
        'State machine config cannot be empty',
        'INVALID_STATE'
      );
    }

    const phases = new Set<LoadingPhase>();
    for (const phaseConfig of config) {
      if (phases.has(phaseConfig.phase)) {
        throw new StateMachineError(
          `Duplicate phase: ${phaseConfig.phase}`,
          'INVALID_STATE'
        );
      }
      phases.add(phaseConfig.phase);
    }
  }

  /**
   * 调试日志
   * @internal
   */
  private log(message: string, data?: any): void {
    if (this.options.debug) {
      console.log(`[StateMachine] ${message}`, data ?? '');
    }
  }
}
export { StateMachineError };
