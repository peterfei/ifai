/**
 * Design Tokens 测试
 *
 * TDD 先行：12 个用例验证 DEFAULT_THEME 的完整性和一致性
 *
 * 覆盖：
 * - DT-1: DEFAULT_THEME 五大类结构
 * - DT-2: brand 颜色阶梯
 * - DT-3: surface 颜色阶梯
 * - DT-4: 语义色 + border/glow 变体
 * - DT-5: spacing 4px 网格
 * - DT-6: radius 系统
 * - DT-7: font family
 * - DT-8: font size
 * - DT-9: shadow 系统
 * - DT-10: 所有值合法
 * - DT-11: compileTheme 生成有效 CSS
 * - DT-12: 与 PALETTE.ts 颜色一致
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_THEME } from '../index';
import { compileTheme } from '../../dsl/compiler/theme-compiler';
import { SEMANTIC_TOKENS } from '../../conversation/PALETTE';

describe('Design Tokens', () => {
  /* ===== DT-1: 五大类结构 ===== */

  it('DT-1: DEFAULT_THEME 应包含 colors/spacing/radius/font/shadow 五大类', () => {
    expect(DEFAULT_THEME.colors).toBeDefined();
    expect(DEFAULT_THEME.spacing).toBeDefined();
    expect(DEFAULT_THEME.radius).toBeDefined();
    expect(DEFAULT_THEME.font).toBeDefined();
    expect(DEFAULT_THEME.shadow).toBeDefined();
  });

  /* ===== DT-2: brand 颜色阶梯 ===== */

  it('DT-2: brand 颜色阶梯应包含 500/600/700 三级', () => {
    expect(DEFAULT_THEME.colors.brand['500']).toBeTruthy();
    expect(DEFAULT_THEME.colors.brand['600']).toBeTruthy();
    expect(DEFAULT_THEME.colors.brand['700']).toBeTruthy();
  });

  /* ===== DT-3: surface 颜色阶梯 ===== */

  it('DT-3: surface 颜色阶梯应包含 DEFAULT/50/100/200/300 五级', () => {
    expect(DEFAULT_THEME.colors.surface.DEFAULT).toBeTruthy();
    expect(DEFAULT_THEME.colors.surface['50']).toBeTruthy();
    expect(DEFAULT_THEME.colors.surface['100']).toBeTruthy();
    expect(DEFAULT_THEME.colors.surface['200']).toBeTruthy();
    expect(DEFAULT_THEME.colors.surface['300']).toBeTruthy();
  });

  /* ===== DT-4: 语义色 ===== */

  it('DT-4: 语义色应包含 success/warning/error/info 四种 + border/glow 变体', () => {
    const sem = DEFAULT_THEME.colors.semantic;
    expect(sem.success).toBeDefined();
    expect(sem.warning).toBeDefined();
    expect(sem.error).toBeDefined();
    expect(sem.info).toBeDefined();

    // success 应有 border 和 glow 变体
    expect(sem.success.base).toBeTruthy();
    expect(sem.success.border).toBeTruthy();
    expect(sem.success.glow).toBeTruthy();
  });

  /* ===== DT-5: spacing 4px 网格 ===== */

  it('DT-5: spacing 系统应基于 4px 网格（4/8/12/16/24/32）', () => {
    expect(DEFAULT_THEME.spacing.base).toBe(4);
    expect(DEFAULT_THEME.spacing.sm).toBe(8);
    expect(DEFAULT_THEME.spacing.md).toBe(12);
    expect(DEFAULT_THEME.spacing.lg).toBe(16);
    expect(DEFAULT_THEME.spacing.xl).toBe(24);
    expect(DEFAULT_THEME.spacing['2xl']).toBe(32);
  });

  /* ===== DT-6: radius ===== */

  it('DT-6: radius 系统应包含 sm/md/lg/xl/full', () => {
    expect(DEFAULT_THEME.radius.sm).toBeDefined();
    expect(DEFAULT_THEME.radius.md).toBeDefined();
    expect(DEFAULT_THEME.radius.lg).toBeDefined();
    expect(DEFAULT_THEME.radius.xl).toBeDefined();
    expect(DEFAULT_THEME.radius.full).toBeDefined();
    expect(DEFAULT_THEME.radius.full).toBe(9999);
  });

  /* ===== DT-7: font family ===== */

  it('DT-7: font 应包含 ui/code 两个 font-family', () => {
    expect(DEFAULT_THEME.font.ui).toBeTruthy();
    expect(DEFAULT_THEME.font.code).toBeTruthy();
    expect(typeof DEFAULT_THEME.font.ui).toBe('string');
    expect(typeof DEFAULT_THEME.font.code).toBe('string');
  });

  /* ===== DT-8: font size ===== */

  it('DT-8: font.size 应包含 sm/base/lg/xl/2xl 五级', () => {
    expect(DEFAULT_THEME.font.size.sm).toBeDefined();
    expect(DEFAULT_THEME.font.size.base).toBeDefined();
    expect(DEFAULT_THEME.font.size.lg).toBeDefined();
    expect(DEFAULT_THEME.font.size.xl).toBeDefined();
    expect(DEFAULT_THEME.font.size['2xl']).toBeDefined();
  });

  /* ===== DT-9: shadow ===== */

  it('DT-9: shadow 应包含 sm/md/lg 三级', () => {
    expect(DEFAULT_THEME.shadow.sm).toBeTruthy();
    expect(DEFAULT_THEME.shadow.md).toBeTruthy();
    expect(DEFAULT_THEME.shadow.lg).toBeTruthy();
  });

  /* ===== DT-10: 合法 CSS 值 ===== */

  it('DT-10: 所有 token 值应为合法 CSS 值', () => {
    // 颜色应为 hex 或 rgba 格式
    const colorPattern = /^(#[0-9a-fA-F]{3,8}|rgba?\(.+\))$/;
    for (const [, value] of Object.entries(DEFAULT_THEME.colors.brand)) {
      expect(value).toMatch(colorPattern);
    }
    for (const [, value] of Object.entries(DEFAULT_THEME.colors.surface)) {
      expect(value).toMatch(colorPattern);
    }
    for (const [, entry] of Object.entries(DEFAULT_THEME.colors.semantic)) {
      expect(entry.base).toMatch(colorPattern);
    }

    // spacing 和 radius 应为正整数
    for (const [, value] of Object.entries(DEFAULT_THEME.spacing)) {
      expect(value).toBeGreaterThan(0);
    }
    for (const [name, value] of Object.entries(DEFAULT_THEME.radius)) {
      expect(value).toBeGreaterThan(0);
    }

    // font size 应为正整数
    for (const [, value] of Object.entries(DEFAULT_THEME.font.size)) {
      expect(value).toBeGreaterThan(0);
    }

    // shadow 应包含 rgba
    for (const [, value] of Object.entries(DEFAULT_THEME.shadow)) {
      expect(value).toContain('rgba');
    }
  });

  /* ===== DT-11: compileTheme 生成有效 CSS ===== */

  it('DT-11: compileTheme(DEFAULT_THEME) 应生成有效 CSS', () => {
    const css = compileTheme(DEFAULT_THEME);
    expect(css.startsWith(':root {')).toBe(true);
    expect(css.trim().endsWith('}')).toBe(true);
    expect(css).not.toContain('undefined');
    expect(css).not.toContain('NaN');

    // 关键变量应存在
    expect(css).toContain('--brand-500:');
    expect(css).toContain('--surface:');
    expect(css).toContain('--semantic-success:');
    expect(css).toContain('--spacing-base:');
    expect(css).toContain('--radius-sm:');
    expect(css).toContain('--font-ui:');
    expect(css).toContain('--font-code:');
    expect(css).toContain('--shadow-sm:');
  });

  /* ===== DT-12: 与 PALETTE.ts 颜色一致 ===== */

  it('DT-12: PALETTE.ts 的颜色应与 design tokens 的语义色一致', () => {
    const sem = DEFAULT_THEME.colors.semantic;

    // PALETTE success = #10B981 → tokens semantic.success.base
    expect(sem.success.base).toBe(SEMANTIC_TOKENS.semantic.success);

    // PALETTE warning = #F59E0B → tokens semantic.warning.base
    expect(sem.warning.base).toBe(SEMANTIC_TOKENS.semantic.warning);

    // PALETTE danger = #EF4444 → tokens semantic.error.base
    expect(sem.error.base).toBe(SEMANTIC_TOKENS.semantic.danger);

    // PALETTE info = #3B82F6 → tokens semantic.info.base
    expect(sem.info.base).toBe(SEMANTIC_TOKENS.semantic.info);
  });
});
