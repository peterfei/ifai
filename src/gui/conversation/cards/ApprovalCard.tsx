/**
 * ApprovalCard — 审批卡片（消息流内嵌式）
 *
 * 嵌入在 Chat 消息流中的审批卡片：
 * - 顶部标签："🔔 需要审批"
 * - 标题 + 描述 + 风险标签
 * - 受影响文件列表
 * - 操作按钮：确认执行 / 拒绝 / 查看详情
 * - 底部等待提示
 *
 * 设计原则：
 * - 小巧紧凑，嵌入消息流
 * - 颜色从 RISK_PALETTE 查表
 * - 数据从 WORKFLOW_DSL 派生
 */

import React, { useState } from 'react';
import { Check, X, FileText, AlertTriangle } from 'lucide-react';
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
  onApprove?: 'continue' | 'skip' | 'stop';
  onReject?: 'continue' | 'skip' | 'stop';
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

export function ApprovalCard({ message, compact, onAction }: MessageCardProps) {
  const data = message.data as ApprovalCardData;
  const [approved, setApproved] = useState(false);
  const [rejected, setRejected] = useState(false);

  const riskConfig = RISK_CONFIG[data.overallRisk];

  const handleApprove = () => {
    setApproved(true);
    // TODO: 动画效果
    setTimeout(() => {
      onAction?.('approve', data.onApprove);
    }, 500);
  };

  const handleReject = () => {
    setRejected(true);
    // TODO: 动画效果
    setTimeout(() => {
      onAction?.('reject', data.onReject);
    }, 500);
  };

  return (
    <div
      className="rounded-lg border overflow-hidden transition-all duration-300"
      style={{
        backgroundColor: 'rgba(30, 30, 40, 0.9)',
        borderColor: approved
          ? 'rgba(16, 185, 129, 0.3)'
          : rejected
          ? 'rgba(239, 68, 68, 0.3)'
          : 'rgba(0, 122, 204, 0.15)',
        borderLeftWidth: '3px',
        borderLeftColor: approved
          ? '#10B981'
          : rejected
          ? '#EF4444'
          : '#007acc',
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

      {/* 操作按钮行 */}
      <div className="px-3 pb-3 flex gap-2">
        <button
          onClick={handleApprove}
          disabled={approved || rejected}
          className="flex-1 px-3.5 py-2 rounded-lg text-[11px] font-semibold text-white transition-all duration-200 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: approved
              ? '#10B981'
              : 'linear-gradient(135deg, #059669, #10B981)',
            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25), 0 0 16px rgba(5, 150, 105, 0.1)',
          }}
        >
          {approved ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>已批准</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>确认执行</span>
            </>
          )}
        </button>

        <button
          onClick={handleReject}
          disabled={approved || rejected}
          className="flex-1 px-3.5 py-2 rounded-lg text-[11px] font-semibold text-white transition-all duration-200 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: rejected
              ? '#EF4444'
              : 'linear-gradient(135deg, #DC2626, #EF4444)',
            boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25), 0 0 16px rgba(220, 38, 38, 0.1)',
          }}
        >
          {rejected ? (
            <>
              <X className="w-3.5 h-3.5" />
              <span>已拒绝</span>
            </>
          ) : (
            <>
              <X className="w-3.5 h-3.5" />
              <span>拒绝</span>
            </>
          )}
        </button>
      </div>

      {/* 底部等待提示 */}
      {!approved && !rejected && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-amber-400/80 animate-pulse"></div>
          <span className="text-[10px] text-amber-400/60">等待您的审批决定...</span>
        </div>
      )}
    </div>
  );
}
