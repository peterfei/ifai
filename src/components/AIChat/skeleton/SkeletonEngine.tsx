/**
 * 骨架屏引擎 - 元编程架构门面类
 *
 * 这是整个元编程架构的入口点
 * 集成状态机、DSL 解释器和检测器执行器
 * 通过配置驱动，实现零重复的声明式设计
 */

import React, { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { StateMachine, StateMachineError } from './StateMachine';
import { StateMachineConfig } from './StateMachineTypes';
import { DetectorRunner } from './DetectorRunner';
import { DSLRenderer } from './DSLRenderer';
import { LoadingEvent } from './StateMachineTypes';
import { DetectorConfig } from './DetectorTypes';
import { SkeletonDesign } from './SkeletonDSL';

/**
 * 骨架屏配置
 */
export interface SkeletonConfig {
  /** 状态机配置 */
  stateMachine: StateMachineConfig;
  /** 骨架屏结构定义（全屏） */
  structure: SkeletonDesign;
  /** 骨架屏结构定义（单消息气泡，用于流式加载） */
  streamingStructure?: SkeletonDesign;
  /** 检测器配置 */
  detectors: DetectorConfig[];
}

/**
 * 骨架屏引擎选项
 */
export interface SkeletonEngineOptions {
  /** 是否启用调试模式 */
  debug?: boolean;
  /** 是否启用骨架屏 */
  enabled?: boolean;
}

/**
 * 骨架屏引擎类
 *
 * @example
 * ```ts
 * const config: SkeletonConfig = {
 *   stateMachine: [...],
 *   structure: {...},
 *   detectors: [...],
 * };
 *
 * const engine = new SkeletonEngine(config);
 * engine.start();
 *
 * // 获取渲染器组件
 * const Renderer = engine.getRenderer();
 * <Renderer />
 * ```
 */
export class SkeletonEngine {
  private stateMachine: StateMachine;
  private detectorRunner: DetectorRunner;
  private config: SkeletonConfig;
  private options: Required<SkeletonEngineOptions>;

  private [Symbol.toStringTag] = 'SkeletonEngine';

  constructor(config: SkeletonConfig, options: SkeletonEngineOptions = {}) {
    this.config = config;
    this.options = {
      debug: options.debug ?? false,
      enabled: options.enabled ?? true,
    };

    // 初始化状态机
    this.stateMachine = new StateMachine(config.stateMachine, {
      debug: this.options.debug,
      onTransition: (event) => {
        this.log('State transition', event);
      },
    });

    // 初始化检测器执行器
    this.detectorRunner = new DetectorRunner(config.detectors, {
      debug: this.options.debug,
      onEvent: (event, value) => {
        this.log('Detector event', { event, value });
        this.stateMachine.transition(event);
      },
    });

    this.log('SkeletonEngine initialized');
  }

  /**
   * 启动引擎
   */
  start(): void {
    if (!this.options.enabled) {
      this.log('SkeletonEngine is disabled, skipping start');
      return;
    }

    this.stateMachine.start();
    this.detectorRunner.start();
    this.log('SkeletonEngine started');

    // 暴露到全局对象供调试
    if (typeof window !== 'undefined') {
      (window as any).__SKELETON_ENGINE__ = this;
    }
  }

  /**
   * 停止引擎
   */
  stop(): void {
    this.stateMachine.stop();
    this.detectorRunner.stop();
    this.log('SkeletonEngine stopped');
  }

  /**
   * 获取渲染器组件
   */
  getRenderer(): React.FC {
    const design = this.getDesign();
    const isVisible = this.getVisibility();

    return () => <DSLRenderer design={design} visible={isVisible} />;
  }

  /**
   * 获取当前骨架屏设计
   */
  getDesign(): SkeletonDesign {
    const phase = this.stateMachine.getCurrentPhase();
    // 🔥 关键：根据阶段选择正确的设计
    // streaming 阶段使用单消息气泡设计，其他阶段使用全屏设计
    if (phase === 'streaming' && this.config.streamingStructure) {
      return this.config.streamingStructure;
    }
    return this.config.structure;
  }

  /**
   * 获取骨架屏可见性
   * @internal
   */
  private getVisibility(): boolean {
    const phase = this.stateMachine.getCurrentPhase();
    // 🔥 关键：streaming 阶段也应该显示骨架屏（单消息气泡）
    return phase === 'initial' || phase === 'loading' || phase === 'streaming';
  }

  /**
   * 获取引擎状态快照
   */
  getSnapshot() {
    return {
      stateMachine: this.stateMachine.getSnapshot(),
      detectors: this.detectorRunner.getStates(),
      options: this.options,
    };
  }

  /**
   * 获取当前阶段
   */
  getCurrentPhase(): string {
    return this.stateMachine.getCurrentPhase();
  }

  /**
   * 调试日志
   * @internal
   */
  private log(message: string, data?: any): void {
    if (this.options.debug) {
      console.log(`[SkeletonEngine] ${message}`, data ?? '');
    }
  }
}

/**
 * 骨架屏 Hook
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { Renderer } = useSkeletonEngine(config);
 *   return <Renderer />;
 * }
 * ```
 */
export function useSkeletonEngine(config: SkeletonConfig, options?: SkeletonEngineOptions) {
  const engineRef = useRef<SkeletonEngine | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const isVisibleRef = useRef(false);

  // 初始化引擎
  const engine = useMemo(() => {
    if (!engineRef.current) {
      engineRef.current = new SkeletonEngine(config, options);
    }
    return engineRef.current;
  }, [config, options]);

  // 🔥 优化：立即更新可见性状态
  const updateVisibility = useCallback(() => {
    const phase = engine.getCurrentPhase();
    // 🔥 关键：streaming 阶段也应该显示骨架屏
    const visible = phase === 'initial' || phase === 'loading' || phase === 'streaming';
    if (visible !== isVisibleRef.current) {
      isVisibleRef.current = visible;
      setIsVisible(visible);
      if (options?.debug) {
        console.log(`[SkeletonEngine] Visibility changed: ${visible} (phase: ${phase})`);
      }
    }
  }, [engine, options]);

  // 启动引擎
  useEffect(() => {
    engine.start();

    // 🔥 立即检查一次可见性（避免延迟）
    updateVisibility();

    return () => engine.stop();
  }, [engine, updateVisibility]);

  // 监听状态变化
  useEffect(() => {
    // 🔥 使用更短的轮询间隔（50ms）以更快响应状态变化
    const interval = setInterval(() => {
      updateVisibility();
    }, 50);

    return () => clearInterval(interval);
  }, [updateVisibility]);

  // 获取渲染器组件
  // 🔥 关键：每次渲染时动态获取正确的设计（streaming vs 全屏）
  const Renderer = useCallback(() => {
    const design = engine.getDesign();
    return <DSLRenderer design={design} visible={isVisible} />;
  }, [engine, isVisible]);

  return {
    Renderer,
    engine,
    isVisible,
  };
}

/**
 * 骨架屏提供者组件
 *
 * @example
 * ```tsx
 * <SkeletonProvider config={AI_CHAT_SKELETON_CONFIG}>
 *   <AIChat />
 * </SkeletonProvider>
 * ```
 */
export interface SkeletonProviderProps {
  children: React.ReactNode;
  config: SkeletonConfig;
  options?: SkeletonEngineOptions;
}

export const SkeletonProvider: React.FC<SkeletonProviderProps> = memo(({
  children,
  config,
  options,
}) => {
  const { Renderer } = useSkeletonEngine(config, options);

  return (
    <>
      {children}
      <Renderer />
    </>
  );
});

SkeletonProvider.displayName = 'SkeletonProvider';
