// ============================================================
// WorkflowView — Agent 工作流视图容器（TUI 列表格式）
//
// 组合 WorkflowHeader + NodeSection[] + WorkflowSummary
// Agent 类型无关 — 支持 explore/review/refactor/test/general
// 参考: design.md §3.1
// ============================================================

import React from 'react';
import { WorkflowHeader } from './WorkflowHeader';
import { NodeSection } from './NodeSection';
import { WorkflowSummary } from './WorkflowSummary';
import type { WorkflowData } from '../../types/workflow';

interface WorkflowViewProps {
  workflowData: WorkflowData;
}

export const WorkflowView: React.FC<WorkflowViewProps> = ({ workflowData }) => {
  if (!workflowData?.nodes?.length) return null;

  const { intent, nodes, ...summaryData } = workflowData;

  return (
    <div className="space-y-1 max-w-[94%] font-mono text-[10px]">
      <WorkflowHeader intent={intent} nodes={nodes} />
      <div className="border-t border-white/5" />
      {nodes.map((node) => (
        <NodeSection key={node.nodeId} node={node} />
      ))}
      <WorkflowSummary data={workflowData} />
    </div>
  );
};
