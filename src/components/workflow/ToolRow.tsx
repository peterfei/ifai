// ============================================================
// ToolRow — TUI 风格单行工具展示
//
// 连接符声明式 CONNECTORS 查表，零 if-else。
// 参考: design.md §3.1
// ============================================================

import React from 'react';
import { StatusIcon } from './StatusIcon';
import type { ToolItem } from '../../types/workflow';

interface ToolRowProps {
  tool: ToolItem;
  /** 在工具列表中的索引（0-based） */
  index: number;
  /** 工具列表总数 */
  total: number;
}

/** 声明式连接符映射表 — 零 if-else */
const CONNECTORS = {
  single: '┌─ ',
  middle: '├─ ',
  last:   '└─ ',
} as const;

const connectorOf = (index: number, total: number): string =>
  CONNECTORS[total === 1 ? 'single' : index < total - 1 ? 'middle' : 'last'];

const formatTime = (s: number): string =>
  s <= 0 ? '<1s' : `${s.toFixed(1)}s`;

/** 单行工具：连接符 + 状态图标 + 工具名 + 耗时 + 目标 */
export const ToolRow: React.FC<ToolRowProps> = ({ tool, index, total }) => {
  const connector = connectorOf(index, total);

  return (
    <div className="font-mono text-[10px] leading-5">
      <span className="text-white/15">{connector}</span>
      <StatusIcon status={tool.status} className="inline-block w-3 h-3 mr-1" />
      <span className="text-white/70">{tool.toolName}</span>
      <span className="text-white/30 ml-2">({formatTime(tool.elapsedSecs)})</span>
      {tool.target && (
        <>
          <span className="text-white/20 mx-1">→</span>
          <span className="text-white/50">{tool.target}</span>
        </>
      )}
    </div>
  );
};
