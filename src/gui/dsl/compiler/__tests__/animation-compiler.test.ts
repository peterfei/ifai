/**
 * AnimationSpec 编译器测试
 *
 * TDD 先行：10 个用例
 *
 * 覆盖：
 * - AC-1: 简单 fadeIn → @keyframes + 工具类
 * - AC-2: slideIn（translateY）
 * - AC-3: pulse（多关键帧）
 * - AC-4: 工具类 .animate-{name}
 * - AC-5: duration 编译
 * - AC-6: easing 支持
 * - AC-7: fillMode + iterationCount
 * - AC-8: 空数组返回空字符串
 * - AC-9: 多个动画拼接
 * - AC-10: 参数校验
 */

import { describe, it, expect } from 'vitest';
import { compileAnimations } from '../animation-compiler';
import type { AnimationSpec } from '../../animation-spec';

describe('AnimationSpec Compiler', () => {
  /* ===== AC-1: 简单 fadeIn ===== */

  it('AC-1: 编译简单 fadeIn → @keyframes + 工具类', () => {
    const specs: AnimationSpec[] = [
      {
        name: 'fadeIn',
        duration: 300,
        keyframes: [
          { offset: 0, properties: { opacity: '0' } },
          { offset: 1, properties: { opacity: '1' } },
        ],
      },
    ];

    const css = compileAnimations(specs);

    expect(css).toContain('@keyframes fadeIn');
    expect(css).toContain('0% { opacity: 0; }');
    expect(css).toContain('100% { opacity: 1; }');
  });

  /* ===== AC-2: slideIn（translateY） ===== */

  it('AC-2: 编译 slideIn 动画（带 translateY）', () => {
    const specs: AnimationSpec[] = [
      {
        name: 'slideIn',
        duration: 400,
        keyframes: [
          { offset: 0, properties: { transform: 'translateY(20px)', opacity: '0' } },
          { offset: 1, properties: { transform: 'translateY(0)', opacity: '1' } },
        ],
      },
    ];

    const css = compileAnimations(specs);

    expect(css).toContain('@keyframes slideIn');
    expect(css).toContain('transform: translateY(20px)');
    expect(css).toContain('transform: translateY(0)');
  });

  /* ===== AC-3: pulse（多关键帧） ===== */

  it('AC-3: 编译 pulse（多关键帧 0%/50%/100%）', () => {
    const specs: AnimationSpec[] = [
      {
        name: 'pulse',
        duration: 2000,
        iterationCount: 'infinite',
        keyframes: [
          { offset: 0, properties: { opacity: '1' } },
          { offset: 0.5, properties: { opacity: '0.5' } },
          { offset: 1, properties: { opacity: '1' } },
        ],
      },
    ];

    const css = compileAnimations(specs);

    expect(css).toContain('@keyframes pulse');
    expect(css).toContain('0% { opacity: 1; }');
    expect(css).toContain('50% { opacity: 0.5; }');
    expect(css).toContain('100% { opacity: 1; }');
  });

  /* ===== AC-4: 工具类 ===== */

  it('AC-4: 生成 .animate-{name} 工具类', () => {
    const specs: AnimationSpec[] = [
      {
        name: 'fadeIn',
        duration: 300,
        easing: 'ease-out',
        fillMode: 'forwards',
        keyframes: [
          { offset: 0, properties: { opacity: '0' } },
          { offset: 1, properties: { opacity: '1' } },
        ],
      },
    ];

    const css = compileAnimations(specs);

    expect(css).toContain('.animate-fadeIn');
    expect(css).toContain('animation: fadeIn 300ms ease-out forwards');
  });

  /* ===== AC-5: duration ===== */

  it('AC-5: duration 编译为 ms 格式', () => {
    const specs: AnimationSpec[] = [
      {
        name: 'slow',
        duration: 1500,
        keyframes: [
          { offset: 0, properties: { opacity: '0' } },
          { offset: 1, properties: { opacity: '1' } },
        ],
      },
    ];

    const css = compileAnimations(specs);
    expect(css).toContain('1500ms');
  });

  /* ===== AC-6: easing ===== */

  it('AC-6: easing 支持标准值', () => {
    const specs: AnimationSpec[] = [
      {
        name: 'a',
        duration: 300,
        easing: 'ease-in-out',
        keyframes: [
          { offset: 0, properties: { opacity: '0' } },
          { offset: 1, properties: { opacity: '1' } },
        ],
      },
      {
        name: 'b',
        duration: 300,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        keyframes: [
          { offset: 0, properties: { opacity: '0' } },
          { offset: 1, properties: { opacity: '1' } },
        ],
      },
    ];

    const css = compileAnimations(specs);
    expect(css).toContain('ease-in-out');
    expect(css).toContain('cubic-bezier(0.4, 0, 0.2, 1)');
  });

  /* ===== AC-7: fillMode + iterationCount ===== */

  it('AC-7: fillMode 和 iterationCount 编译正确', () => {
    const specs: AnimationSpec[] = [
      {
        name: 'spin',
        duration: 1000,
        iterationCount: 'infinite',
        fillMode: 'both',
        direction: 'alternate',
        keyframes: [
          { offset: 0, properties: { transform: 'rotate(0deg)' } },
          { offset: 1, properties: { transform: 'rotate(360deg)' } },
        ],
      },
    ];

    const css = compileAnimations(specs);
    expect(css).toContain('infinite');
    expect(css).toContain('both');
    expect(css).toContain('alternate');
  });

  /* ===== AC-8: 空数组 ===== */

  it('AC-8: 空 AnimationSpec 数组返回空字符串', () => {
    const css = compileAnimations([]);
    expect(css).toBe('');
  });

  /* ===== AC-9: 多个动画拼接 ===== */

  it('AC-9: 编译多个动画 → 输出拼接 CSS', () => {
    const specs: AnimationSpec[] = [
      {
        name: 'fadeIn',
        duration: 300,
        keyframes: [
          { offset: 0, properties: { opacity: '0' } },
          { offset: 1, properties: { opacity: '1' } },
        ],
      },
      {
        name: 'fadeOut',
        duration: 300,
        keyframes: [
          { offset: 0, properties: { opacity: '1' } },
          { offset: 1, properties: { opacity: '0' } },
        ],
      },
    ];

    const css = compileAnimations(specs);
    expect(css).toContain('@keyframes fadeIn');
    expect(css).toContain('@keyframes fadeOut');
    expect(css).toContain('.animate-fadeIn');
    expect(css).toContain('.animate-fadeOut');
  });

  /* ===== AC-10: 参数校验 ===== */

  it('AC-10: duration=0 或负值应抛出错误', () => {
    expect(() =>
      compileAnimations([
        {
          name: 'bad',
          duration: 0,
          keyframes: [
            { offset: 0, properties: { opacity: '0' } },
            { offset: 1, properties: { opacity: '1' } },
          ],
        },
      ])
    ).toThrow();

    expect(() =>
      compileAnimations([
        {
          name: 'bad',
          duration: -100,
          keyframes: [
            { offset: 0, properties: { opacity: '0' } },
            { offset: 1, properties: { opacity: '1' } },
          ],
        },
      ])
    ).toThrow();
  });
});
