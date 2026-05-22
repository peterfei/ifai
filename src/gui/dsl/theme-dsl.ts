/**
 * ThemeDSL — 视觉主题规范
 *
 * @design D5: 设计语言 — Design Tokens
 */

export interface ColorShades {
  [shade: string]: string;
}

export interface SemanticColorEntry {
  base: string;
  border?: string;
  glow?: string;
}

export interface ThemeDSL {
  colors: {
    brand: ColorShades;
    surface: ColorShades;
    semantic: Record<string, SemanticColorEntry>;
  };
  spacing: Record<string, number>;
  radius: Record<string, number>;
  font: {
    ui: string;
    code: string;
    size: Record<string, number>;
  };
  shadow: Record<string, string>;
}
