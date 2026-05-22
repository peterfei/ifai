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
    <div data-testid="work-log-panel" style={{ padding: '8px 12px', overflowY: 'auto' }}>
      {logs.map((log, i) => {
        const agent = getAgent(log.agentId);
        const color = agent?.color;
        const abbr = agent?.abbr ?? log.agentName.charAt(0).toUpperCase();

        return (
          <div
            key={`${log.timestamp}-${i}`}
            style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}
          >
            {/* Agent 头像 */}
            <div
              data-agent-avatar
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                backgroundColor: color?.bg ?? '#6B7280',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {abbr}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* 名称 + 时间 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: color?.text ?? '#eef2f6' }}>
                  {log.agentName}
                </span>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>{log.time}</span>
              </div>
              {/* 内容 */}
              <p style={{ fontSize: 13, color: '#fff', lineHeight: 1.4, margin: 0 }}>
                {log.content}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
