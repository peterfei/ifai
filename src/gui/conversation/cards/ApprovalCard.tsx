/**
 * ApprovalCard — 审批卡片（含 approve/reject 交互）
 *
 * 对齐高保真原型 renderApprovalCard()：
 * - 头部：PM 头像 + 审批徽章 + 风险标签
 * - 文件列表
 * - 操作按钮（数据驱动 / 硬编码 fallback）
 * - approve/reject 后动画 + 状态变更
 *
 * 设计原则：
 * - 交互状态由 useState 管理
 * - onAction 回调将决策传递到 chatStore
 * - 颜色从 RISK_CONFIG 查表
 * - data.toolName 存在 → 从 Rust 获取可用决策选项，遍历渲染按钮
 * - data.toolName 不存在 → 向后兼容，渲染硬编码按钮
 */

import React, { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { MessageCardProps } from '../MessageCardRegistry';
import type { ApprovalData, RiskLevel } from '../WORKFLOW_DSL';
import { AGENT_DOT_CONFIG } from '../../../types/agent-collaboration';

import '../../../gui/conversation/styles/card-animations.css';

/* ===== 类型定义 ===== */

type Resolution = 'approved' | 'rejected' | null;

/** Rust available_decisions 返回的决策选项 */
interface DecisionDef {
  type: 'once' | 'always' | 'session' | 'deny';
  label: string;
  icon: string;
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

const RISK_LABEL: Record<RiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

const riskDotColors: Record<RiskLevel, string> = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
};

/* ===== 决策按钮样式表（数据驱动） ===== */

const DECISION_STYLES: Record<string, { className: string; style: React.CSSProperties }> = {
  once: {
    className:
      'flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all duration-200 hover:opacity-90',
    style: {
      background: 'linear-gradient(135deg, #059669, #10B981)',
      boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
    },
  },
  always: {
    className:
      'flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all duration-200 hover:opacity-90',
    style: {
      background: 'linear-gradient(135deg, #007acc, #0099ff)',
      boxShadow: '0 2px 8px rgba(0, 122, 204, 0.25)',
    },
  },
  session: {
    className:
      'flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all duration-200 hover:opacity-90',
    style: {
      background: 'linear-gradient(135deg, #d97706, #f59e0b)',
      boxShadow: '0 2px 8px rgba(217, 119, 6, 0.25)',
    },
  },
  deny: {
    className:
      'flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200',
    style: {
      backgroundColor: 'transparent',
      color: '#EF4444',
      border: '1px solid rgba(239, 68, 68, 0.3)',
    },
  },
};

/* ===== 主组件 ===== */

export function ApprovalCard({ message, compact, onAction }: MessageCardProps) {
  const data = message.data as ApprovalData;
  const [resolution, setResolution] = useState<Resolution>(null);
  const [decisions, setDecisions] = useState<DecisionDef[]>([]);
  const [decisionsLoading, setDecisionsLoading] = useState(false);

  const riskConfig = RISK_CONFIG[data.overallRisk];
  const pmConfig = AGENT_DOT_CONFIG.PM;

  /* ---- 数据驱动：从 Rust 获取可用决策选项 ---- */

  useEffect(() => {
    if (!data.toolName) return; // 无工具上下文 → 使用硬编码按钮

    let cancelled = false;
    setDecisionsLoading(true);
    setDecisions([]);

    const payload = JSON.stringify({
      tool_name: data.toolName,
      category: data.toolCategory || '',
      args_preview: data.argsPreview || '',
    });

    invoke<string>('permission_invoke', {
      action: 'available_decisions',
      payload,
    })
      .then((result) => {
        if (!cancelled && result) {
          setDecisions(JSON.parse(result));
        }
      })
      .catch(() => {
        // Rust 出错 → 保持 decisions=[]，使用硬编码 fallback
      })
      .finally(() => {
        if (!cancelled) setDecisionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [data.toolName, data.toolCategory, data.argsPreview]);

  /* ---- 决策处理 ---- */

  const handleDecision = (d: DecisionDef) => {
    if (resolution) return;

    switch (d.type) {
      case 'once':
        setResolution('approved');
        onAction?.('approve', { toolCallId: message.id });
        break;

      case 'always':
        invoke('permission_invoke', {
          action: 'add_rule',
          payload: JSON.stringify({
            rule_type: 'allow',
            tool: data.toolName || '',
            pattern: `${data.toolName || '*'}:*`,
            pattern_type: 'prefix',
          }),
        });
        setResolution('approved');
        onAction?.('approve', { toolCallId: message.id });
        break;

      case 'session':
        invoke('permission_invoke', {
          action: 'add_session_rule',
          payload: JSON.stringify({
            rule_type: 'allow',
            tool: data.toolName || '',
            pattern: '*',
            pattern_type: 'prefix',
          }),
        });
        setResolution('approved');
        onAction?.('approve', { toolCallId: message.id });
        break;

      case 'deny':
        setResolution('rejected');
        onAction?.('reject', { toolCallId: message.id });
        break;
    }
  };

  /* ---- 动画 class ---- */

  const animClass = resolution === 'approved'
    ? 'animate-approval-approved'
    : resolution === 'rejected'
      ? 'animate-approval-rejected'
      : '';

  /* ---- 渲染 ---- */

  const renderButtons = () => {
    // 数据驱动模式：有 toolName 且 decisions 已加载
    if (data.toolName) {
      if (decisionsLoading) {
        return <span className="text-[11px] text-gray-400">获取审批选项...</span>;
      }
      if (decisions.length > 0) {
        return decisions.map((d) => (
          <button
            key={d.type}
            onClick={() => handleDecision(d)}
            className={DECISION_STYLES[d.type]?.className ?? DECISION_STYLES.once.className}
            style={DECISION_STYLES[d.type]?.style ?? DECISION_STYLES.once.style}
          >
            {d.icon} {d.label}
          </button>
        ));
      }
      // decisions 为空（Rust 返回空数组或出错）→ fall through 到硬编码按钮
    }

    // 硬编码 fallback：无 toolName 或数据驱动不可用
    return (
      <>
        <button
          onClick={() => {
            if (resolution) return;
            setResolution('approved');
            onAction?.('approve', { toolCallId: message.id });
          }}
          className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all duration-200 hover:opacity-90"
          style={{
            background: 'linear-gradient(135deg, #059669, #10B981)',
            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
          }}
        >
          ✅ 确认执行
        </button>
        <button
          onClick={() => {
            if (resolution) return;
            setResolution('rejected');
            onAction?.('reject', { toolCallId: message.id });
          }}
          className="flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200"
          style={{
            backgroundColor: 'transparent',
            color: '#EF4444',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          ❌ 拒绝
        </button>
        <button className="px-2 py-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
          查看详情
        </button>
      </>
    );
  };

  return (
    <div
      className={`rounded-lg border overflow-hidden transition-all duration-300 animate-approval-slide ${animClass}`}
      style={{
        backgroundColor: 'rgba(30, 30, 40, 0.9)',
        borderColor: resolution === 'approved'
          ? 'rgba(34, 197, 94, 0.3)'
          : resolution === 'rejected'
            ? 'rgba(239, 68, 68, 0.3)'
            : 'rgba(0, 122, 204, 0.15)',
        borderLeftWidth: '3px',
        borderLeftColor: resolution === 'approved'
          ? '#22C55E'
          : resolution === 'rejected'
            ? '#EF4444'
            : '#007acc',
        fontSize: compact ? '12px' : '14px',
      }}
    >
      {/* 顶部标签行 */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* PM 头像 */}
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{
              background: `linear-gradient(135deg, #007acc, #005999)`,
              color: '#fff',
            }}
          >
            {pmConfig.label}
          </div>
          {/* 审批徽章 */}
          <div
            className="px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1"
            style={{
              backgroundColor: !resolution
                ? 'rgba(245, 158, 11, 0.15)'
                : resolution === 'approved'
                  ? 'rgba(34, 197, 94, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
              color: !resolution
                ? '#F59E0B'
                : resolution === 'approved'
                  ? '#22C55E'
                  : '#EF4444',
              border: `1px solid ${
                !resolution
                  ? 'rgba(245, 158, 11, 0.2)'
                  : resolution === 'approved'
                    ? 'rgba(34, 197, 94, 0.2)'
                    : 'rgba(239, 68, 68, 0.2)'
              }`,
            }}
          >
            <span>{!resolution ? '🔔' : resolution === 'approved' ? '✅' : '⛔'}</span>
            <span>{!resolution ? '需要审批' : resolution === 'approved' ? '已批准' : '已拒绝'}</span>
          </div>
        </div>
        {/* 风险标签 */}
        <div
          className="px-2 py-0.5 rounded-full text-[9px] font-medium"
          style={{
            backgroundColor: riskConfig.bg,
            color: riskConfig.text,
            border: '1px solid ' + riskConfig.border,
          }}
        >
          {RISK_LABEL[data.overallRisk]}
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
      <div className="px-3 pb-3 flex items-center gap-2">
        {!resolution ? (
          <>{renderButtons()}</>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-semibold"
                style={{
                  color: resolution === 'approved' ? '#22C55E' : '#EF4444',
                }}
              >
                {resolution === 'approved' ? '✓已批准' : '✗已拒绝'}
              </span>
            </div>
            <span className="text-[10px] text-gray-500">
              {resolution === 'approved' ? '已批准 · 自动继续' : '已拒绝 · 工作流已暂停'}
            </span>
          </div>
        )}
      </div>

      {/* 等待指示器 */}
      {!resolution && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-amber-400/80 animate-progress-pulse"></div>
          <span className="text-[10px] text-amber-400/60">
            {!data.toolName || !decisionsLoading
              ? '等待您的审批决定...'
              : '获取审批选项...'}
          </span>
        </div>
      )}
    </div>
  );
}
