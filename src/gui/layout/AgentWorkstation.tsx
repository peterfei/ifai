/**
 * AgentWorkstation — 单个 Agent 工位组件
 *
 * 颜色/状态查表驱动：
 * - 头像颜色：AGENT_DSL.getAgent(type).color
 * - 状态颜色：AGENT_STATUS_PALETTE[status]
 * - 状态标签：STATUS_LABELS[status]
 */

import React from 'react';
import type { Agent } from '../../types/agent';
import { getAgent } from '../conversation/AGENT_DSL';
import { AGENT_STATUS_PALETTE } from '../conversation/PALETTE';

/** 状态中文标签查表 */
const STATUS_LABELS: Record<string, string> = {
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  initializing: '初始化',
  idle: '空闲',
  waitingfortool: '等待工具',
  stopped: '已停止',
};

interface AgentWorkstationProps {
  agent: Agent;
  compact?: boolean;
}

export function AgentWorkstation({ agent, compact }: AgentWorkstationProps) {
  const descriptor = getAgent(agent.type);
  const statusColor = AGENT_STATUS_PALETTE[agent.status]?.bg ?? AGENT_STATUS_PALETTE.running.bg;
  const statusLabel = STATUS_LABELS[agent.status] ?? agent.status;
  const abbr = descriptor?.abbr ?? agent.type.slice(0, 3).toUpperCase();
  const avatarColor = descriptor?.color?.bg ?? statusColor;

  return (
    <div data-testid="agent-workstation" style={{ padding: compact ? 6 : 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Agent 头像 */}
        <div
          data-agent-avatar
          style={{
            width: compact ? 22 : 28,
            height: compact ? 22 : 28,
            borderRadius: '50%',
            backgroundColor: avatarColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: compact ? 9 : 11,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {abbr}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {descriptor?.name ?? agent.type}
          </div>
          <div data-testid="agent-status-label" style={{ fontSize: 10, color: statusColor }}>
            {statusLabel}
            {!compact && agent.progress != null && ` · ${Math.round(agent.progress * 100)}%`}
          </div>
        </div>
      </div>

      {/* 展开模式：进度条 */}
      {!compact && agent.progress != null && (
        <div data-testid="agent-progress-bar-container" style={{ marginTop: 4, height: 2, borderRadius: 1, background: '#e5e7eb', overflow: 'hidden' }}>
          <div
            data-testid="agent-progress-bar"
            style={{ height: '100%', width: `${Math.round(agent.progress * 100)}%`, background: statusColor, borderRadius: 1 }}
          />
        </div>
      )}

      {/* 展开模式：日志列表 */}
      {!compact && agent.logs && agent.logs.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 10, color: '#6B7280', maxHeight: compact ? 0 : 80, overflow: 'auto' }}>
          {agent.logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      )}
    </div>
  );
}
