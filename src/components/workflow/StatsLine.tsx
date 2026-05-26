// ============================================================
// StatsLine — 统计行组件
//
// ✔ Done  X.Xs · N/M tools · X.Xk tokens
// ✔ Workflow complete  X.Xs · N/M tools · X.Xk tokens
// 参考: design.md §2.2
// ============================================================

import React from 'react';

interface StatsLineProps {
  label: string;
  elapsedSecs: number;
  doneCount: number;
  totalCount: number;
  tokenCount?: number;
  status: 'done' | 'running';
}

/** 声明式 token 后缀表 — 新增单位只需插入一行，函数体零修改 */
const TOKEN_SUFFIXES = [
  { threshold: 1_000_000, suffix: 'M', divisor: 1_000_000 },
  { threshold: 1_000, suffix: 'k', divisor: 1_000 },
] as const;

const formatTokens = (n: number): string => {
  if (n <= 0) return '';
  const rule = TOKEN_SUFFIXES.find(s => n >= s.threshold);
  const suffix = rule ? `${(n / rule.divisor).toFixed(1)}${rule.suffix}` : `${n}`;
  return ` · ${suffix} tokens`;
};

const formatTime = (s: number): string => `${s.toFixed(1)}s`;
const toolWord = (n: number): string => `tool${n !== 1 ? 's' : ''}`;

/** 统计行 */
export const StatsLine: React.FC<StatsLineProps> = ({
  label, elapsedSecs, doneCount, totalCount, tokenCount = 0, status,
}) => {
  const icon = status === 'done' ? '✔' : '▸';

  return (
    <div className="font-mono text-[9px] text-emerald-400/60">
      {icon} {label}  {formatTime(elapsedSecs)} · {doneCount}/{totalCount} {toolWord(totalCount)}{formatTokens(tokenCount)}
    </div>
  );
};
