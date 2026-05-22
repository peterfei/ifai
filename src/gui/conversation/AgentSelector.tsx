/**
 * AgentSelector — @ 触发的 Agent 快捷选择器
 *
 * 在输入框中输入 @ 时弹出，按名称/缩写/命令过滤 Agent 列表。
 * 选中后回调 onSelect(agentId, command)，由上层替换输入文本。
 */

import React, { useMemo, useCallback } from 'react';
import { getAllAgents } from './AGENT_DSL';

export interface AgentSelectorProps {
  /** 用户输入的过滤文本（如 'exp'） */
  filter: string;
  /** 选中 Agent 回调，参数为 (agentId, command) */
  onSelect: (agentId: string, command: string) => void;
  /** 关闭选择器回调（ESC 键等） */
  onClose: () => void;
}

export function AgentSelector({ filter, onSelect, onClose }: AgentSelectorProps) {
  const allAgents = getAllAgents();

  const filteredAgents = useMemo(() => {
    if (!filter) return allAgents;
    const lower = filter.toLowerCase();
    return allAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(lower) ||
        a.abbr.toLowerCase().includes(lower) ||
        a.command.toLowerCase().includes(lower) ||
        a.id.toLowerCase().includes(lower),
    );
  }, [allAgents, filter]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      data-testid="agent-selector"
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        maxHeight: 240,
        overflowY: 'auto',
        borderRadius: 8,
        padding: 4,
      }}
    >
      {filteredAgents.length === 0 ? (
        <div style={{ padding: '8px 12px', opacity: 0.5 }}>无匹配结果</div>
      ) : (
        filteredAgents.map((agent) => (
          <div
            key={agent.id}
            data-testid="agent-option"
            onClick={() => onSelect(agent.id, agent.command)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              borderRadius: 6,
            }}
          >
            <span
              data-testid="agent-dot"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: agent.color.bg,
                flexShrink: 0,
              }}
            />
            <span>{agent.name}</span>
            <span style={{ opacity: 0.4, fontSize: 12 }}>{agent.command}</span>
          </div>
        ))
      )}
    </div>
  );
}
