/**
 * AgentCompactBar — Agent 协作紧凑状态栏（对话顶部）
 *
 * 对齐原型 renderAgentDots()：
 * - Agent 圆点列表（活跃的加 glow 动画）
 * - 紧凑文本
 * - 无活跃 Agent 时隐藏
 */

import React from 'react';
import { useAgentCollabStore } from '../../stores/agentCollabStore';

export function AgentCompactBar() {
  const agentDots = useAgentCollabStore((s) => s.agentDots);
  const compactText = useAgentCollabStore((s) => s.compactText);
  const hasActiveAgents = useAgentCollabStore((s) => s.hasActiveAgents);

  // 无活跃 Agent 时隐藏
  if (!hasActiveAgents || agentDots.length === 0) return null;

  return (
    <div
      className="flex-shrink-0 flex items-center gap-3 px-4 py-2"
      style={{
        background: 'linear-gradient(180deg, rgba(0,122,204,0.06) 0%, rgba(0,122,204,0.01) 100%)',
        borderBottom: '1px solid rgba(0,122,204,0.1)',
      }}
    >
      {/* Agent 圆点 */}
      <div className="flex items-center -space-x-1">
        {agentDots.map((dot) => (
          <div
            key={dot.id}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ring-2 ring-[#1e1e28] transition-all duration-300 ${
              dot.isActive ? 'animate-glow' : 'opacity-60'
            }`}
            title={`${dot.label}${dot.isActive ? ' (活跃)' : ''}`}
            style={{
              background: dot.gradient.includes('from-brand')
                ? 'linear-gradient(135deg, #007acc, #005999)'
                : dot.gradient.includes('from-emerald')
                  ? 'linear-gradient(135deg, #10B981, #059669)'
                  : dot.gradient.includes('from-sky')
                    ? 'linear-gradient(135deg, #0EA5E9, #0284C7)'
                    : dot.gradient.includes('from-amber')
                      ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                      : dot.gradient.includes('from-pink')
                        ? 'linear-gradient(135deg, #EC4899, #DB2777)'
                        : dot.gradient.includes('from-slate')
                          ? 'linear-gradient(135deg, #94A3B8, #64748B)'
                          : dot.gradient.includes('from-purple')
                            ? 'linear-gradient(135deg, #A855F7, #9333EA)'
                            : 'linear-gradient(135deg, #6B7280, #4B5563)',
              color: '#fff',
            }}
          >
            {dot.label}
          </div>
        ))}
      </div>

      {/* 紧凑文本 */}
      {compactText && (
        <div className="text-[11px] text-white/60">{compactText}</div>
      )}
    </div>
  );
}
