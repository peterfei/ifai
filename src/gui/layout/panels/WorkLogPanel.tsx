/**
 * WorkLogPanel — 工作日志子面板
 *
 * 从 useWorkLogData 获取真实日志数据，
 * 使用 AGENT_DSL 颜色查表渲染 Agent 头像和名称
 */

import React, { useMemo } from 'react';
import { useWorkLogData } from './useWorkLogData';
import { getAgent } from '../../conversation/AGENT_DSL';
import { useAgentStore } from '../../../stores/agentStore';
import { useChatStore } from '../../../stores/useChatStore';

/** 文件类型 → 图标标签 */
function getFileTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    ts: 'TS',
    tsx: 'TX',
    test: 'T',
    md: 'M',
    css: 'C',
    json: 'J',
  };
  return labels[type] ?? '#';
}

export function WorkLogPanel() {
  const logs = useWorkLogData();
  const runningAgents = useAgentStore((s) => s.runningAgents);
  const currentThreadId = useChatStore((s) => s.currentThreadId);

  // 过滤当前线程的 runningAgents（避免跨线程 agent 高亮干扰）
  const threadRunningAgents = useMemo(
    () => runningAgents.filter((a) => !a.threadId || a.threadId === currentThreadId),
    [runningAgents, currentThreadId]
  );

  // 提取当前活跃的 Agent 类型集合（用于高亮）
  const activeAgentTypes = useMemo(() => {
    const activeStatuses = new Set(['running', 'waitingfortool', 'initializing']);
    return new Set(
      threadRunningAgents
        .filter((a) => activeStatuses.has(a.status))
        .map((a) => a.type)
    );
  }, [threadRunningAgents]);

  if (logs.length === 0) {
    return (
      <div data-testid="work-log-panel" style={{ padding: '16px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
        暂无工作日志
      </div>
    );
  }

  return (
    <div data-testid="work-log-panel" style={{ padding: '4px 8px', overflowY: 'auto' }}>
      {logs.map((log, i) => {
        const agent = getAgent(log.agentId);
        const color = log.agentColor || agent?.color?.text || '#6B7280';
        const abbr = agent?.abbr ?? log.agentName.charAt(0).toUpperCase();
        const isActive = activeAgentTypes.has(log.agentId);

        return (
          <div
            key={`${log.timestamp}-${i}`}
            className="flex items-start gap-2 px-2 py-1.5 rounded-lg"
            style={{
              backgroundColor: isActive
                ? 'rgba(0, 122, 204, 0.05)'
                : 'rgba(0, 122, 204, 0.02)',
            }}
          >
            {/* Agent 彩色圆点 */}
            <div
              data-agent-avatar
              className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0"
              style={{ backgroundColor: color }}
              title={abbr}
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                {/* Agent 名称（彩色） */}
                <span style={{ fontSize: '12px', fontWeight: 600, color }}>
                  {log.agentName}
                </span>
                {/* 时间戳 */}
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
                  {log.time}
                </span>
              </div>
              {/* 内容 */}
              <p className="text-[11px] text-white/50 truncate" style={{ margin: 0 }}>
                {log.content}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
