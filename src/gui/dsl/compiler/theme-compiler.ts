import type { ThemeDSL } from '../theme-dsl';

/**
 * ThemeDSL 编译器 — 声明 → CSS custom properties
 *
 * 纯函数：输入 ThemeDSL 声明，输出 `:root { ... }` CSS 字符串。
 */
export function compileTheme(theme: ThemeDSL): string {
  const lines: string[] = [':root {'];

  // 品牌色 — brand-500: #007acc
  for (const [shade, value] of Object.entries(theme.colors.brand)) {
    const suffix = shade === 'DEFAULT' ? '' : `-${shade}`;
    lines.push(`  --brand${suffix}: ${value};`);
  }

  // 中性色 — surface: #000000, surface-50: #1a1a1a
  for (const [shade, value] of Object.entries(theme.colors.surface)) {
    const suffix = shade === 'DEFAULT' ? '' : `-${shade}`;
    lines.push(`  --surface${suffix}: ${value};`);
  }

  // 语义色 — semantic-success: #22c55e, semantic-success-border: ...
  for (const [name, entry] of Object.entries(theme.colors.semantic)) {
    lines.push(`  --semantic-${name}: ${entry.base};`);
    if (entry.border) lines.push(`  --semantic-${name}-border: ${entry.border};`);
    if (entry.glow) lines.push(`  --semantic-${name}-glow: ${entry.glow};`);
  }

  // 间距 — spacing-base: 4px
  for (const [name, value] of Object.entries(theme.spacing)) {
    lines.push(`  --spacing-${name}: ${value}px;`);
  }

  // 圆角 — radius-sm: 4px
  for (const [name, value] of Object.entries(theme.radius)) {
    lines.push(`  --radius-${name}: ${value}px;`);
  }

  // 字体
  lines.push(`  --font-ui: ${theme.font.ui};`);
  lines.push(`  --font-code: ${theme.font.code};`);
  for (const [name, value] of Object.entries(theme.font.size)) {
    lines.push(`  --font-size-${name}: ${value}px;`);
  }

  // 阴影 — shadow-sm: ...
  for (const [name, value] of Object.entries(theme.shadow)) {
    lines.push(`  --shadow-${name}: ${value};`);
  }

  lines.push('}');
  return lines.join('\n');
}
