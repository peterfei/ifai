// ============================================================
// StatusIcon — 工作流阶段状态图标组件
//
// 声明式 STATUS_ICONS 映射表驱动，零 switch/if-else。
// 复用 PivoTreeList 的 lucide-react 图标模式。
// 参考: design.md §3.1 + §7.2
// ============================================================

import React from 'react';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';
import type { PhaseStatus } from '../../types/workflow';

interface StatusIconProps {
  status: PhaseStatus;
  className?: string;
}

/** 声明式状态图标映射表 — 新增状态只需在表中追加一行 */
const STATUS_ICONS: Record<PhaseStatus, React.FC<{ className?: string }>> = {
  running: ({ className }) => (
    <Loader2 className={`w-3 h-3 animate-spin text-purple-400 ${className ?? ''}`} />
  ),
  done: ({ className }) => (
    <CheckCircle2 className={`w-3 h-3 text-emerald-400 ${className ?? ''}`} />
  ),
  pending: ({ className }) => (
    <Circle className={`w-3 h-3 text-white/20 ${className ?? ''}`} />
  ),
};

/** 状态图标组件 — 查表驱动 */
export const StatusIcon: React.FC<StatusIconProps> = ({ status, className }) => {
  const Icon = STATUS_ICONS[status] ?? STATUS_ICONS.pending;
  return <Icon className={className} />;
};

export { STATUS_ICONS };
