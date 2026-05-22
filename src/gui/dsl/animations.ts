/**
 * AnimationDSL — 项目动画声明
 *
 * 所有常用动画的声明式定义，编译为 CSS @keyframes + 工具类
 * 从现有 CSS 文件中提取并统一管理
 */

import type { AnimationSpec } from './animation-spec';

/**
 * ANIMATIONS — 项目动画 DSL
 *
 * 每个动画通过 AnimationSpec 声明，由 compileAnimations 编译为 CSS
 */
export const ANIMATIONS: Record<string, AnimationSpec> = {
  /* ===== 入场动画 ===== */

  fadeIn: {
    name: 'fadeIn',
    duration: 150,
    easing: 'ease-out',
    keyframes: [
      { offset: 0, properties: { opacity: '0', transform: 'translateY(4px)' } },
      { offset: 1, properties: { opacity: '1', transform: 'translateY(0)' } },
    ],
  },

  fadeOut: {
    name: 'fadeOut',
    duration: 150,
    easing: 'ease-in',
    keyframes: [
      { offset: 0, properties: { opacity: '1' } },
      { offset: 1, properties: { opacity: '0' } },
    ],
  },

  slideInUp: {
    name: 'slideInUp',
    duration: 300,
    easing: 'ease-out',
    keyframes: [
      { offset: 0, properties: { transform: 'translateY(20px)', opacity: '0' } },
      { offset: 1, properties: { transform: 'translateY(0)', opacity: '1' } },
    ],
  },

  slideInDown: {
    name: 'slideInDown',
    duration: 300,
    easing: 'ease-out',
    keyframes: [
      { offset: 0, properties: { transform: 'translateY(-20px)', opacity: '0' } },
      { offset: 1, properties: { transform: 'translateY(0)', opacity: '1' } },
    ],
  },

  scaleIn: {
    name: 'scaleIn',
    duration: 200,
    easing: 'ease-out',
    keyframes: [
      { offset: 0, properties: { transform: 'scale(0.9)', opacity: '0' } },
      { offset: 1, properties: { transform: 'scale(1)', opacity: '1' } },
    ],
  },

  scaleOut: {
    name: 'scaleOut',
    duration: 200,
    easing: 'ease-in',
    keyframes: [
      { offset: 0, properties: { transform: 'scale(1)', opacity: '1' } },
      { offset: 1, properties: { transform: 'scale(0.9)', opacity: '0' } },
    ],
  },

  /* ===== 循环动画 ===== */

  pulse: {
    name: 'pulse',
    duration: 2000,
    iterationCount: 'infinite',
    easing: 'ease-in-out',
    keyframes: [
      { offset: 0, properties: { opacity: '1' } },
      { offset: 0.5, properties: { opacity: '0.5' } },
      { offset: 1, properties: { opacity: '1' } },
    ],
  },

  shimmer: {
    name: 'shimmer',
    duration: 1500,
    iterationCount: 'infinite',
    easing: 'linear',
    keyframes: [
      { offset: 0, properties: { backgroundPosition: '-200% 0' } },
      { offset: 1, properties: { backgroundPosition: '200% 0' } },
    ],
  },

  blink: {
    name: 'blink',
    duration: 1000,
    iterationCount: 'infinite',
    easing: 'step-end',
    keyframes: [
      { offset: 0, properties: { opacity: '1' } },
      { offset: 0.5, properties: { opacity: '1' } },
      { offset: 0.51, properties: { opacity: '0' } },
      { offset: 1, properties: { opacity: '0' } },
    ],
  },

  spin: {
    name: 'spin',
    duration: 1000,
    iterationCount: 'infinite',
    easing: 'linear',
    keyframes: [
      { offset: 0, properties: { transform: 'rotate(0deg)' } },
      { offset: 1, properties: { transform: 'rotate(360deg)' } },
    ],
  },

  /* ===== UI 专用动画 ===== */

  toastSlideIn: {
    name: 'toastSlideIn',
    duration: 300,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    fillMode: 'forwards',
    keyframes: [
      { offset: 0, properties: { transform: 'translateX(100%)', opacity: '0' } },
      { offset: 1, properties: { transform: 'translateX(0)', opacity: '1' } },
    ],
  },

  dropdownSlideIn: {
    name: 'dropdownSlideIn',
    duration: 200,
    easing: 'ease-out',
    fillMode: 'both',
    keyframes: [
      { offset: 0, properties: { transform: 'translateY(-8px)', opacity: '0' } },
      { offset: 1, properties: { transform: 'translateY(0)', opacity: '1' } },
    ],
  },
};
