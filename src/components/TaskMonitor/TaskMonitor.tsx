/**
 * TaskMonitor Component
 *
 * Main container component for the task monitoring system.
 * Displays a list of tasks with filtering and summary.
 */

import React, { useState } from 'react';
import { Filter, Trash2, X, Search } from 'lucide-react';
import { TaskCard } from './TaskCard';
import { TaskStatusBadge } from './TaskStatusBadge';
import { useTaskStore, useFilteredTasks, useTaskCounts } from '../../stores/taskStore';
import type { TaskFilter, TaskCardMode } from './types';
import { TaskStatus, TaskCategory } from './types';

// ============================================================================
// Props
// ============================================================================

export interface TaskMonitorProps {
  /** Display mode for task cards */
  mode?: TaskCardMode;

  /** Maximum number of tasks to display */
  maxTasks?: number;

  /** Show filter controls */
  showFilter?: boolean;

  /** Show summary header */
  showSummary?: boolean;

  /** Auto-hide when no tasks */
  autoHide?: boolean;

  /** Custom className */
  className?: string;

  /** Event handlers */
  onTaskClick?: (taskId: string) => void;
}

// ============================================================================
// Filter Component
// ============================================================================

interface TaskFilterControlsProps {
  filter: TaskFilter;
  onFilterChange: (filter: TaskFilter) => void;
  counts: ReturnType<typeof useTaskCounts>;
}

