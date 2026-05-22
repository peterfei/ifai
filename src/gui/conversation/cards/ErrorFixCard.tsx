/**
 * ErrorFixCard — 错误修复卡片（消息流内嵌式）
 *
 * 嵌入在 Chat 消息流中的错误修复卡片：
 * - 顶部标签：⚠️ 错误/警告
 * - 错误消息 + 位置
 * - 建议的修复方案列表
 * - 自动修复标记
 *
 * 设计原则：
 * - 小巧紧凑，嵌入消息流
 * - 颜色根据严重程度区分
 * - 数据从 WORKFLOW_DSL 派生
 */

import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, Check, ChevronDown, ChevronRight, Code } from 'lucide-react';
import type { MessageCardProps } from '../MessageCardRegistry';
import type { ErrorFixData, ErrorSeverity } from '../WORKFLOW_DSL';

/* ===== 组件 Props ===== */

interface ErrorFixCardData {
  message: string;
  severity: ErrorSeverity;
  location?: string;
  suggestions: Array<{
    title: string;
    description: string;
    code?: string;
  }>;
  autoFixed?: boolean;
}

/* ===== 错误严重程度配置 ===== */

const SEVERITY_CONFIG: Record<ErrorSeverity, { icon: any; color: string; label: string; bg: string }> = {
  error: {
    icon: AlertCircle,
    color: '#EF4444',
    label: '错误',
    bg: 'rgba(239, 68, 68, 0.1)',
  },
  warning: {
    icon: AlertTriangle,
    color: '#F59E0B',
    label: '警告',
    bg: 'rgba(245, 158, 11, 0.1)',
  },
  info: {
    icon: Info,
    color: '#3B82F6',
    label: '提示',
    bg: 'rgba(59, 130, 246, 0.1)',
  },
};

/* ===== 主组件 ===== */

export function ErrorFixCard({ message, compact }: MessageCardProps) {
  const data = message.data as ErrorFixCardData;
  const [expandedSuggestion, setExpandedSuggestion] = useState<number | null>(null);
  const config = SEVERITY_CONFIG[data.severity];
  const IconComponent = config.icon;

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
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconComponent className="w-3.5 h-3.5" style={{ color: config.color }} />
          <span className="text-[10px] text-gray-500 font-medium">
            {data.severity === 'error' && '错误'}
            {data.severity === 'warning' && '警告'}
            {data.severity === 'info' && '提示'}
          </span>
        </div>
        {data.autoFixed && (
          <div
            className="px-2 py-0.5 rounded text-[9px] font-medium flex items-center gap-1"
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              color: '#10B981',
            }}
          >
            <Check className="w-3 h-3" />
            <span>已自动修复</span>
          </div>
        )}
      </div>

      {/* 错误消息 */}
      <div className="px-3 py-2">
        <div className="text-sm text-gray-200 leading-relaxed">{data.message}</div>
        {data.location && (
          <div className="text-[10px] text-gray-500 font-mono mt-1">{data.location}</div>
        )}
      </div>

      {/* 修复建议 */}
      {data.suggestions && data.suggestions.length > 0 && (
        <div className="px-3 pb-3">
          <div className="text-[10px] text-gray-500 mb-2">
            建议修复方案 ({data.suggestions.length})
          </div>
          <div className="space-y-2">
            {data.suggestions.map((suggestion, index) => {
              const isExpanded = expandedSuggestion === index;
              return (
                <div
                  key={index}
                  className="rounded border border-white/5 overflow-hidden"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  {/* 建议标题 */}
                  <div
                    className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => setExpandedSuggestion(isExpanded ? null : index)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Check className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      <span className="text-xs text-gray-300 font-medium truncate">
                        {suggestion.title}
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    )}
                  </div>

                  {/* 展开内容：描述和代码 */}
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2">
                      {/* 描述 */}
                      <div className="text-[11px] text-gray-400 leading-relaxed">
                        {suggestion.description}
                      </div>

                      {/* 代码示例 */}
                      {suggestion.code && (
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <Code className="w-3 h-3 text-gray-500" />
                            <span className="text-[10px] text-gray-500">代码示例</span>
                          </div>
                          <div className="p-2 rounded bg-black/30 text-[10px] font-mono text-gray-400 overflow-x-auto border border-white/5">
                            <pre className="whitespace-pre-wrap">{suggestion.code}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
