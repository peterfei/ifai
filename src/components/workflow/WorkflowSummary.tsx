// ============================================================
// WorkflowSummary — 工作流汇总统计行
//
// ✔ Workflow complete   X.Xs · N tools · X.Xk tokens
// ▸ Running             X.Xs · N/M tools
// 参考: design.md §3.1
// ============================================================

import React from 'react';
import { StatsLine } from './StatsLine';
import type { WorkflowData } from '../../types/workflow';

interface WorkflowSummaryProps {
  data: WorkflowData;
}

export const WorkflowSummary: React.FC<WorkflowSummaryProps> = ({ data }) => {
  if (data.nodes.length === 0) return null;

  return (
    <div className="pt-1">
      <StatsLine
        label={data.status === 'done' ? 'Workflow complete' : 'Running'}
        elapsedSecs={data.totalElapsedSecs}
        doneCount={data.totalTools}
        totalCount={data.totalTools}
        tokenCount={data.totalTokens}
        status={data.status}
      />
    </div>
  );
};
