/**
 * AgentWorkspaceCard — 工作区卡片（对齐原型 renderInlineAgentView）
 *
 * 对齐高保真原型：
 * - PM 头像 + 步骤 X/Y
 * - 子 Agent 卡片（彩色头像 + 状态 + 进度条）
 * - 任务分解列表
 * - 步骤导航栏
 * - compactMsg
 */

import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { MessageCardProps } from '../MessageCardRegistry';
import type { AgentWorkspaceData } from '../../../types/agent-collaboration';
import { AGENT_DOT_CONFIG } from '../../../types/agent-collaboration';

import '../../../gui/conversation/styles/card-animations.css';

/* ===== Agent 颜色映射（Tailwind class → inline style） ===== */

const AGENT_GRADIENT: Record<string, string> = {
  RF: 'linear-gradient(135deg, #10B981, #059669)',
  TS: 'linear-gradient(135deg, #0EA5E9, #0284C7)',
  DP: 'linear-gradient(135deg, #F59E0B, #D97706)',
  AN: 'linear-gradient(135deg, #EC4899, #DB2777)',
  CD: 'linear-gradient(135deg, #94A3B8, #64748B)',
  EX: 'linear-gradient(135deg, #A855F7, #9333EA)',
  PM: 'linear-gradient(135deg, #007acc, #005999)',
};

const AGENT_STATUS_COLOR: Record<string, string> = {
  RF: '#10B981',
  TS: '#0EA5E9',
  DP: '#F59E0B',
  AN: '#EC4899',
  CD: '#94A3B8',
  EX: '#A855F7',
};

function getAgentGradient(agentId: string): string {
  return AGENT_GRADIENT[agentId] || 'linear-gradient(135deg, #6B7280, #4B5563)';
}

function getAgentStatusColor(agentId: string): string {
  return AGENT_STATUS_COLOR[agentId] || '#6B7280';
}

function getStatusText(agentId: string, isActive: boolean, progress: number): string {
  if (!isActive) return progress >= 100 ? '已完成' : '就绪';
  return '工作中';
}

/* ===== 子组件：进度条 ===== */

function ProgressBar({ progress, color, isActive }: { progress: number; color: string; isActive: boolean }) {
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${isActive ? 'progress-stripe' : ''}`}
        style={{
          width: `${Math.max(progress, 2)}%`,
          background: isActive
            ? `linear-gradient(90deg, ${color}, ${color}88)`
            : color,
        }}
      />
    </div>
  );
}

/* ===== 主组件 ===== */

export function AgentWorkspaceCard({ message, compact }: MessageCardProps) {
  const data = message.data as AgentWorkspaceData;
  const pmConfig = AGENT_DOT_CONFIG.PM;

  // 步骤指示器文本
  const stepText = `步骤 ${data.stepIndex + 1}/${data.totalSteps}`;

  return (
    <div
      className="rounded-lg border overflow-hidden transition-all duration-300 animate-slide-in"
      style={{
        backgroundColor: 'rgba(30, 30, 40, 0.9)',
        borderColor: 'rgba(0, 122, 204, 0.15)',
        borderLeftWidth: '3px',
        borderLeftColor: '#007acc',
        fontSize: compact ? '12px' : '14px',
      }}
    >
      {/* ===== 顶部标签行 ===== */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
        {/* PM 头像 */}
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, #007acc, #005999)`,
            color: '#fff',
          }}
        >
          {pmConfig.label}
        </div>
        {/* 步骤指示器 */}
        <span className="text-[10px] text-gray-400 font-medium">{stepText}</span>
        {/* 分配徽章 */}
        {data.assignFromPM && (
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-medium"
            style={{
              backgroundColor: 'rgba(0, 122, 204, 0.15)',
              color: '#007acc',
            }}
          >
            PM 分配
          </span>
        )}
      </div>

      {/* ===== 子 Agent 卡片行 ===== */}
      <div className="px-3 py-2 space-y-2">
        {data.activeAgents.map((agentId) => {
          const config = AGENT_DOT_CONFIG[agentId];
          const progress = data.progress[agentId] ?? 0;
          const isActive = true; // activeAgents 中的都是活跃的
          const statusText = getStatusText(agentId, isActive, progress);
          const color = getAgentStatusColor(agentId);

          return (
            <div
              key={agentId}
              className="flex items-center gap-3 px-3 py-2 rounded-lg"
              style={{
                backgroundColor: `${color}08`,
                border: `1px solid ${color}15`,
              }}
            >
              {/* Agent 头像 */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{
                  background: getAgentGradient(agentId),
                  color: '#fff',
                  boxShadow: isActive ? `0 0 12px ${color}40` : 'none',
                }}
              >
                {config?.label || agentId}
              </div>

              {/* Agent 信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-200">
                    {config?.label || agentId}
                  </span>
                  <span className="text-[10px] font-medium" style={{ color }}>
                    {statusText}
                  </span>
                </div>
                {/* 进度条 */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <ProgressBar progress={progress} color={color} isActive={isActive} />
                  </div>
                  <span className="text-[10px] text-gray-500 flex-shrink-0">{progress}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== 任务分解列表 ===== */}
      {data.taskBreakdown && data.taskBreakdown.length > 0 && (
        <div className="px-3 pb-2">
          <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            {data.taskBreakdown.map((item, index) => {
              const agentColor = getAgentStatusColor(item.agent);
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-1.5"
                  style={{
                    borderBottom: index < data.taskBreakdown!.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                  }}
                >
                  <span className="text-[10px] font-medium" style={{ color: agentColor }}>
                    {item.agent}
                  </span>
                  <span className="text-[11px] text-gray-400 truncate">{item.task}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== 步骤导航栏 ===== */}
      {data.steps && data.steps.length > 0 && (
        <div className="px-3 pb-2 steps-bar">
          <div className="flex items-center gap-1 flex-wrap">
            {data.steps.map((step, index) => (
              <React.Fragment key={index}>
                {index > 0 && <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />}
                <span
                  className="text-[10px] whitespace-nowrap"
                  style={{
                    color: index === data.stepIndex ? '#60A5FA' : '#6B7280',
                    fontWeight: index === data.stepIndex ? 600 : 400,
                  }}
                >
                  {step}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* ===== compactMsg ===== */}
      {data.compactMsg && (
        <div
          className="px-3 py-2 flex items-center gap-2"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div className="w-1 h-1 rounded-full bg-blue-400/80 animate-progress-pulse" />
          <span className="text-[10px] text-blue-400/60">{data.compactMsg}</span>
        </div>
      )}
    </div>
  );
}
