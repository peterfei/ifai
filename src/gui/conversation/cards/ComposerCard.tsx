/**
 * ComposerCard — Composer 卡片（消息流内嵌式）
 *
 * 嵌入在 Chat 消息流中的 Composer 卡片：
 * - 顶部标签：📝 Composer
 * - Composer 标题 + 状态
 * - 文件变更列表
 * - 总变更统计
 * - 操作按钮
 *
 * 设计原则：
 * - 小巧紧凑，嵌入消息流
 * - 颜色根据状态区分
 * - 数据从 WORKFLOW_DSL 派生
 */

import React from 'react';
import { FileEdit, CheckCircle, Eye, Play, X } from 'lucide-react';
import type { MessageCardProps } from '../MessageCardRegistry';
import type { ComposerData, ComposerStatus } from '../WORKFLOW_DSL';

/* ===== 组件 Props ===== */

interface ComposerCardData {
  title: string;
  status: ComposerStatus;
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
  }>;
  stats: {
    totalAdditions: number;
    totalDeletions: number;
    filesChanged: number;
  };
  actions?: Array<{
    label: string;
    action: string;
  }>;
}

/* ===== Composer 状态配置 ===== */

const STATUS_CONFIG: Record<ComposerStatus, { icon: any; color: string; label: string; bg: string }> = {
  drafting: {
    icon: FileEdit,
    color: '#6B7280',
    label: '草稿中',
    bg: 'rgba(107, 114, 128, 0.1)',
  },
  reviewing: {
    icon: Eye,
    color: '#3B82F6',
    label: '审查中',
    bg: 'rgba(59, 130, 246, 0.1)',
  },
  applying: {
    icon: Play,
    color: '#F59E0B',
    label: '应用中',
    bg: 'rgba(245, 158, 11, 0.1)',
  },
  done: {
    icon: CheckCircle,
    color: '#10B981',
    label: '已完成',
    bg: 'rgba(16, 185, 129, 0.1)',
  },
};

/* ===== 主组件 ===== */

export function ComposerCard({ message, compact, onAction }: MessageCardProps) {
  const data = message.data as ComposerCardData;
  const config = STATUS_CONFIG[data.status];
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
          <FileEdit className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[10px] text-gray-500 font-medium">Composer</span>
        </div>
        <div
          className="px-2 py-0.5 rounded text-[9px] font-medium flex items-center gap-1"
          style={{
            backgroundColor: config.bg,
            color: config.color,
          }}
        >
          <IconComponent className="w-3 h-3" />
          <span>{config.label}</span>
        </div>
      </div>

      {/* Composer 标题 */}
      <div className="px-3 py-2">
        <div className="text-sm text-gray-200 font-medium">{data.title}</div>
      </div>

      {/* 总变更统计 */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">文件变更:</span>
            <span className="text-gray-300 font-medium">{data.stats.filesChanged}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">新增:</span>
            <span className="text-green-400 font-medium">+{data.stats.totalAdditions}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">删除:</span>
            <span className="text-red-400 font-medium">-{data.stats.totalDeletions}</span>
          </div>
        </div>
      </div>

      {/* 文件列表 */}
      {data.files && data.files.length > 0 && (
        <div className="px-3 pb-3">
          <div className="space-y-1.5">
            {data.files.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-3 px-3 py-2 rounded bg-white/[0.02] border border-white/5"
              >
                {/* 文件图标 */}
                <FileEdit className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />

                {/* 文件路径 */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-300 font-mono truncate">{file.path}</div>
                </div>

                {/* 变更统计 */}
                <div className="flex items-center gap-2 text-[10px] font-mono flex-shrink-0">
                  {file.additions > 0 && (
                    <span className="text-green-400">+{file.additions}</span>
                  )}
                  {file.deletions > 0 && (
                    <span className="text-red-400">-{file.deletions}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      {data.actions && data.actions.length > 0 && data.status !== 'done' && (
        <div className="px-3 pb-3 flex gap-2">
          {data.actions.map((action, index) => {
            const isPrimary = index === 0;
            return (
              <button
                key={index}
                onClick={() => onAction?.(action.action, data)}
                className="flex-1 px-3 py-2 rounded-lg text-[11px] font-medium transition-all duration-200 flex items-center justify-center gap-1.5"
                style={{
                  background: isPrimary
                    ? 'linear-gradient(135deg, #007acc, #0088ff)'
                    : 'transparent',
                  color: isPrimary ? 'white' : '#9CA3AF',
                  border: isPrimary ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: isPrimary
                    ? '0 2px 8px rgba(0, 122, 204, 0.25)'
                    : 'none',
                }}
              >
                {action.label === '查看详情' && <Eye className="w-3.5 h-3.5" />}
                {action.label === '应用变更' && <Play className="w-3.5 h-3.5" />}
                {action.label === '取消' && <X className="w-3.5 h-3.5" />}
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
