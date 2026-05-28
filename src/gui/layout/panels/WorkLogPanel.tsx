/**
 * WorkLogPanel — 工作日志子面板
 *
 * 从 useWorkLogData 获取真实日志数据，
 * 使用 AGENT_DSL 颜色查表渲染 Agent 头像和名称
 */

import React from 'react';
import { useWorkLogData } from './useWorkLogData';
import { getAgent } from '../../conversation/AGENT_DSL';

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

        return (
          <div
            key={`${log.timestamp}-${i}`}
            className="flex items-start gap-2 px-2 py-1.5 rounded-lg"
            style={{
              backgroundColor: 'rgba(0, 122, 204, 0.02)',
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
