/**
 * TaskBreakdownViewer - 任务拆解结果查看器
 * v0.2.6
 *
 * 用于在聊天消息中显示任务拆解结果
 * 支持两种模式：
 * 1. inline: 内联模式（在消息中显示简化版）
 * 2. modal: 模态框模式（完整交互式任务树）
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, X, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { TaskBreakdown } from '../../types/taskBreakdown';
import { TaskTree } from './TaskTree';
import { useTaskBreakdownStore } from '../../stores/taskBreakdownStore';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatTaskHours, getTaskStatusMeta } from './taskBreakdownMeta';

interface TaskBreakdownViewerProps {
  breakdown: TaskBreakdown;
  /** 显示模式 */
  mode?: 'inline' | 'modal';
  /** 是否允许切换模式 */
  allowModeSwitch?: boolean;
}

/**
 * 简化的统计信息卡片（用于 inline 模式）
 */
const StatsCard: React.FC<{ breakdown: TaskBreakdown }> = ({ breakdown }) => {
  const { t } = useTranslation();
  const stats = (breakdown.stats as any) || { total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0 };
  const completedMeta = getTaskStatusMeta('completed', t);
  const inProgressMeta = getTaskStatusMeta('in_progress', t);
  const failedMeta = getTaskStatusMeta('failed', t);

  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="theme-text-subtle flex items-center gap-1.5">
        <CheckCircle2 className={`h-4 w-4 ${completedMeta.textClass}`} />
        <span>{t('taskBreakdown.stats.completed', { count: stats.completed || 0 })}</span>
      </span>
      <span className="theme-text-subtle flex items-center gap-1.5">
        <Clock className={`h-4 w-4 ${inProgressMeta.textClass}`} />
        <span>{t('taskBreakdown.stats.inProgress', { count: stats.inProgress || 0 })}</span>
      </span>
      {(stats.failed || 0) > 0 && (
        <span className="theme-text-subtle flex items-center gap-1.5">
          <AlertCircle className={`h-4 w-4 ${failedMeta.textClass}`} />
          <span>{t('taskBreakdown.stats.failed', { count: stats.failed })}</span>
        </span>
      )}
      <span className="theme-text-subtle">{t('taskBreakdown.stats.total', { count: stats.total || 0 })}</span>
    </div>
  );
};

/**
 * TaskBreakdownViewer 组件
 */
export const TaskBreakdownViewer: React.FC<TaskBreakdownViewerProps> = ({
  breakdown,
  mode: propMode,
  allowModeSwitch = true,
}) => {
  const { t } = useTranslation();
  // 使用 store 管理模态框状态
  const { isModalOpen, openModal, closeModal, setCurrentBreakdown } = useTaskBreakdownStore();
  const mode = propMode || 'inline';

  /**
   * 切换到全屏模式
   */
  const handleOpenModal = () => {
    // 设置到 store
    setCurrentBreakdown(breakdown);
    openModal();
  };

  /**
   * 关闭模态框
   */
  const handleCloseModal = () => {
    closeModal();
  };

  /**
   * Inline 模式 - 简化的预览
   */
  if (mode === 'inline' && !isModalOpen) {
    return (
      <div className="space-y-3">
        {/* 头部信息 */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h4 className="theme-text truncate text-sm font-medium">{breakdown.title}</h4>
            {breakdown.description && (
              <p className="theme-text-subtle mt-1 line-clamp-2 text-xs">{breakdown.description}</p>
            )}
          </div>
          {allowModeSwitch && (
            <button
              onClick={handleOpenModal}
              className="theme-button-secondary flex flex-shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              {t('taskBreakdown.actions.viewFull')}
            </button>
          )}
        </div>

        {/* 统计信息 */}
        <StatsCard breakdown={breakdown} />

        {/* 工时信息 */}
        {breakdown.totalEstimatedHours && (
          <div className="theme-text-subtle text-xs">
            {t('taskBreakdown.labels.totalEstimatedHours', {
              hours: formatTaskHours(Number(breakdown.totalEstimatedHours.toFixed(1)), t),
            })}
          </div>
        )}

        {/* 任务 ID */}
        <div className="theme-text-subtle font-mono text-[10px]">
          {t('taskBreakdown.labels.id', { id: breakdown.id })}
        </div>
      </div>
    );
  }

  /**
   * Modal 模式 - 完整交互式任务树（通过 Portal 渲染到 body）
   */
  if (mode === 'modal' || isModalOpen) {
    return createPortal(
      <AnimatePresence>
        {(mode === 'modal' || isModalOpen) && (
          <motion.div
            className="theme-backdrop-strong fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseModal}
          >
            <motion.div
              className="theme-panel-elevated theme-border theme-shadow h-[80vh] w-full max-w-6xl overflow-hidden rounded-lg border"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h3 className="theme-text text-sm font-medium">{breakdown.title}</h3>
                  {breakdown.description && (
                    <p className="theme-text-subtle mt-0.5 text-xs">{breakdown.description}</p>
                  )}
                </div>
                <button
                  onClick={handleCloseModal}
                  className="theme-button-ghost rounded-md p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 任务树 */}
              <TaskTree taskTree={breakdown.taskTree} showDetailPanel={true} detailPanelPosition="right" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    );
  }

  return null;
};

export default TaskBreakdownViewer;
