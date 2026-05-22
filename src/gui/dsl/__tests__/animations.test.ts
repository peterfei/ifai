/**
 * AnimationDSL 测试
 *
 * TDD 先行：8 个用例验证项目动画声明
 *
 * 覆盖：
 * - AD-1: ANIMATIONS 包含 12+ 个动画
 * - AD-2: fadeIn 编译输出
 * - AD-3: slideIn 包含 translateY
 * - AD-4: pulse 多关键帧
 * - AD-5: shimmer backgroundPosition
 * - AD-6: 全部编译输出合法 CSS
 * - AD-7: 每个动画有 .animate-* 工具类
 * - AD-8: 编译输出可安全注入 styleSheet
 */

import { describe, it, expect } from 'vitest';
import { ANIMATIONS } from '../animations';
import { compileAnimations } from '../compiler/animation-compiler';

describe('AnimationDSL', () => {
  const allNames = Object.keys(ANIMATIONS);
  const allSpecs = Object.values(ANIMATIONS);

  /* ===== AD-1: 12+ 个动画 ===== */

  it('AD-1: ANIMATIONS 应包含 fadeIn/fadeOut/slideInUp/slideInDown/pulse/shimmer 等 12+ 个动画', () => {
    expect(allNames.length).toBeGreaterThanOrEqual(12);
    expect(allNames).toContain('fadeIn');
    expect(allNames).toContain('fadeOut');
    expect(allNames).toContain('slideInUp');
    expect(allNames).toContain('slideInDown');
    expect(allNames).toContain('pulse');
    expect(allNames).toContain('shimmer');
  });

  /* ===== AD-2: fadeIn ===== */

  it('AD-2: fadeIn 编译输出应包含 @keyframes fadeIn', () => {
    const css = compileAnimations([ANIMATIONS.fadeIn]);
    expect(css).toContain('@keyframes fadeIn');
    expect(css).toContain('opacity');
  });

  /* ===== AD-3: slideIn ===== */

  it('AD-3: slideInUp 动画应包含 transform: translateY', () => {
    const css = compileAnimations([ANIMATIONS.slideInUp]);
    expect(css).toContain('translateY');
  });

  /* ===== AD-4: pulse ===== */

  it('AD-4: pulse 动画应有 3 个关键帧（0%/50%/100%）', () => {
    const spec = ANIMATIONS.pulse;
    expect(spec.keyframes.length).toBeGreaterThanOrEqual(3);
    const offsets = spec.keyframes.map(k => k.offset);
    expect(offsets).toContain(0);
    expect(offsets).toContain(0.5);
    expect(offsets).toContain(1);
  });

  /* ===== AD-5: shimmer ===== */

  it('AD-5: shimmer 动画应有 backgroundPosition 变化', () => {
    const css = compileAnimations([ANIMATIONS.shimmer]);
    expect(css).toContain('backgroundPosition');
  });

  /* ===== AD-6: 全部编译合法 ===== */

  it('AD-6: 所有动画编译后总输出应为合法 CSS', () => {
    const css = compileAnimations(allSpecs);
    // 不应包含 undefined/NaN
    expect(css).not.toContain('undefined');
    expect(css).not.toContain('NaN');
    // 每个动画都应有 @keyframes
    for (const name of allNames) {
      expect(css).toContain(`@keyframes ${name}`);
    }
  });

  /* ===== AD-7: 工具类 ===== */

  it('AD-7: 每个动画应有对应的 .animate-* 工具类', () => {
    const css = compileAnimations(allSpecs);
    for (const name of allNames) {
      expect(css).toContain(`.animate-${name}`);
    }
  });

  /* ===== AD-8: 安全注入 ===== */

  it('AD-8: 编译输出可安全注入 document.styleSheet', () => {
    const css = compileAnimations(allSpecs);
    // 检查基本 CSS 语法安全
    // 不应有未闭合大括号
    const openBraces = (css.match(/{/g) || []).length;
    const closeBraces = (css.match(/}/g) || []).length;
    expect(openBraces).toBe(closeBraces);
  });
});
