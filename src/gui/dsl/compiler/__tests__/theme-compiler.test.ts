import { describe, it, expect } from 'vitest';
import { compileTheme } from '../theme-compiler';
import type { ThemeDSL } from '../../theme-dsl';

const blackTheme: ThemeDSL = {
  colors: {
    brand: {
      '50': '#E3F2FD', '100': '#BBDEFB', '200': '#90CAF9',
      '300': '#64B5F6', '400': '#42A5F5', '500': '#007acc',
      '600': '#0069a7', '700': '#005080',
    },
    surface: {
      DEFAULT: '#000000', '50': '#1a1a1a', '100': '#252525',
      '200': '#2d2d2d', '300': '#333333',
    },
    semantic: {
      success: { base: '#22c55e', border: 'rgba(34,197,94,0.3)', glow: 'rgba(34,197,94,0.1)' },
      warning: { base: '#f59e0b', border: 'rgba(245,158,11,0.3)', glow: 'rgba(245,158,11,0.1)' },
      error:   { base: '#ef4444', border: 'rgba(239,68,68,0.3)', glow: 'rgba(239,68,68,0.1)' },
      info:    { base: '#60a5fa' },
    },
  },
  spacing: { base: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32 },
  radius:  { sm: 4, md: 8, lg: 12, xl: 16, full: 9999 },
  font: {
    ui: "'Inter', sans-serif",
    code: "'JetBrains Mono', monospace",
    size: { sm: 12, base: 14, lg: 16, xl: 20, '2xl': 24 },
  },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.3)',
    md: '0 4px 16px rgba(0,0,0,0.2)',
    lg: '0 8px 32px rgba(0,0,0,0.25)',
  },
};

describe('ThemeDSL Compiler', () => {
  it('UT1.2.1: 品牌色编译 — 生成 --brand-500: #007acc', () => {
    const css = compileTheme(blackTheme);
    expect(css).toContain('--brand-500: #007acc');
    expect(css).toContain('--brand-400: #42A5F5');
    expect(css).toContain('--brand-700: #005080');
  });

  it('UT1.2.2: 语义色编译 — 含 border/glow 变体', () => {
    const css = compileTheme(blackTheme);
    expect(css).toContain('--semantic-success: #22c55e');
    expect(css).toContain('--semantic-success-border: rgba(34,197,94,0.3)');
    expect(css).toContain('--semantic-success-glow: rgba(34,197,94,0.1)');
  });

  it('UT1.2.3: 中性色编译 — surface.DEFAULT 作为主背景', () => {
    const css = compileTheme(blackTheme);
    expect(css).toContain('--surface: #000000');
    expect(css).toContain('--surface-50: #1a1a1a');
    expect(css).toContain('--surface-100: #252525');
  });

  it('UT1.2.4: 间距编译 — 以 px 为单位', () => {
    const css = compileTheme(blackTheme);
    expect(css).toContain('--spacing-base: 4px');
    expect(css).toContain('--spacing-xl: 24px');
  });

  it('UT1.2.5: 圆角编译', () => {
    const css = compileTheme(blackTheme);
    expect(css).toContain('--radius-sm: 4px');
    expect(css).toContain('--radius-lg: 12px');
    expect(css).toContain('--radius-full: 9999px');
  });

  it('UT1.2.6: 字体编译', () => {
    const css = compileTheme(blackTheme);
    expect(css).toContain("--font-ui: 'Inter', sans-serif");
    expect(css).toContain("--font-code: 'JetBrains Mono', monospace");
    expect(css).toContain('--font-size-sm: 12px');
    expect(css).toContain('--font-size-base: 14px');
  });

  it('UT1.2.7: 阴影编译', () => {
    const css = compileTheme(blackTheme);
    expect(css).toContain('--shadow-sm: 0 1px 2px rgba(0,0,0,0.3)');
    expect(css).toContain('--shadow-lg: 0 8px 32px rgba(0,0,0,0.25)');
  });

  it('UT1.2.8: 输出格式 — 以 :root { 开始 } 结束', () => {
    const css = compileTheme(blackTheme);
    expect(css.startsWith(':root {')).toBe(true);
    expect(css.trim().endsWith('}')).toBe(true);
    expect(css).not.toContain('undefined');
    expect(css).not.toContain('NaN');
  });
});
