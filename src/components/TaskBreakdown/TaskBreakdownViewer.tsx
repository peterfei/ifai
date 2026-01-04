/**
 * TaskBreakdownViewer - 任务拆解结果查看器
 * v0.2.6
 *
 * 用于在聊天消息中显示任务拆解结果
 * 支持两种模式：
 * 1. inline: 内联模式（在消息中显示简化版）
 * 2. modal: 模态框模式（完整交互式任务树）
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, Minimize2, X, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { TaskBreakdown } from '../../types/taskBreakdown';
import { TaskTree } from './TaskTree';
import { useTaskBreakdownStore } from '../../stores/taskBreakdownStore';
import { createPortal } from 'react-dom';

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
  const stats = breakdown.stats || { total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0 };

  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="flex items-center gap-1.5 text-gray-400">
        <CheckCircle2 className="w-4 h-4 text-green-400" />
        <span>已完成: {stats.completed}</span>
      </span>
      <span className="flex items-center gap-1.5 text-gray-400">
        <Clock className="w-4 h-4 text-blue-400" />
        <span>进行中: {stats.inProgress}</span>
      </span>
      {stats.failed > 0 && (
        <span className="flex items-center gap-1.5 text-gray-400">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span>失败: {stats.failed}</span>
        </span>
      )}
      <span className="text-gray-500">
        总计: {stats.total} 任务
      </span>
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
  // 使用 store 管理模态框状态
  const { isModalOpen, openModal, closeModal, setCurrentBreakdown } = useTaskBreakdownStore();
  // 内部模式状态（用于 local mode 控制）
  const [localMode, setLocalMode] = useState(propMode || 'inline');

  // 如果传入了 propMode，使用 propMode；否则使用内部状态
  const mode = propMode || localMode;

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
            <h4 className="text-sm font-medium text-gray-200 truncate">{breakdown.title}</h4>
            {breakdown.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{breakdown.description}</p>
            )}
          </div>
          {allowModeSwitch && (
            <button
              onClick={handleOpenModal}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded border border-gray-700 transition-colors flex-shrink-0"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              查看完整
            </button>
          )}
        </div>

        {/* 统计信息 */}
        <StatsCard breakdown={breakdown} />

        {/* 工时信息 */}
        {breakdown.totalEstimatedHours && (
          <div className="text-xs text-gray-500">
            预估总工时: {breakdown.totalEstimatedHours.toFixed(1)} 小时
          </div>
        )}

        {/* 任务 ID */}
        <div className="text-[10px] text-gray-600 font-mono">
          ID: {breakdown.id}
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
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseModal}
          >
            <motion.div
              className="w-full max-w-6xl h-[80vh] bg-[#1a1a1a] rounded-lg border border-gray-800 overflow-hidden shadow-2xl"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[#1e1e1e]">
                <div>
                  <h3 className="text-sm font-medium text-gray-200">{breakdown.title}</h3>
                  {breakdown.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{breakdown.description}</p>
                  )}
                </div>
                <button
                  onClick={handleCloseModal}
                  className="p-2 rounded-md hover:bg-[#2a2a2a] text-gray-400 hover:text-gray-200 transition-colors"
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
