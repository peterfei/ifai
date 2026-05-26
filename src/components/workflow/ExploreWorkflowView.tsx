// ============================================================
// ExploreWorkflowView — 工作流探索视图容器
//
// 对话流内嵌的工作台。接收 PhaseData[]，渲染标题栏 + 卡片序列。
// 参考: design.md §2
// ============================================================

import React from 'react';
import { PhaseCard } from './PhaseCard';
import type { PhaseData } from '../../types/workflow';
import './animations.css';

interface ExploreWorkflowViewProps {
  /** Phase 数据数组 */
  phaseData: PhaseData[];
  /** 是否有正在运行的 phase */
  isRunning?: boolean;
}

/** 标题栏 + 卡片序列 */
export const ExploreWorkflowView: React.FC<ExploreWorkflowViewProps> = ({
  phaseData,
  isRunning = false,
}) => {
  if (!phaseData.length) return null;

  const completedCount = phaseData.filter(p => p.status === 'done').length;
  const totalCount = phaseData.length;

  return (
    <div className="space-y-2 max-w-[94%]">
      {/* Summary header */}
      <div className="font-mono text-[10px] text-white/40 px-1">
        {isRunning || completedCount < totalCount ? (
          <span>▸ {completedCount}/{totalCount} phases</span>
        ) : (
          <span>✔ all {totalCount} phase{totalCount > 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Phase card sequence */}
      {phaseData.map((phase, index) => (
        <PhaseCard
          key={phase.nodeId}
          phase={phase}
          delay={index}
        />
      ))}
    </div>
  );
};
