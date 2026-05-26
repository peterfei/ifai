// ============================================================
// NodeSection — TUI 风格节点 section
//
// ▸ [intent]
// ▸ Running N tools...
//   ├─ ✔ tool  (X.Xs) → target
//   └─ ▸ tool  (X.Xs) → target
// ✔ Done  X.Xs · N/M tools · X.Xk tokens
// 参考: design.md §2.1 + §3.1
// ============================================================

import React, { useMemo } from 'react';
import { ToolRow } from './ToolRow';
import { StatsLine } from './StatsLine';
import type { NodeData } from '../../types/workflow';

interface NodeSectionProps {
  node: NodeData;
}

export const NodeSection: React.FC<NodeSectionProps> = ({ node }) => {
  // reduce 单次归约 — 零 filter 重复遍历
  const counts = useMemo(() => {
    return node.tools.reduce(
      (acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }, [node.tools]);

  const runningCount = counts.running ?? 0;
  const doneCount = counts.done ?? 0;
  const tools = node.tools;

  if (node.status === 'pending' && tools.length === 0) {
    return (
      <div className="ml-2">
        <div className="font-mono text-[10px] text-white/70">▸ [{node.intent}]</div>
        <div className="font-mono text-[10px] text-white/20 ml-2">⏳ waiting...</div>
      </div>
    );
  }

  return (
    <div className="ml-2 space-y-0.5">
      {/* 节点标题 */}
      <div className="font-mono text-[10px] text-white/70">▸ [{node.intent}]</div>

      {/* 运行指示 */}
      {node.status === 'running' && runningCount > 0 && (
        <div className="font-mono text-[10px] text-purple-300/80">
          ▸ Running {runningCount} tool{runningCount > 1 ? 's' : ''}...
        </div>
      )}

      {/* 工具列表 */}
      {tools.length > 0 && (
        <div>
          {tools.map((tool, i) => (
            <ToolRow key={tool.toolName} tool={tool} index={i} total={tools.length} />
          ))}
        </div>
      )}

      {/* 统计行 */}
      {(node.status === 'done' || doneCount > 0) && (
        <div className="pt-0.5">
          <StatsLine
            label="Done"
            elapsedSecs={node.elapsedSecs}
            doneCount={doneCount}
            totalCount={tools.length}
            tokenCount={node.totalTokens}
            status={node.status === 'done' ? 'done' : 'running'}
          />
        </div>
      )}
    </div>
  );
};
