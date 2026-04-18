/**
 * TaskDetailPanel - 工业级任务详情面板
 * v0.2.6
 *
 * 特性：
 * - 显示完整任务信息
 * - 状态切换（快捷操作）
 * - 验收标准显示
 * - 依赖关系可视化
 * - 子任务列表
 * - 响应式布局
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Copy, CheckCircle2, Clock, Circle, XCircle, Loader2, GitBranch } from 'lucide-react';
import { TaskNode, TaskStatus } from '../../types/taskBreakdown';
import { useTranslation } from 'react-i18next';
import { formatTaskHours, getTaskCategoryLabel, getTaskPriorityMeta, getTaskStatusMeta } from './taskBreakdownMeta';

interface TaskDetailPanelProps {
  node: TaskNode;
  /** 面板位置 */
  position?: 'right' | 'bottom';
  /** 关闭回调 */
  onClose?: () => void;
  /** 状态变更回调 */
  onStatusChange?: (nodeId: string, status: TaskStatus) => void;
}

/**
 * TaskDetailPanel 组件
 */
export const TaskDetailPanel: React.FC<TaskDetailPanelProps> = ({
  node,
  position = 'right',
  onClose,
  onStatusChange,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const statusOptions = ([
    { value: 'pending' as const, icon: Circle },
    { value: 'in_progress' as const, icon: Loader2 },
    { value: 'completed' as const, icon: CheckCircle2 },
    { value: 'failed' as const, icon: XCircle },
  ]).map((option) => ({
    ...option,
    meta: getTaskStatusMeta(option.value, t),
  }));
  const currentStatusMeta = getTaskStatusMeta(node.status, t);
  const currentStatus = statusOptions.find((option) => option.meta.key === currentStatusMeta.key) || statusOptions[0];
  const priorityMeta = getTaskPriorityMeta(node.priority, t);
  const categoryLabel = getTaskCategoryLabel(node.category, t);
  const StatusIcon = currentStatus.icon;

  /**
   * 复制节点 ID
   */
  const handleCopyId = () => {
    navigator.clipboard.writeText(node.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * 处理状态变更
   */
  const handleStatusChange = (status: TaskStatus) => {
    if (onStatusChange) {
      onStatusChange(node.id, status);
    }
  };

  return (
    <>
      <motion.div
        className={`
          theme-panel-muted theme-border border-l flex-shrink-0
          ${position === 'right' ? 'w-96' : 'h-64'}
        `}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        {/* 头部 */}
        <div className="theme-panel theme-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-5 w-5 ${currentStatus.meta.textClass} ${currentStatus.meta.key === 'inProgress' ? 'animate-spin' : ''}`} />
            <h3 className="theme-text flex-1 truncate text-sm font-medium">
              {node.title}
            </h3>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="theme-button-ghost rounded-md p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 内容区 */}
        <div className="p-4 space-y-4 overflow-auto max-h-[calc(100vh-120px)]">
          {/* 状态切换 */}
          <div>
            <label className="theme-text-subtle mb-2 block text-xs">{t('taskBreakdown.labels.status')}</label>
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map((option) => {
                const Icon = option.icon;
                const isActive = option.value === node.status;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleStatusChange(option.value)}
                    className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all
                      ${isActive
                        ? `${option.meta.surfaceClass} ${option.meta.textClass} ${option.meta.borderClass}`
                        : 'theme-input-surface theme-border theme-text-subtle hover:border-[var(--border-strong)]'
                      }
                    `}
                  >
                    <Icon className={`w-4 h-4 ${option.value === 'in_progress' && isActive ? 'animate-spin' : ''}`} />
                    <span>{option.meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 基本信息 */}
          <div className="space-y-3">
            {/* 描述 */}
            {node.description && (
              <div>
                <label className="theme-text-subtle mb-1 block text-xs">{t('taskBreakdown.labels.description')}</label>
                <p className="theme-text-muted text-sm leading-relaxed">{node.description}</p>
              </div>
            )}

            {/* 任务 ID */}
            <div>
              <label className="theme-text-subtle mb-1 block text-xs">{t('taskBreakdown.labels.taskId')}</label>
              <div className="flex items-center gap-2">
                <code className="theme-input-surface theme-border theme-text-subtle flex-1 truncate rounded border px-2 py-1 text-xs">
                  {node.id}
                </code>
                <button
                  onClick={handleCopyId}
                  className="theme-button-ghost rounded p-1"
                  title={t('taskBreakdown.actions.copyId')}
                >
                  <Copy className="w-4 h-4" />
                </button>
                {copied && (
                  <span className="text-xs text-[var(--success-color)]">{t('taskBreakdown.feedback.copied')}</span>
                )}
              </div>
            </div>

            {/* 属性网格 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 优先级 */}
              {priorityMeta && (
                <div>
                  <label className="theme-text-subtle mb-1 block text-xs">{t('taskBreakdown.labels.priority')}</label>
                  <span className={`inline-block rounded px-2 py-1 text-xs ${priorityMeta.badgeClass}`}>
                    {priorityMeta.label}
                  </span>
                </div>
              )}

              {/* 类别 */}
              {categoryLabel && (
                <div>
                  <label className="theme-text-subtle mb-1 block text-xs">{t('taskBreakdown.labels.category')}</label>
                  <span className="theme-panel-elevated theme-border theme-text-muted inline-block rounded border px-2 py-1 text-xs">
                    {categoryLabel}
                  </span>
                </div>
              )}

              {/* 工时估算 */}
              {node.estimatedHours && (
                <div>
                  <label className="theme-text-subtle mb-1 block text-xs">{t('taskBreakdown.labels.estimatedHours')}</label>
                  <span className="theme-text-muted flex items-center gap-1 text-xs">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTaskHours(node.estimatedHours, t)}
                  </span>
                </div>
              )}
            </div>

            {/* 依赖关系 */}
            {node.dependencies && node.dependencies.length > 0 && (
              <div>
                <label className="theme-text-subtle mb-2 flex items-center gap-1 text-xs">
                  <GitBranch className="w-3.5 h-3.5" />
                  {t('taskBreakdown.labels.dependencies', { count: node.dependencies.length })}
                </label>
                <div className="flex flex-wrap gap-2">
                  {node.dependencies.map((depId) => (
                    <code
                      key={depId}
                      className="rounded border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-2 py-1 text-xs text-[var(--accent-color)]"
                    >
                      {depId}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* 验收标准 */}
            {node.acceptanceCriteria && node.acceptanceCriteria.length > 0 && (
              <div>
                <label className="theme-text-subtle mb-2 block text-xs">{t('taskBreakdown.labels.acceptanceCriteria')}</label>
                <ul className="space-y-1.5">
                  {node.acceptanceCriteria.map((criteria, index) => (
                    <li
                      key={index}
                      className="theme-text-muted flex items-start gap-2 text-xs"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--success-color)]" />
                      <span>{criteria}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 子任务统计 */}
            {node.children && node.children.length > 0 && (
              <div>
                <label className="theme-text-subtle mb-2 block text-xs">{t('taskBreakdown.labels.subtasks')}</label>
                <div className="space-y-1">
                  {node.children.map((child) => {
                    const childMeta = getTaskStatusMeta(child.status, t);
                    const childStatus = statusOptions.find((option) => option.meta.key === childMeta.key) || statusOptions[0];
                    const ChildIcon = childStatus.icon;
                    return (
                      <div
                        key={child.id}
                        className="theme-hoverable theme-text-muted flex items-center gap-2 rounded p-2 text-xs transition-colors"
                      >
                        <ChildIcon className={`h-3.5 w-3.5 ${childStatus.meta.textClass} ${childStatus.meta.key === 'inProgress' ? 'animate-spin' : ''}`} />
                        <span className="flex-1 truncate">{child.title}</span>
                        {child.estimatedHours && (
                          <span className="theme-text-subtle text-[10px]">{formatTaskHours(child.estimatedHours, t, true)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default TaskDetailPanel;
