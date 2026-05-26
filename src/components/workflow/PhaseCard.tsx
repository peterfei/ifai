// ============================================================
// PhaseCard — 工作流阶段卡片组件
//
// 从 ProgressCard 扩展，变为 phase 感知的多段进度展示。
// 根据 status 切换配色/动画，根据 mode 切换 body 内容。
// 参考: design.md §4.1
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { StatusIcon } from './StatusIcon';
import { FileTree } from './FileTree';
import type { PhaseData } from '../../types/workflow';

interface PhaseCardProps {
  phase: PhaseData;
  /** 动画延迟（按卡片索引递增） */
  delay?: number;
}

/** 状态 → 边框颜色映射 */
const BORDER_COLORS: Record<string, string> = {
  running: 'border-purple-500/30',
  done: 'border-emerald-500/30',
  pending: 'border-white/5',
};

/** 状态 → 容器透明度 */
const OPACITY: Record<string, string> = {
  running: 'opacity-100',
  done: 'opacity-100',
  pending: 'opacity-40',
};

/** 模式 → 符号 */
const MODE_SYMBOLS: Record<string, string> = {
  parallel: '⧉',
  sequential: '→',
};

/** 模式 → CSS 标签色 */
const MODE_BADGE_CLASSES: Record<string, string> = {
  parallel: 'bg-purple-500/10 text-purple-300',
  sequential: 'bg-blue-500/10 text-blue-300',
};

export const PhaseCard: React.FC<PhaseCardProps> = ({ phase, delay = 0 }) => {
  const borderClass = BORDER_COLORS[phase.status] ?? BORDER_COLORS.pending;
  const opacityClass = OPACITY[phase.status] ?? OPACITY.pending;
  const modeSymbol = MODE_SYMBOLS[phase.mode] ?? '';
  const modeBadgeClass = MODE_BADGE_CLASSES[phase.mode] ?? '';

  // ── 独立计时：每个 PhaseCard 实例追踪自己的 elapsed ──
  const startTimeRef = useRef<number | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);

  // 状态变化时管理计时器
  useEffect(() => {
    if (phase.status === 'running') {
      // 首次进入 running 时记录起点
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
    } else if (phase.status === 'done') {
      // done 时固定最终耗时
      if (startTimeRef.current !== null) {
        setElapsedSecs((Date.now() - startTimeRef.current) / 1000);
      }
    } else if (phase.status === 'pending') {
      // pending 时重置
      startTimeRef.current = null;
      setElapsedSecs(0);
    }
  }, [phase.status]);

  // running 态下周期性更新 elapsed
  useEffect(() => {
    if (phase.status !== 'running' || startTimeRef.current === null) return;
    const id = setInterval(() => {
      setElapsedSecs((Date.now() - startTimeRef.current!) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, [phase.status]);

  const elapsedStr = elapsedSecs > 0 ? `${elapsedSecs.toFixed(1)}s` : '';

  return (
    <div
      className={`phase-card rounded-xl border ${borderClass} ${opacityClass} transition-all duration-700`}
      style={{
        animationDelay: `${delay * 0.08}s`,
        background: phase.status === 'running'
          ? 'rgba(168,85,247,0.02)'
          : 'transparent',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* 模式徽章 */}
          {modeSymbol && (
            <span className={`font-mono text-[8px] px-1 rounded ${modeBadgeClass}`}>
              {modeSymbol} {phase.mode}
            </span>
          )}
          {/* 意图文字 */}
          <span className="text-[11px] font-medium text-white/80 truncate">
            {phase.intent}
          </span>
        </div>
        {/* 状态徽章 */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <StatusIcon status={phase.status} />
          <span className="font-mono text-[9px] text-white/40">{phase.status}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/5 mx-3 mb-1 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            phase.status === 'running'
              ? 'progress-stripe'
              : phase.status === 'done'
                ? 'bg-emerald-400'
                : 'bg-white/10'
          }`}
          style={{ width: `${phase.progress}%` }}
        />
      </div>

      {/* Body */}
      {renderBody(phase, elapsedStr)}
    </div>
  );
};

function renderBody(phase: PhaseData, elapsedStr: string) {
  // pending 或无 sub 且 mode=sequential → 简洁指示
  if (phase.status === 'pending' || (!phase.sub?.length && phase.mode === 'sequential')) {
    return (
      <div className="px-3 py-1">
        <span className="font-mono text-[10px] text-white/30">
          {phase.mode === 'parallel' ? '⏳ waiting...' : `▸ ${phase.intent}`}
        </span>
      </div>
    );
  }

  // sub 为空且 done → 仅头部 + 进度条
  if (!phase.sub?.length && phase.status === 'done') {
    return null;
  }

  const subItems = phase.sub ?? [];
  const runningCount = subItems.filter(s => s.status === 'running').length;
  const doneCount = subItems.filter(s => s.status === 'done').length;

  return (
    <div className="px-3 py-1 space-y-1">
      {/* Running indicator */}
      {phase.status === 'running' && runningCount > 0 && (
        <div className="font-mono text-[10px] text-purple-300/80">
          ▸ Running {runningCount} tool{runningCount > 1 ? 's' : ''} · {phase.mode}
        </div>
      )}

      {/* File tree */}
      {subItems.length > 0 && (
        <FileTree items={subItems} />
      )}

      {/* Stats line — done: ✔ Done  X.Xs · N/M tools */}
      {phase.status === 'done' && (
        <div className="font-mono text-[9px] text-emerald-400/60">
          ✔ Done  {elapsedStr} · {doneCount}/{subItems.length} tools
        </div>
      )}

      {/* Stats line — running: X.Xs · N/M tools */}
      {phase.status === 'running' && (doneCount > 0 || subItems.length > 0) && (
        <div className="font-mono text-[9px] text-white/20">
          {elapsedStr ? `${elapsedStr} · ` : ''}{doneCount}/{subItems.length} tools
        </div>
      )}
    </div>
  );
}
