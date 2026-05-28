/**
 * @deprecated 已由 inline-first 卡片方案替代（AgentWorkspaceCard / AgentCompactBar）。
 * 保留以兼容现有引用，将在后续清理中移除。
 *
 * AgentWorkspace — Agent 工作台紧凑/展开双模式
 *
 * 紧凑模式：嵌入右栏，显示最新 Agent 状态摘要
 * 展开模式：覆盖主区域，显示完整日志和进度
 *
 * 委托 AgentWorkstation 渲染单个 Agent 工位
 */

import React from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import { useAgentStore } from '../../stores/agentStore';
import { AgentWorkstation } from './AgentWorkstation';
import type { Agent } from '../../types/agent';

function CompactView({ agents }: { agents: Agent[] }) {
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

  return (
    <div data-testid="agent-workspace-compact" style={{ padding: 8 }}>
      <AgentWorkstation agent={agents[0]} compact />
      {agents.length > 1 && (
        <div style={{ marginTop: 4, fontSize: 10, color: '#9CA3AF', textAlign: 'center' }}>
          +{agents.length - 1} 个更多
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

function ExpandedView({ agents }: { agents: Agent[] }) {
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
        agents.map((agent) => (
          <div key={agent.id} style={{ marginBottom: 8, background: '#f9fafb', borderRadius: 6 }}>
            <AgentWorkstation agent={agent} />
          </div>
        ))
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
