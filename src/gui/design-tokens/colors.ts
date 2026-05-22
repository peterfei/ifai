/**
 * Design Token — 颜色
 *
 * 单一数据源，与 PALETTE.ts 语义色一致
 * 品牌色/表面色基于 App.css :root 变量
 */

export const BRAND_COLORS = {
  '50':  '#E8F1FF',
  '100': '#C5DAFF',
  '200': '#9EBFFF',
  '300': '#74A3FF',
  '400': '#5A91FF',
  '500': '#4b89ff',   // --accent-color from App.css
  '600': '#3c76e6',   // --accent-hover from App.css
  '700': '#2D5FBF',
} as const;

export const SURFACE_COLORS = {
  DEFAULT: '#17191c',  // --bg-primary from App.css
  '50':   '#1d2127',   // --bg-secondary
  '100':  '#252a31',   // --bg-tertiary
  '200':  '#2d333b',   // --border-color
  '300':  '#3b4450',   // --border-strong
} as const;

export const SEMANTIC_COLORS = {
  success: {
    base:   '#10B981',                          // PALETTE.ts success
    border: 'rgba(16,185,129,0.3)',
    glow:   'rgba(16,185,129,0.1)',
  },
  warning: {
    base:   '#F59E0B',                          // PALETTE.ts warning
    border: 'rgba(245,158,11,0.3)',
    glow:   'rgba(245,158,11,0.1)',
  },
  error:   {
    base:   '#EF4444',                          // PALETTE.ts danger
    border: 'rgba(239,68,68,0.3)',
    glow:   'rgba(239,68,68,0.1)',
  },
  info:    {
    base:   '#3B82F6',                          // PALETTE.ts info
  },
} as const;
