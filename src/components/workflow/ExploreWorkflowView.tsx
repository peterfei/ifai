// ============================================================
// ExploreWorkflowView — 工作流探索视图容器（TUI 列表格式）
//
// 组合 WorkflowHeader + NodeSection[] + WorkflowSummary
// 参考: design.md §3.1
// ============================================================

import React from 'react';
import { WorkflowHeader } from './WorkflowHeader';
import { NodeSection } from './NodeSection';
import { WorkflowSummary } from './WorkflowSummary';
import type { WorkflowData } from '../../types/workflow';

interface ExploreWorkflowViewProps {
  workflowData: WorkflowData;
}

export const ExploreWorkflowView: React.FC<ExploreWorkflowViewProps> = ({ workflowData }) => {
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
