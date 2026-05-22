/**
 * AnimationSpec — 动画声明类型
 *
 * 声明式动画规范，编译为 CSS @keyframes + 工具类
 */

/** 单个关键帧步骤 */
export interface KeyframeStep {
  offset: number;                       // 0-1
  properties: Record<string, string>;   // CSS 属性
}

/** 动画声明 */
export interface AnimationSpec {
  name: string;                          // 动画名（如 'fadeIn'）
  duration: number;                      // ms
  easing?: string;                       // default 'ease'
  delay?: number;                        // ms, default 0
  iterationCount?: number | 'infinite';  // default 1
  direction?: 'normal' | 'reverse' | 'alternate';
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
  keyframes: KeyframeStep[];
}
