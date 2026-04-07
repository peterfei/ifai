/**
 * TodoWrite 任务面板
 *
 * 显示由 AI TodoWrite 工具创建的任务列表
 *
 * @module TodoWritePanel
 */

import React, { useEffect } from 'react';
import { CheckCircle2, CheckSquare2, Circle, Loader2, Trash2, RefreshCw, X, ChevronLeft } from 'lucide-react';
import { useTodoWriteTasks, useTodoWriteStats, useTodoWriteLoading, useTodoWriteStore } from '../../stores/todoWriteStore';
import { useTodoWriteStore as useTodoWriteActions } from '../../stores/todoWriteStore';
import type { TaskStatus } from '../../services/taskStoreService';
import { toast } from 'sonner';

interface TodoWritePanelProps {
  className?: string;
  onClose?: () => void;
}

/**
 * 任务状态图标
 */
function TaskStatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case 'pending':
      return <Circle className="w-4 h-4 text-gray-400" />;
    case 'in_progress':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  }
}

/**
 * 任务状态标签样式
 */
function getStatusBadgeStyle(status: TaskStatus): string {
  const baseStyle = 'px-2 py-0.5 rounded-full text-xs font-medium';
  switch (status) {
    case 'pending':
      return `${baseStyle} bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300`;
    case 'in_progress':
      return `${baseStyle} bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300`;
    case 'completed':
      return `${baseStyle} bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300`;
  }
}

/**
 * TodoWrite 任务面板
 */
export const TodoWritePanel: React.FC<TodoWritePanelProps> = ({ className = '', onClose }) => {
  const tasks = useTodoWriteTasks();
  const stats = useTodoWriteStats();
  const isLoading = useTodoWriteLoading();
  const panelState = useTodoWriteStore((s) => s.panelState);
  const { loadTasks, updateTaskStatus, clearTasks, removeTask, setPanelState } = useTodoWriteActions();

  // 初始加载
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 处理状态切换
  const handleStatusChange = async (index: number, newStatus: TaskStatus) => {
    try {
      await updateTaskStatus(index, newStatus);
      toast.success('任务状态已更新');
    } catch (error) {
      toast.error('更新任务状态失败');
    }
  };

  // 处理删除任务
  const handleRemoveTask = async (index: number) => {
    try {
      await removeTask(index);
      toast.success('任务已删除');
    } catch (error) {
      toast.error('删除任务失败');
    }
  };

  // 处理清空任务
  const handleClearTasks = async () => {
    if (tasks.length === 0) return;

    try {
      await clearTasks();
      toast.success('任务列表已清空');
    } catch (error) {
      toast.error('清空任务失败');
    }
  };

  // 处理刷新
  const handleRefresh = async () => {
    try {
      await loadTasks();
      toast.success('任务列表已刷新');
    } catch (error) {
      toast.error('刷新任务列表失败');
    }
  };

  // 折叠态：紧凑摘要栏
  if (panelState === 'collapsed') {
    const allDone = stats.total > 0 && stats.completed === stats.total;
    return (
      <div
        className="flex items-center gap-1 px-1 py-3 cursor-pointer hover:bg-gray-700/50 transition-colors h-full"
        onClick={() => setPanelState('full')}
        title="展开任务面板"
        data-testid="todowrite-panel-collapsed"
      >
        <CheckSquare2 size={16} className={allDone ? 'text-green-400' : 'text-blue-400'} />
        <span className={`text-[10px] whitespace-nowrap ${allDone ? 'text-green-400' : 'text-gray-400'}`}>
          {stats.completed}/{stats.total}{allDone ? ' ✓' : ''}
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`} data-testid="todowrite-panel">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            任务列表
          </h3>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded-full text-xs font-medium" data-testid="task-count">
            {stats.total}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* 关闭按钮 */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
              title="关闭面板"
              data-testid="close-panel-button"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* 刷新按钮 */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            title="刷新"
            data-testid="refresh-tasks-button"
          >
            <RefreshCw className={`w-4 h-4 text-gray-600 dark:text-gray-400 ${isLoading ? 'animate-spin' : ''}`} data-testid="refresh-icon" />
          </button>

          {/* 清空按钮 */}
          {tasks.length > 0 && (
            <button
              onClick={handleClearTasks}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
              title="清空所有任务"
              data-testid="clear-tasks-button"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 统计信息 */}
      {stats.total > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1.5">
            <Circle className="w-3 h-3 text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-400" data-testid="stat-pending">
              待办: {stats.pending}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 text-blue-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400" data-testid="stat-in-progress">
              进行中: {stats.inProgress}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400" data-testid="stat-completed">
              已完成: {stats.completed}
            </span>
          </div>
        </div>
      )}

      {/* 任务列表 */}
      <div className="max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              暂无任务
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
              AI 可以使用 TodoWrite 工具创建任务
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {tasks.map((task, index) => (
              <div
                key={index}
                className="group flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                data-testid="task-item"
              >
                {/* 状态图标 */}
                <div className="flex-shrink-0 mt-0.5">
                  <TaskStatusIcon status={task.status} />
                </div>

                {/* 任务内容 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {task.content}
                  </p>
                  {task.activeForm !== task.content && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {task.activeForm}
                    </p>
                  )}
                </div>

                {/* 状态标签和操作 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={getStatusBadgeStyle(task.status)} data-testid="task-status">
                    {task.status === 'in_progress' ? '进行中' :
                     task.status === 'completed' ? '已完成' : '待办'}
                  </span>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* 状态切换按钮 */}
                    {task.status !== 'completed' && (
                      <button
                        onClick={() => handleStatusChange(index, task.status === 'pending' ? 'in_progress' : 'completed')}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                        title={task.status === 'pending' ? '开始任务' : '完成任务'}
                        data-testid={task.status === 'pending' ? 'task-start-button' : 'task-complete-button'}
                      >
                        {task.status === 'pending' ? (
                          <Circle className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
                        )}
                      </button>
                    )}

                    {/* 删除按钮 */}
                    <button
                      onClick={() => handleRemoveTask(index)}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                      title="删除任务"
                      data-testid="task-delete-button"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TodoWritePanel;
