/**
 * AgentWorkspace — Agent 工作台紧凑/展开双模式
 *
 * 紧凑模式：嵌入右栏，显示最新 Agent 状态摘要
 * 展开模式：覆盖主区域，显示完整日志和进度
 *
 * 颜色/状态查表：AGENT_DSL + 状态映射
 */

import React from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import { useAgentStore } from '../../stores/agentStore';
import { AGENT_DSL, getAgent } from '../conversation/AGENT_DSL';

/** 状态颜色查表 */
const STATUS_COLORS: Record<string, string> = {
  running: '#3B82F6',
  completed: '#10B981',
  failed: '#EF4444',
  initializing: '#F59E0B',
  paused: '#9CA3AF',
};

/** 状态中文查表 */
const STATUS_LABELS: Record<string, string> = {
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  initializing: '初始化',
  paused: '已暂停',
};

function AgentAvatar({ type }: { type: string }) {
  const descriptor = getAgent(type);
  const color = descriptor?.color?.bg ?? STATUS_COLORS.running;

  return (
    <div
      data-agent-avatar
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: 11,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {descriptor?.abbr ?? type.slice(0, 3).toUpperCase()}
    </div>
  );
}

function CompactView({ agents }: { agents: any[] }) {
  const setMode = useLayoutStore((s) => s.setAgentWorkspaceMode);

  if (agents.length === 0) {
    return (
      <div data-testid="agent-workspace-compact" style={{ padding: 8, textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>
        <div>暂无活跃 Agent</div>
        <button
          data-testid="agent-workspace-expand"
          onClick={() => setMode('expanded')}
          style={{ marginTop: 4, fontSize: 11, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          展开
        </button>
      </div>
    );
  }

  const latest = agents[0];
  const statusColor = STATUS_COLORS[latest.status] ?? STATUS_COLORS.running;
  const statusLabel = STATUS_LABELS[latest.status] ?? latest.status;

  return (
    <div data-testid="agent-workspace-compact" style={{ padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AgentAvatar type={latest.type} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {latest.type}
          </div>
          <div style={{ fontSize: 10, color: statusColor }}>{statusLabel}</div>
        </div>
        {agents.length > 1 && (
          <span style={{ fontSize: 10, color: '#9CA3AF' }}>+{agents.length - 1}</span>
        )}
      </div>
      {latest.progress != null && (
        <div style={{ marginTop: 4, height: 2, borderRadius: 1, background: '#e5e7eb', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.round(latest.progress * 100)}%`, background: statusColor, borderRadius: 1 }} />
        </div>
      )}
      <button
        data-testid="agent-workspace-expand"
        onClick={() => setMode('expanded')}
        style={{ marginTop: 4, fontSize: 11, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        展开
      </button>
    </div>
  );
}

function ExpandedView({ agents }: { agents: any[] }) {
  const setMode = useLayoutStore((s) => s.setAgentWorkspaceMode);

  return (
    <div data-testid="agent-workspace-expanded" style={{ padding: 12, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Agent 工作台</span>
        <button
          data-testid="agent-workspace-collapse"
          onClick={() => setMode('compact')}
          style={{ fontSize: 11, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          收起
        </button>
      </div>
      {agents.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center' }}>暂无活跃 Agent</div>
      ) : (
        agents.map((agent) => {
          const statusColor = STATUS_COLORS[agent.status] ?? STATUS_COLORS.running;
          return (
            <div key={agent.id} style={{ marginBottom: 12, padding: 8, background: '#f9fafb', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <AgentAvatar type={agent.type} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{agent.type}</div>
                  <div style={{ fontSize: 10, color: statusColor }}>
                    {STATUS_LABELS[agent.status] ?? agent.status}
                    {agent.progress != null && ` · ${Math.round(agent.progress * 100)}%`}
                  </div>
                </div>
              </div>
              {agent.logs && agent.logs.length > 0 && (
                <div style={{ fontSize: 10, color: '#6B7280', maxHeight: 80, overflow: 'auto' }}>
                  {agent.logs.map((log: string, i: number) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export function AgentWorkspace() {
  const mode = useLayoutStore((s) => s.agentWorkspaceMode);
  const agents = useAgentStore((s) => s.runningAgents);

  if (mode === 'expanded') {
    return <ExpandedView agents={agents} />;
  }
  return <CompactView agents={agents} />;
}
