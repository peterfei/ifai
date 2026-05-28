/**
 * ExploreCard — 探索卡片（对齐原型 renderExploreView）
 *
 * 对齐高保真原型：
 * - EX 紫色头像 + 标题
 * - Phase 卡片（mode、intent、status、进度条、文件列表）
 * - 文件列表树（TUI 风格）
 */

import React from 'react';
import type { MessageCardProps } from '../MessageCardRegistry';
import type { ExploreData, ExplorePhase } from '../../../types/agent-collaboration';
import { AGENT_DOT_CONFIG } from '../../../types/agent-collaboration';

import '../../../gui/conversation/styles/card-animations.css';

/* ===== 状态配置 ===== */

const STATUS_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  done:    { icon: '✔', color: '#10B981', bg: 'rgba(16,185,129,0.1)', label: 'done' },
  running: { icon: '▸', color: '#A855F7', bg: 'rgba(168,85,247,0.1)', label: 'running' },
  pending: { icon: '⏳', color: '#6B7280', bg: 'rgba(107,114,128,0.08)', label: 'pending' },
};

const MODE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  parallel:   { icon: '⧉', color: '#0EA5E9', label: 'parallel' },
  sequential: { icon: '→', color: '#F59E0B', label: 'sequential' },
};

/* ===== 子组件：文件列表项 ===== */

function FileItem({ name, status, depth }: { name: string; status: string; depth: number }) {
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const connector = depth === 0 ? '' : '└─ ';

  return (
    <div className="flex items-center gap-2 py-0.5 tree-node" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
      {/* 状态图标 */}
      <span
        className="text-[10px] font-mono flex-shrink-0"
        style={{ color: statusCfg.color }}
      >
        {statusCfg.icon}
      </span>
      {/* 连接符 */}
      {connector && (
        <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">{connector}</span>
      )}
      {/* 文件名 */}
      <span className="text-[11px] text-gray-400 font-mono truncate">{name}</span>
      {/* 扫描线（running 状态） */}
      {status === 'running' && <div className="scan-beam flex-1" />}
    </div>
  );
}

/* ===== 子组件：Phase 卡片 ===== */

function PhaseCard({ phase }: { phase: ExplorePhase }) {
  const modeCfg = MODE_CONFIG[phase.mode] || MODE_CONFIG.sequential;
  const statusCfg = STATUS_CONFIG[phase.status] || STATUS_CONFIG.pending;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Phase 头部 */}
      <div className="px-3 py-2 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-2 min-w-0">
          {/* Mode 徽章 */}
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium flex-shrink-0"
            style={{
              backgroundColor: `${modeCfg.color}15`,
              color: modeCfg.color,
              border: `1px solid ${modeCfg.color}25`,
            }}
          >
            {modeCfg.icon} {modeCfg.label}
          </span>
          {/* Intent */}
          <span className="text-[11px] text-gray-300 truncate">{phase.intent}</span>
        </div>
        {/* Status 徽章 */}
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium flex-shrink-0"
          style={{
            backgroundColor: statusCfg.bg,
            color: statusCfg.color,
          }}
        >
          {statusCfg.icon} {statusCfg.label}
        </span>
      </div>

      {/* 进度条 */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
            <div
              className={`h-full rounded-full transition-all duration-500 ${phase.status === 'running' ? 'progress-stripe' : ''}`}
              style={{
                width: `${Math.max(phase.progress, 2)}%`,
                background: phase.status === 'done'
                  ? 'linear-gradient(90deg, #10B981, #059669)'
                  : phase.status === 'running'
                    ? 'linear-gradient(90deg, #A855F7, #9333EA)'
                    : 'rgba(255,255,255,0.1)',
              }}
            />
          </div>
          <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">{phase.progress}%</span>
        </div>
      </div>

      {/* 文件列表 */}
      {phase.sub && phase.sub.length > 0 && (
        <div className="px-3 pb-2 space-y-0.5">
          {phase.sub.map((item, idx) => (
            <FileItem key={idx} name={item.name} status={item.status} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ===== 主组件 ===== */

export function ExploreCard({ message, compact }: MessageCardProps) {
  const data = message.data as ExploreData;
  const exConfig = AGENT_DOT_CONFIG.EX;

  return (
    <div
      className="rounded-lg border overflow-hidden transition-all duration-300 animate-slide-in"
      style={{
        backgroundColor: 'rgba(30, 30, 40, 0.9)',
        borderColor: 'rgba(168, 85, 247, 0.15)',
        borderLeftWidth: '3px',
        borderLeftColor: '#A855F7',
        fontSize: compact ? '12px' : '14px',
      }}
    >
      {/* ===== 顶部标签行 ===== */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
        {/* EX 头像 */}
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #A855F7, #9333EA)',
            color: '#fff',
          }}
        >
          {exConfig.label}
        </div>
        {/* 标题 */}
        <span
          className="text-[10px] font-mono font-medium"
          style={{ color: '#A855F7' }}
        >
          ▸ explore
        </span>
        <span className="text-[10px] text-gray-500">
          · {data.phases.length} {data.phases.length === 1 ? 'phase' : 'phases'}
        </span>
      </div>

      {/* ===== Phase 列表 ===== */}
      <div className="px-3 py-2 space-y-2">
        {data.phases.map((phase, index) => (
          <PhaseCard key={index} phase={phase} />
        ))}
      </div>

      {/* ===== 底部状态 ===== */}
      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        {data.phases.some(p => p.status === 'running') ? (
          <>
            <div className="w-1 h-1 rounded-full bg-purple-400/80 animate-progress-pulse" />
            <span className="text-[10px] text-purple-400/60">正在探索中...</span>
          </>
        ) : (
          <span className="text-[10px] text-gray-500">
            ✔ 探索完成 · {data.phases.filter(p => p.status === 'done').length}/{data.phases.length} phases
          </span>
        )}
      </div>
    </div>
  );
}