const TaskFilterControls: React.FC<TaskFilterControlsProps> = ({
  filter,
  onFilterChange,
  counts,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState(filter.search || '');

  // Status quick filter buttons
  const STATUS_OPTIONS: Array<{ value: TaskStatus | 'all'; label: string; color: string }> = [
    { value: 'all', label: '全部', color: '#858585' },
    { value: 'running' as TaskStatus, label: '运行中', color: '#569cd6' },
    { value: 'pending' as TaskStatus, label: '等待中', color: '#858585' },
    { value: 'success' as TaskStatus, label: '已完成', color: '#4ec9b0' },
    { value: 'failed' as TaskStatus, label: '失败', color: '#f14c4c' },
  ];

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    // Debounce search
    const timeout = setTimeout(() => {
      onFilterChange({ ...filter, search: value || undefined });
    }, 300);
    return () => clearTimeout(timeout);
  };

  const handleReset = () => {
    setSearchInput('');
    onFilterChange({ status: 'all', category: 'all', search: undefined });
  };

  const hasActiveFilters = filter.status !== 'all' || filter.category !== 'all' || filter.search;

  return (
    <div className="task-filter-controls">
      {/* Filter toggle button with indicator */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-1.5 px-2 py-1 text-[11px] rounded transition-colors ${
          hasActiveFilters
            ? 'text-[#569cd6] bg-[#569cd610] hover:bg-[#569cd620]'
            : 'text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e]'
        }`}
      >
        <Filter size={12} />
        <span>筛选</span>
        {hasActiveFilters && (
          <span className="ml-1 px-1.5 py-0.5 bg-[#569cd6] text-white text-[9px] rounded-full">
            ●
          </span>
        )}
      </button>

      {/* Expanded filter panel */}
      {expanded && (
        <div className="mt-2 p-3 bg-[#1e1e1e] border border-[#3c3c3c] rounded space-y-3">
          {/* Search input */}
          <div>
            <label className="text-[10px] text-[#858585] uppercase tracking-wider mb-1 block">
              搜索
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  handleSearchChange(e.target.value);
                }}
                placeholder="搜索任务标题或描述..."
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1.5 pl-7 text-[11px] text-[#cccccc] placeholder-[#858585] focus:outline-none focus:border-[#569cd6]"
              />
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#858585]" />
              {searchInput && (
                <button
                  onClick={() => handleSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#858585] hover:text-[#cccccc]"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Status quick filters */}
          <div>
            <label className="text-[10px] text-[#858585] uppercase tracking-wider mb-1.5 block">
              状态
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map(({ value, label, color }) => {
                const isActive = filter.status === value;
                const count = value === 'all' ? counts.total :
                  value === 'running' ? counts.running :
                  value === 'pending' ? counts.pending :
                  value === 'success' ? counts.success :
                  value === 'failed' ? counts.failed : 0;

                return (
                  <button
                    key={value}
                    onClick={() => onFilterChange({ ...filter, status: value })}
                    className={`px-2 py-1 text-[10px] rounded transition-colors ${
                      isActive
                        ? 'text-white'
                        : 'text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e]'
                    }`}
                    style={{
                      backgroundColor: isActive ? color : undefined,
                    }}
                    title={`${label}: ${count}`}
                  >
                    {label}
                    {count > 0 && (
                      <span className={`ml-1 ${isActive ? 'opacity-80' : 'opacity-50'}`}>
                        ({count})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category filter */}
          <div>
            <label className="text-[10px] text-[#858585] uppercase tracking-wider mb-1.5 block">
              类别
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { value: 'all', label: '全部' },
                { value: 'scan', label: '🔍 扫描' },
                { value: 'build', label: '🔨 构建' },
                { value: 'generation', label: '✨ 生成' },
                { value: 'transfer', label: '📦 传输' },
                { value: 'analysis', label: '📊 分析' },
                { value: 'test', label: '🧪 测试' },
                { value: 'deploy', label: '🚀 部署' },
                { value: 'install', label: '📦 安装' },
                { value: 'git', label: '🔀 Git' },
                { value: 'format', label: '✨ 格式' },
                { value: 'refactor', label: '🔧 重构' },
                { value: 'document', label: '📝 文档' },
                { value: 'backup', label: '💾 备份' },
                { value: 'cleanup', label: '🧹 清理' },
                { value: 'optimize', label: '⚡ 优化' },
                { value: 'security', label: '🔒 安全' },
              ].map(({ value, label }) => {
                const isActive = filter.category === value;
                return (
                  <button
                    key={value}
                    onClick={() => onFilterChange({ ...filter, category: value as TaskCategory | 'all' })}
                    className={`px-2 py-1.5 text-[10px] rounded transition-colors text-center ${
                      isActive
                        ? 'bg-[#569cd6] text-white'
                        : 'bg-[#252526] text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between pt-2 border-t border-[#3c3c3c]">
              <span className="text-[10px] text-[#858585]">
                {counts.total} 个任务中的 {counts.total} 个
              </span>
              <button
                onClick={handleReset}
                className="text-[10px] text-[#569cd6] hover:text-[#569cd6] hover:underline"
              >
                重置筛选
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Summary Component
// ============================================================================

interface TaskSummaryProps {
  counts: ReturnType<typeof useTaskCounts>;
  onClearCompleted?: () => void;
}

const TaskSummary: React.FC<TaskSummaryProps> = ({ counts, onClearCompleted }) => {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-[#1e1e1e] border-b border-[#3c3c3c]">
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-[#cccccc]">任务</span>
        <div className="flex items-center gap-2">
          {counts.running > 0 && (
            <TaskStatusBadge status={'running' as TaskStatus} size="sm" customLabel={`${counts.running}`} />
          )}
          {counts.pending > 0 && (
            <TaskStatusBadge status={'pending' as TaskStatus} size="sm" customLabel={`${counts.pending}`} />
          )}
        </div>
      </div>

      {counts.success > 0 && (
        <button
          onClick={onClearCompleted}
          className="flex items-center gap-1 text-[11px] text-[#858585] hover:text-[#cccccc] transition-colors"
        >
          <Trash2 size={10} />
          <span>清除已完成</span>
        </button>
      )}
    </div>
  );
};

// ============================================================================
// Empty State
// ============================================================================

interface EmptyStateProps {
  filter: TaskFilter;
  onClearFilter?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ filter, onClearFilter }) => {
  const hasActiveFilter = filter.status !== 'all' || filter.category !== 'all' || filter.search;

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="text-4xl mb-3">📋</div>
      <p className="text-[13px] text-[#cccccc] mb-1">没有任务</p>
      {hasActiveFilter ? (
        <button
          onClick={onClearFilter}
          className="text-[11px] text-[#569cd6] hover:underline"
        >
          清除筛选条件
        </button>
      ) : (
        <p className="text-[11px] text-[#858585]">任务将自动显示在这里</p>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const TaskMonitor: React.FC<TaskMonitorProps> = ({
  mode = 'normal',
  maxTasks = 50,
  showFilter = true,
  showSummary = true,
  autoHide = false,
  className = '',
  onTaskClick,
}) => {
  const tasks = useFilteredTasks();
  const counts = useTaskCounts();
  const { filter, setFilter, clearCompleted } = useTaskStore();

  // Limit displayed tasks
  const displayedTasks = tasks.slice(0, maxTasks);

  // Auto-hide when no tasks
  if (autoHide && displayedTasks.length === 0) {
    return null;
  }

  const handleClearFilter = () => {
    setFilter({ status: 'all', category: 'all', search: undefined });
  };

  return (
    <div className={`task-monitor bg-[#1e1e1e] border border-[#3c3c3c] rounded ${className}`}>
      {/* Summary header */}
      {showSummary && <TaskSummary counts={counts} onClearCompleted={clearCompleted} />}

      {/* Filter and actions bar */}
      {(showFilter || displayedTasks.length > 0) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#3c3c3c]">
          {showFilter && (
            <TaskFilterControls
              filter={filter}
              onFilterChange={setFilter}
              counts={counts}
            />
          )}

          {/* Search */}
          {filter.search !== undefined && (
            <div className="flex items-center gap-1 px-2 py-1 bg-[#2a2d2e] rounded">
              <input
                type="text"
                value={filter.search}
                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                placeholder="搜索任务..."
                className="bg-transparent text-[11px] text-[#cccccc] placeholder-[#858585] outline-none w-32"
              />
              {filter.search && (
                <button
                  onClick={() => setFilter({ ...filter, search: undefined })}
                  className="text-[#858585] hover:text-[#cccccc]"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Task list */}
      <div className="task-list max-h-[400px] overflow-y-auto">
        {displayedTasks.length === 0 ? (
          <EmptyState filter={filter} onClearFilter={handleClearFilter} />
        ) : (
          <div className="p-2 space-y-2">
            {displayedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                mode={mode}
                onToggle={() => onTaskClick?.(task.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Task count indicator (if truncated) */}
      {tasks.length > maxTasks && (
        <div className="px-3 py-2 text-[11px] text-[#858585] text-center border-t border-[#3c3c3c]">
          显示 {maxTasks} / {tasks.length} 个任务
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Compact Variant (Inline List)
// ============================================================================

export interface TaskMonitorCompactProps {
  maxTasks?: number;
  showStatus?: boolean;
  className?: string;
}

export const TaskMonitorCompact: React.FC<TaskMonitorCompactProps> = ({
  maxTasks = 5,
  showStatus = true,
  className = '',
}) => {
  const tasks = useTaskStore((state) =>
    Array.from(state.tasks.values())
      .filter((t) => t.status === 'running' || t.status === 'pending')
      .slice(0, maxTasks)
  );

  if (tasks.length === 0) return null;

  return (
    <div className={`task-monitor-compact flex flex-col gap-1 ${className}`}>
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} mode="compact" />
      ))}
    </div>
  );
};

export default TaskMonitor;
