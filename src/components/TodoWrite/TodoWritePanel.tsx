/**
 * TodoWrite 任务面板
 *
 * 显示由 AI TodoWrite 工具创建的任务列表
 *
 * @module TodoWritePanel
 */

import React, { useEffect } from 'react';
import { CheckCircle2, CheckSquare2, Circle, Loader2, Trash2, RefreshCw, X } from 'lucide-react';
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
      return <Circle className="theme-text-subtle h-4 w-4" />;
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
      return `${baseStyle} theme-panel-muted theme-text-muted ring-1 ring-inset ring-[var(--border-color)]`;
    case 'in_progress':
      return `${baseStyle} bg-blue-500/10 text-blue-500 ring-1 ring-inset ring-blue-500/20`;
    case 'completed':
      return `${baseStyle} bg-green-500/10 text-green-500 ring-1 ring-inset ring-green-500/20`;
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
  const { loadTasks, updateTaskStatus, clearTasks, removeTask, setPanelState, repairStore } = useTodoWriteActions();

  // 🔥 FIX: 确保 tasks 始终是数组，防止 localStorage 损坏导致错误
  const safeTasks = Array.isArray(tasks) ? tasks : [];

  // 初始化时修复可能损坏的 store 数据
  useEffect(() => {
    repairStore();
  }, [repairStore]);

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
    if (safeTasks.length === 0) return;

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
        className="theme-panel-muted theme-border theme-hoverable flex h-full cursor-pointer items-center gap-1 rounded-md border px-2 py-3 transition-colors"
        onClick={() => setPanelState('full')}
        title="展开任务面板"
        data-testid="todowrite-panel-collapsed"
      >
        <CheckSquare2 size={16} className={allDone ? 'text-green-400' : 'text-blue-400'} />
        <span className={`whitespace-nowrap text-[10px] ${allDone ? 'text-green-400' : 'theme-text-subtle'}`}>
          {stats.completed}/{stats.total}{allDone ? ' ✓' : ''}
        </span>
      </div>
    );
  }

  return (
    <div className={`theme-panel-elevated theme-border theme-shadow overflow-hidden rounded-lg border ${className}`} data-testid="todowrite-panel">
      {/* 头部 */}
      <div className="theme-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="theme-text font-semibold">
            任务列表
          </h3>
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500 ring-1 ring-inset ring-blue-500/20" data-testid="task-count">
            {stats.total}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* 关闭按钮 */}
          {onClose && (
            <button
              onClick={onClose}
              className="theme-button-ghost rounded-lg p-1.5"
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
            className="theme-button-ghost rounded-lg p-1.5 disabled:opacity-50"
            title="刷新"
            data-testid="refresh-tasks-button"
          >
            <RefreshCw className={`theme-text-subtle h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} data-testid="refresh-icon" />
          </button>

          {/* 清空按钮 */}
          {safeTasks.length > 0 && (
            <button
              onClick={handleClearTasks}
              className="theme-button-ghost rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 hover:text-red-500"
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
        <div className="theme-panel-muted theme-border flex items-center gap-4 border-b px-4 py-2">
          <div className="flex items-center gap-1.5">
            <Circle className="theme-text-subtle h-3 w-3" />
            <span className="theme-text-muted text-sm" data-testid="stat-pending">
              待办: {stats.pending}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 text-blue-500" />
            <span className="theme-text-muted text-sm" data-testid="stat-in-progress">
              进行中: {stats.inProgress}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            <span className="theme-text-muted text-sm" data-testid="stat-completed">
              已完成: {stats.completed}
            </span>
          </div>
        </div>
      )}

      {/* 任务列表 */}
      <div className="max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="theme-text-subtle h-6 w-6 animate-spin" />
          </div>
        ) : safeTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="theme-text-muted text-sm">
              暂无任务
            </p>
            <p className="theme-text-subtle mt-1 text-xs">
              AI 可以使用 TodoWrite 工具创建任务
            </p>
          </div>
        ) : (
          <div className="theme-border divide-y">
            {safeTasks.map((task, index) => (
              <div
                key={index}
                className="theme-hoverable group flex items-start gap-3 px-4 py-3 transition-colors"
                data-testid="task-item"
              >
                {/* 状态图标 */}
                <div className="flex-shrink-0 mt-0.5">
                  <TaskStatusIcon status={task.status} />
                </div>

                {/* 任务内容 */}
                <div className="flex-1 min-w-0">
                  <p className="theme-text text-sm font-medium">
                    {task.content}
                  </p>
                  {task.activeForm !== task.content && (
                    <p className="theme-text-subtle mt-0.5 text-xs">
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
                        className="theme-button-ghost rounded p-1"
                        title={task.status === 'pending' ? '开始任务' : '完成任务'}
                        data-testid={task.status === 'pending' ? 'task-start-button' : 'task-complete-button'}
                      >
                        {task.status === 'pending' ? (
                          <Circle className="theme-text-subtle h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle2 className="theme-text-subtle h-3.5 w-3.5" />
                        )}
                      </button>
                    )}

                    {/* 删除按钮 */}
                    <button
                      onClick={() => handleRemoveTask(index)}
                      className="theme-button-ghost rounded p-1 text-red-400 hover:bg-red-500/10 hover:text-red-500"
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
