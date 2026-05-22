/**
 * TimeDivider — 时间分组标题组件
 *
 * 在消息列表中显示"今天"/"昨天"/"更早"分隔线
 * 使用 SEMANTIC_TOKENS 颜色（不用 Tailwind 动态 class）
 */

import React from 'react';
import { SEMANTIC_TOKENS } from './PALETTE';

interface TimeDividerProps {
  /** 分组标签（"今天"/"昨天"/"更早"） */
  label: string;
}

export function TimeDivider({ label }: TimeDividerProps) {
  const lineStyle: React.CSSProperties = {
    flex: 1,
    height: 1,
    background: SEMANTIC_TOKENS.surface.border,
  };

  const textStyle: React.CSSProperties = {
    padding: '0 12px',
    color: SEMANTIC_TOKENS.semantic.muted,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    lineHeight: '20px',
  };

  return (
    <div
      data-testid="time-divider"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 0',
      }}
    >
      <span data-divider-line style={lineStyle} />
      <span style={textStyle}>{label}</span>
      <span data-divider-line style={lineStyle} />
    </div>
  );
}
