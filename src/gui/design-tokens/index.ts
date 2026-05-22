/**
 * Design Tokens — 统一导出
 *
 * DEFAULT_THEME 是项目唯一的主题数据源（ThemeDSL 类型）
 * 编译通过 compileTheme(DEFAULT_THEME) 生成 CSS custom properties
 */

import type { ThemeDSL } from '../dsl/theme-dsl';
import { BRAND_COLORS, SURFACE_COLORS, SEMANTIC_COLORS } from './colors';
import { SPACING_TOKENS } from './spacing';
import { RADIUS_TOKENS } from './radii';
import { FONT_TOKENS } from './typography';
import { SHADOW_TOKENS } from './shadows';

/**
 * DEFAULT_THEME — 项目唯一主题数据源
 *
 * 所有颜色/间距/字体/圆角/阴影都从这里派生
 * 通过 compileTheme() 编译为 CSS custom properties 注入 :root
 */
export const DEFAULT_THEME: ThemeDSL = {
  colors: {
    brand: { ...BRAND_COLORS },
    surface: { ...SURFACE_COLORS },
    semantic: { ...SEMANTIC_COLORS },
  },
  spacing: { ...SPACING_TOKENS },
  radius: { ...RADIUS_TOKENS },
  font: {
    ui: FONT_TOKENS.ui,
    code: FONT_TOKENS.code,
    size: { ...FONT_TOKENS.size },
  },
  shadow: { ...SHADOW_TOKENS },
};
