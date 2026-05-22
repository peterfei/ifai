/**
 * Design Token — 字体
 *
 * font-family 基于 App.css :root 变量
 */

export const FONT_TOKENS = {
  ui: '"IBM Plex Sans", "SF Pro Text", "SF Pro Display", "Segoe UI", "PingFang SC", "Noto Sans CJK SC", "Helvetica Neue", sans-serif',
  code: '"JetBrains Mono", "SFMono-Regular", "Cascadia Code", "Menlo", "Monaco", "Consolas", monospace',
  size: {
    sm:   12,
    base: 13,     // App.css html font-size: 13px
    lg:   16,
    xl:   20,
    '2xl': 24,
  },
} as const;
