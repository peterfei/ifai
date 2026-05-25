/**
 * ApprovalCard — 审批摘要卡片（信息面板，无操作按钮）
 *
 * 嵌入在 Chat 消息流中的审批摘要卡片：
 * - 顶部标签："🔔 需要审批"
 * - 标题 + 描述 + 风险标签
 * - 受影响文件列表
 *
 * 注意：确认/拒绝按钮由 ToolApproval 在每个工具旁内联处理
 *
 * 设计原则：
 * - 小巧紧凑，嵌入消息流
 * - 颜色从 RISK_PALETTE 查表
 * - 数据从 WORKFLOW_DSL 派生
 */

import React from 'react';
import { FileText } from 'lucide-react';
import type { MessageCardProps } from '../MessageCardRegistry';
import type { ApprovalData, RiskLevel } from '../WORKFLOW_DSL';

/* ===== 组件 Props ===== */

interface ApprovalCardData {
  title: string;
  description: string;
  overallRisk: RiskLevel;
  files: Array<{
    path: string;
    change: string;
    risk: RiskLevel;
  }>;
}

/* ===== 风险等级颜色配置 ===== */

const RISK_CONFIG: Record<RiskLevel, { bg: string; text: string; border: string; dot: string }> = {
  low: {
    bg: 'rgba(16, 185, 129, 0.1)',
    text: '#10B981',
    border: 'rgba(16, 185, 129, 0.2)',
    dot: '#10B981',
  },
  medium: {
    bg: 'rgba(245, 158, 11, 0.1)',
    text: '#F59E0B',
    border: 'rgba(245, 158, 11, 0.2)',
    dot: '#F59E0B',
  },
  high: {
    bg: 'rgba(239, 68, 68, 0.1)',
    text: '#EF4444',
    border: 'rgba(239, 68, 68, 0.2)',
    dot: '#EF4444',
  },
};

/* ===== 主组件 ===== */

export function ApprovalCard({ message, compact }: MessageCardProps) {
  const data = message.data as ApprovalCardData;

  const riskConfig = RISK_CONFIG[data.overallRisk];

  return (
    <div
      className="rounded-lg border overflow-hidden transition-all duration-300"
      style={{
        backgroundColor: 'rgba(30, 30, 40, 0.9)',
        borderColor: 'rgba(0, 122, 204, 0.15)',
        borderLeftWidth: '3px',
        borderLeftColor: '#007acc',
        fontSize: compact ? '12px' : '14px',
      }}
    >
      {/* 顶部标签 */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
        <div
          className="px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1"
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            color: '#F59E0B',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}
        >
          <span>🔔</span>
          <span>需要审批</span>
        </div>
        <div
          className="px-2 py-0.5 rounded-full text-[9px] font-medium"
          style={{
            backgroundColor: riskConfig.bg,
            color: riskConfig.text,
            border: '1px solid ' + riskConfig.border,
          }}
        >
          {data.overallRisk === 'low' && '低风险'}
          {data.overallRisk === 'medium' && '中风险'}
          {data.overallRisk === 'high' && '高风险'}
        </div>
      </div>

      {/* 标题行 */}
      <div className="px-3 py-2 flex items-start gap-2">
        <FileText className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="text-white font-semibold text-sm truncate">{data.title}</h4>
        </div>
      </div>

      {/* 描述文本 */}
      <div className="px-3 pb-2">
        <p className="text-gray-400 text-xs leading-relaxed">{data.description}</p>
      </div>

      {/* 受影响文件列表 */}
      {data.files && data.files.length > 0 && (
        <div className="px-3 pb-3">
          <div className="space-y-1.5">
            {data.files.map((file, index) => {
              const fileRiskConfig = RISK_CONFIG[file.risk];
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 px-2 py-1.5 rounded border border-white/5 bg-white/[0.02]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-300 font-mono truncate">{file.path}</div>
                    <div className="text-[10px] text-gray-500">{file.change}</div>
                  </div>
                  <div
                    className="px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0"
                    style={{
                      backgroundColor: fileRiskConfig.bg,
                      color: fileRiskConfig.text,
                    }}
                  >
                    {file.risk === 'low' && '低'}
                    {file.risk === 'medium' && '中'}
                    {file.risk === 'high' && '高'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 确认/拒绝按钮由 ToolApproval 内联处理 */}
    </div>
  );
}
