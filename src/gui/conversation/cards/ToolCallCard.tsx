/**
 * ToolCallCard — 工具调用卡片（消息流内嵌式）
 *
 * 嵌入在 Chat 消息流中的工具调用卡片：
 * - 顶部标签：🔧 工具调用
 * - 工具名称 + 描述
 * - 工具状态（pending/running/success/failed/cancelled）
 * - 执行参数 + 结果
 * - 执行时长
 * - 审批按钮（pending 状态时显示）
 *
 * 设计原则：
 * - 小巧紧凑，嵌入消息流
 * - 颜色根据状态区分
 * - 数据从 WORKFLOW_DSL 派生
 * - approval onAction 传递 toolId 实现逐工具审批
 */

import React, { useState } from 'react';
import { Wrench, Loader2, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import type { MessageCardProps } from '../MessageCardRegistry';
import type { ToolCallData, ToolStatus } from '../WORKFLOW_DSL';

/* ===== 组件 Props ===== */

interface ToolCallCardData {
  name: string;
  description?: string;
  toolId?: string;
  status: ToolStatus;
  args?: Record<string, any>;
  result?: any;
  error?: string;
  duration?: number;
}

/* ===== 工具状态配置 ===== */

const STATUS_CONFIG: Record<string, { icon: any; color: string; label: string; bg: string }> = {
  pending: {
    icon: Clock,
    color: '#F59E0B',
    label: '等待中',
    bg: 'rgba(245, 158, 11, 0.1)',
  },
  approved: {
    icon: CheckCircle,
    color: '#3B82F6',
    label: '已批准',
    bg: 'rgba(59, 130, 246, 0.1)',
  },
  executing: {
    icon: Loader2,
    color: '#3B82F6',
    label: '执行中',
    bg: 'rgba(59, 130, 246, 0.1)',
  },
  running: {
    icon: Loader2,
    color: '#3B82F6',
    label: '执行中',
    bg: 'rgba(59, 130, 246, 0.1)',
  },
  success: {
    icon: CheckCircle,
    color: '#10B981',
    label: '成功',
    bg: 'rgba(16, 185, 129, 0.1)',
  },
  failed: {
    icon: XCircle,
    color: '#EF4444',
    label: '失败',
    bg: 'rgba(239, 68, 68, 0.1)',
  },
  rejected: {
    icon: XCircle,
    color: '#9CA3AF',
    label: '已拒绝',
    bg: 'rgba(107, 114, 128, 0.1)',
  },
  cancelled: {
    icon: XCircle,
    color: '#9CA3AF',
    label: '已取消',
    bg: 'rgba(107, 114, 128, 0.1)',
  },
};

/* ===== 主组件 ===== */

export function ToolCallCard({ message, compact, onAction }: MessageCardProps) {
  const data = message.data as any;
  const [expanded, setExpanded] = useState(false);

  // 安全获取 status，默认为 'pending'
  const status: string = data?.status || 'pending';
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const IconComponent = config.icon;
  const isRunning = status === 'running' || status === 'executing';
  const isPending = status === 'pending';

  return (
    <div
      className="rounded-lg border overflow-hidden transition-all duration-200"
      style={{
        backgroundColor: 'rgba(30, 30, 40, 0.9)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderLeftWidth: '3px',
        borderLeftColor: config.color,
        fontSize: compact ? '12px' : '14px',
      }}
    >
      {/* 顶部标签 */}
      <div
        className="px-3 py-2 border-b border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Wrench className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[10px] text-gray-500 font-medium">工具调用</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="px-2 py-0.5 rounded text-[9px] font-medium flex items-center gap-1"
            style={{
              backgroundColor: config.bg,
              color: config.color,
            }}
          >
            <IconComponent className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{config.label}</span>
          </div>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
          )}
        </div>
      </div>

      {/* 工具名称和描述 */}
      <div className="px-3 py-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-200 font-medium truncate">{data?.name || 'Unknown Tool'}</div>
            {data?.description && (
              <div className="text-[11px] text-gray-500 mt-0.5">{data.description}</div>
            )}
          </div>
          {data?.duration !== undefined && (
            <div
              className="px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0"
              style={{
                backgroundColor: 'rgba(107, 114, 128, 0.15)',
                color: '#9CA3AF',
              }}
            >
              {data.duration}ms
            </div>
          )}
        </div>
      </div>

      {/* 多工具模式：逐个列出 */}
      {data?.multiTool && data?.calls && (
        <div className="px-3 pb-2 space-y-1">
          {data.calls.map((call: any, index: number) => {
            const callConfig = STATUS_CONFIG[call.status] || STATUS_CONFIG.pending;
            const CallIcon = callConfig.icon;
            const isCallPending = call.status === 'pending';
            return (
              <div key={call.id || index} className="rounded border border-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-2 py-1.5 bg-white/[0.02]">
                  <div className="flex items-center gap-2 min-w-0">
                    <CallIcon className={`w-3 h-3 ${call.status === 'running' || call.status === 'executing' ? 'animate-spin' : ''}`} style={{ color: callConfig.color }} />
                    <span className="text-[11px] text-gray-300 truncate">{call.name}</span>
                  </div>
                  <div
                    className="px-1.5 py-0.5 rounded text-[8px] font-medium flex-shrink-0"
                    style={{ backgroundColor: callConfig.bg, color: callConfig.color }}
                  >
                    {callConfig.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 展开内容：参数和结果（仅单工具模式） */}
      {!data?.multiTool && expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* 参数 */}
          {data?.args && (
            <div>
              <div className="text-[10px] text-gray-500 mb-1">参数</div>
              <div
                className="p-2 rounded bg-black/30 text-[10px] font-mono text-gray-400 overflow-x-auto"
                style={{ maxHeight: '100px', overflowY: 'auto' }}
              >
                {JSON.stringify(data.args, null, 2)}
              </div>
            </div>
          )}

          {/* 结果 */}
          {data?.result && (
            <div>
              <div className="text-[10px] text-gray-500 mb-1">结果</div>
              <div
                className="p-2 rounded bg-black/30 text-[10px] font-mono text-gray-400 overflow-x-auto"
                style={{ maxHeight: '150px', overflowY: 'auto' }}
              >
                {typeof data.result === 'object' ? (
                  <pre>{JSON.stringify(data.result, null, 2)}</pre>
                ) : (
                  <pre>{String(data.result)}</pre>
                )}
              </div>
            </div>
          )}

          {/* 错误 */}
          {data?.error && (
            <div>
              <div className="text-[10px] text-red-400 mb-1">错误</div>
              <div className="p-2 rounded bg-red-500/10 text-[10px] text-red-300 border border-red-500/20">
                {data.error}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 审批由 ToolApproval 内联处理 */}
    </div>
  );
}
