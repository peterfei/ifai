/**
 * 状态机引擎类型定义
 *
 * 元编程架构核心：通过配置定义状态转换逻辑
 * 避免过程化 if-else，实现"状态机即数据"的设计理念
 */

/**
 * 加载阶段枚举
 *
 * - initial: 初始状态
 * - loading: 初次加载（无消息，全屏骨架屏）
 * - streaming: 流式加载（有消息+isLoading，单消息气泡骨架屏）
 * - ready: 就绪状态
 * - error: 超时错误
 */
export type LoadingPhase = 'initial' | 'loading' | 'streaming' | 'ready' | 'error';

/**
 * 加载事件枚举
 */
export type LoadingEvent =
  | 'store:ready'
  | 'messages:loaded'
  | 'input:ready'
  | 'streaming:complete'
  | 'timeout'
  | 'error'
  | 'user:cancel';

/**
 * 状态转换映射
 */
export type LoadingTransitions = Partial<Record<LoadingEvent, LoadingPhase>>;

/**
 * 状态阶段配置
 *
 * @example
 * ```ts
 * const config: LoadingPhaseConfig = {
 *   phase: 'initial',
 *   enter: () => console.log('Entering initial'),
 *   exit: () => console.log('Exiting initial'),
 *   transitions: {
 *     'store:ready': 'loading',
 *     'timeout': 'error',
 *   },
 *   detect: () => !isStoreReady(),
 * };
 * ```
 */
export interface LoadingPhaseConfig {
  /** 状态名称 */
  phase: LoadingPhase;
  /** 进入状态时执行的钩子 */
  enter?: () => void;
  /** 离开状态时执行的钩子 */
  exit?: () => void;
  /** 状态转换映射：事件 -> 目标状态 */
  transitions: LoadingTransitions;
  /** 状态检测函数：返回 true 表示当前状态匹配 */
  detect: () => boolean;
}

/**
 * 状态机配置数组
 */
export type StateMachineConfig = LoadingPhaseConfig[];

/**
 * 状态转换事件
 * @internal
 */
export interface StateTransitionEvent {
  from: LoadingPhase;
  to: LoadingPhase;
  trigger: LoadingEvent;
  timestamp: number;
}

/**
 * 状态机事件监听器
 */
export type StateMachineListener = (event: StateTransitionEvent) => void;

/**
 * 状态机选项
 */
export interface StateMachineOptions {
  /** 最大状态转换次数（防止死循环） */
  maxTransitions?: number;
  /** 是否启用调试日志 */
  debug?: boolean;
  /** 事件监听器 */
  onTransition?: StateMachineListener;
}

/**
 * 状态机状态快照
 */
export interface StateMachineSnapshot {
  currentPhase: LoadingPhase;
  transitionCount: number;
  history: StateTransitionEvent[];
  lastTransitionTime: number | null;
}

/**
 * 状态机类接口
 */
export interface IStateMachine {
  /** 获取当前状态 */
  getCurrentPhase(): LoadingPhase;
  /** 触发状态转换 */
  transition(event: LoadingEvent): void;
  /** 自动检测并转换状态 */
  tick(): void;
  /** 启动自动检测循环 */
  start(): void;
  /** 停止自动检测循环 */
  stop(): void;
  /** 获取状态快照 */
  getSnapshot(): StateMachineSnapshot;
  /** 重置状态机 */
  reset(): void;
}

/**
 * 状态机错误类型
 */
export class StateMachineError extends Error {
  constructor(
    message: string,
    public readonly code: 'MAX_TRANSITIONS_EXCEEDED' | 'INVALID_TRANSITION' | 'INVALID_STATE'
  ) {
    super(message);
    this.name = 'StateMachineError';
  }
}
