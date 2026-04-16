/**
 * 骨架屏引擎 - 统一导出
 *
 * 元编程架构：配置驱动，零重复逻辑
 */

// 类型定义
export * from './SkeletonDSL';
export * from './StateMachineTypes';
export * from './DetectorTypes';

// 核心引擎
export { StateMachine } from './StateMachine';
export { StateMachineError } from './StateMachineTypes';
export { DetectorRunner, createDetectorRunner } from './DetectorRunner';
export { DSLRenderer } from './DSLRenderer';
export { SkeletonEngine, useSkeletonEngine, SkeletonProvider } from './SkeletonEngine';

// 配置
export * from './config/skeleton.config';
