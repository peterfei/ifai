// ============================================================
// WorkflowHeader — TUI 风格工作流头部
//
// ▸ 分析项目架构
//   ├─ Explore [结构分析]
//   └─ Explore [依赖分析]
// 参考: design.md §3.1
// ============================================================

import React from 'react';
import type { NodeData } from '../../types/workflow';

const CONNECTORS = { single: '├─ ', middle: '├─ ', last: '└─ ' } as const;
const connectorOf = (i: number, total: number) =>
  total === 1 ? '├─ ' : i < total - 1 ? '├─ ' : '└─ ';

interface WorkflowHeaderProps {
  intent: string;
  nodes: NodeData[];
}

export const WorkflowHeader: React.FC<WorkflowHeaderProps> = ({ intent, nodes }) => {
  if (!intent && nodes.length === 0) return null;

  return (
    <div className="font-mono space-y-0.5">
      <div className="text-[10px] text-white/70">▸ {intent}</div>
      {nodes.length > 0 && (
        <div className="ml-2">
          {nodes.map((node, i) => (
            <div key={node.nodeId} className="text-[10px] text-white/40">
              <span className="text-white/15">{connectorOf(i, nodes.length)}</span>
              {node.agentType} [{node.intent}]
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
