/**
 * FileChangeCard — 文件变更卡片（消息流内嵌式）
 *
 * 嵌入在 Chat 消息流中的文件变更卡片：
 * - 顶部标签：📄 文件变更
 * - 文件路径 + 变更类型图标
 * - 变更统计：+新增/-删除
 * - 变更摘要
 *
 * 设计原则：
 * - 小巧紧凑，嵌入消息流
 * - 颜色根据变更类型区分
 * - 数据从 WORKFLOW_DSL 派生
 */

import React from 'react';
import { File, Plus, Minus, GitBranch, Trash2, FileEdit } from 'lucide-react';
import type { MessageCardProps } from '../MessageCardRegistry';
import type { FileChangeData, FileChangeType } from '../WORKFLOW_DSL';

/* ===== 组件 Props ===== */

interface FileChangeCardData {
  path: string;
  change: {
    type: FileChangeType;
    oldPath?: string;
    additions?: number;
    deletions?: number;
    summary?: string;
  };
  language?: string;
}

/* ===== 变更类型配置 ===== */

const CHANGE_TYPE_CONFIG: Record<FileChangeType, { icon: any; color: string; label: string; bg: string }> = {
  create: {
    icon: Plus,
    color: '#10B981',
    label: '新建',
    bg: 'rgba(16, 185, 129, 0.1)',
  },
  modify: {
    icon: FileEdit,
    color: '#3B82F6',
    label: '修改',
    bg: 'rgba(59, 130, 246, 0.1)',
  },
  delete: {
    icon: Trash2,
    color: '#EF4444',
    label: '删除',
    bg: 'rgba(239, 68, 68, 0.1)',
  },
  rename: {
    icon: GitBranch,
    color: '#F59E0B',
    label: '重命名',
    bg: 'rgba(245, 158, 11, 0.1)',
  },
};

/* ===== 主组件 ===== */

export function FileChangeCard({ message, compact }: MessageCardProps) {
  const data = message.data as FileChangeCardData;
  const config = CHANGE_TYPE_CONFIG[data.change.type];
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
          <File className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[10px] text-gray-500 font-medium">文件变更</span>
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

      {/* 文件路径 */}
      <div className="px-3 py-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-300 font-mono truncate">{data.path}</div>
            {data.change.oldPath && (
              <div className="text-[10px] text-gray-500 font-mono truncate mt-0.5">
                ← {data.change.oldPath}
              </div>
            )}
          </div>
          {data.language && (
            <div
              className="px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0"
              style={{
                backgroundColor: 'rgba(107, 114, 128, 0.15)',
                color: '#9CA3AF',
              }}
            >
              {data.language}
            </div>
          )}
        </div>
      </div>

      {/* 变更统计 */}
      {(data.change.additions !== undefined || data.change.deletions !== undefined) && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-3 text-[10px] font-mono">
            {data.change.additions !== undefined && data.change.additions > 0 && (
              <div className="flex items-center gap-1" style={{ color: '#10B981' }}>
                <Plus className="w-3 h-3" />
                <span>{data.change.additions}</span>
              </div>
            )}
            {data.change.deletions !== undefined && data.change.deletions > 0 && (
              <div className="flex items-center gap-1" style={{ color: '#EF4444' }}>
                <Minus className="w-3 h-3" />
                <span>{data.change.deletions}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 变更摘要 */}
      {data.change.summary && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-gray-500 leading-relaxed">{data.change.summary}</p>
        </div>
      )}
    </div>
  );
}
