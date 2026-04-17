import React, { useState, useMemo } from 'react';
import { Filter, Trash2, X, Search, LayoutGrid, ListTree, Activity } from 'lucide-react';
import { TaskCard } from './TaskCard';
import { TaskStatusBadge } from './TaskStatusBadge';
import { TaskTimeline } from './TaskTimeline';
import { useTaskStore, useFilteredTasks, useTaskCounts } from '../../stores/taskStore';
import type { TaskFilter, TaskCardMode } from './types';
import { TaskStatus, TaskCategory } from './types';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { shallow } from 'zustand/shallow';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';
import { isDarkTheme } from '../../utils/theme';
import clsx from 'clsx';

// ============================================================================
// 子组件：筛选控制
// ============================================================================

export interface TaskMonitorProps {
  mode?: 'normal' | 'detailed' | 'compact';
  maxTasks?: number;
  showFilter?: boolean;
  showSummary?: boolean;
  className?: string;
}

interface TaskFilterControlsProps {
  filter: TaskFilter;
  onFilterChange: (filter: TaskFilter) => void;
}

const TaskFilterControls: React.FC<TaskFilterControlsProps> = ({
  filter,
  onFilterChange,
}) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);

  const STATUS_OPTIONS: Array<{ value: TaskStatus | 'all'; label: string }> = [
    { value: 'all', label: '全部' },
    { value: TaskStatus.RUNNING, label: '运行中' },
    { value: TaskStatus.PENDING, label: '等待中' },
    { value: TaskStatus.SUCCESS, label: '完成' },
    { value: TaskStatus.FAILED, label: '失败' },
  ];

  return (
    <div className="task-filter-controls relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-1.5 px-2 py-1 text-[11px] rounded transition-colors ${
          expanded ? 'bg-[var(--selected-bg)] text-[var(--accent-color)]' : 'theme-text-subtle theme-hoverable'
        }`}
      >
        <Filter size={12} />
        <span>筛选</span>
      </button>

      {expanded && (
        <div className="theme-panel-elevated theme-border theme-shadow absolute top-full left-0 z-[100] mt-2 w-48 rounded border p-2 space-y-2">
          <div className="flex flex-col gap-1">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onFilterChange({ ...filter, status: opt.value }); setExpanded(false); }}
                className={`text-left px-2 py-1.5 rounded text-[10px] ${
                  filter.status === opt.value ? 'bg-[var(--selected-bg)] text-[var(--accent-color)]' : 'theme-text-subtle theme-hoverable'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 子组件：仪表盘统计
// ============================================================================

const TaskSummary = ({ counts, onClearCompleted, view, setView }: any) => {
  const { t } = useTranslation();
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);
  const chartData = useMemo(() => [
    { name: 'R', value: counts.running, color: '#3b82f6' },
    { name: 'P', value: counts.pending, color: '#6b7280' },
    { name: 'S', value: counts.success, color: '#10b981' },
    { name: 'F', value: counts.failed, color: '#ef4444' },
  ].filter(d => d.value > 0), [counts]);

  return (
    <div className="theme-panel-muted theme-border border-b p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
            <Activity size={14} className="text-blue-500" />
            <span className="theme-text-subtle text-[11px] font-bold uppercase tracking-tight">{t('taskMonitor.title')}</span>
        </div>
        <div className="theme-panel flex rounded border p-0.5 theme-border">
            <button 
                onClick={() => setView('list')}
                className={`p-1 rounded ${view === 'list' ? 'bg-[var(--selected-bg)] text-[var(--accent-color)]' : 'theme-text-subtle'}`}
                title="List View"
            >
                <ListTree size={12} />
            </button>
            <button 
                onClick={() => setView('timeline')}
                className={`p-1 rounded ${view === 'timeline' ? 'bg-[var(--selected-bg)] text-[var(--accent-color)]' : 'theme-text-subtle'}`}
                title="Timeline View"
            >
                <LayoutGrid size={12} />
            </button>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="theme-panel flex items-center gap-4 rounded-lg border p-2 theme-border">
            <div className="w-10 h-10">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={chartData} innerRadius={12} outerRadius={20} dataKey="value" isAnimationActive={false}>
                            {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="flex gap-3">
                {chartData.map(d => (
                    <div key={d.name} className="flex flex-col">
                        <span className="theme-text-subtle text-[9px] font-bold">{d.name}</span>
                        <span className="theme-text text-[11px] font-mono leading-none">{d.value}</span>
                    </div>
                ))}
            </div>
            {counts.success > 0 && (
              <button onClick={onClearCompleted} className="theme-hoverable theme-text-subtle ml-auto rounded p-1.5 transition-colors hover:text-red-400">
                  <Trash2 size={12} />
              </button>
            )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 主组件
// ============================================================================

export const TaskMonitor: React.FC<TaskMonitorProps & { className?: string }> = ({ className = '' }) => {
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const tasks = useFilteredTasks();
  const counts = useTaskCounts();
  const filter = useTaskStore((state: any) => state.filter);
  const setFilter = useTaskStore((state: any) => state.setFilter);
  const clearCompleted = useTaskStore((state: any) => state.clearCompleted);
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);

  return (
    <div className={`theme-panel flex flex-col h-full overflow-hidden ${className}`}>
      <TaskSummary 
        counts={counts} 
        onClearCompleted={clearCompleted} 
        view={view}
        setView={setView}
      />

      {view === 'list' ? (
        <>
            <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-3 py-2">
                <TaskFilterControls filter={filter} onFilterChange={setFilter} />
                <div className="theme-input-surface theme-border flex items-center gap-1.5 rounded border px-2 py-1">
                    <Search size={10} className="theme-text-subtle" />
                    <input
                        value={(filter as TaskFilter).search || ''}
                        onChange={(e) => setFilter({ ...filter, search: e.target.value || undefined })}
                        placeholder="快速过滤..."
                        className={clsx('theme-text w-20 bg-transparent text-[10px] outline-none', dark ? 'placeholder-gray-500' : 'placeholder-slate-400')}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {tasks.length === 0 ? (
                  <div className="theme-text-subtle flex flex-col items-center justify-center py-20 opacity-50">
                    <Activity size={32} className="mb-2" />
                    <span className="text-xs">暂无任务记录</span>
                  </div>
                ) : (
                    tasks.map(task => <TaskCard key={task.id} task={task} mode="normal" />)
                )}
            </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto">
            <TaskTimeline />
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 紧凑模式
// ============================================================================

export interface TaskMonitorCompactProps {
  maxTasks?: number;
}

export const TaskMonitorCompact: React.FC<TaskMonitorCompactProps> = ({ maxTasks = 3 }) => {
  const allTasks = useTaskStore(state => state.tasks);
  
  const activeTasks = useMemo(() => {
    return Array.from(allTasks.values())
      .filter(t => t.status === TaskStatus.RUNNING)
      .slice(0, maxTasks);
  }, [allTasks, maxTasks]);

  if (activeTasks.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 p-1">
      {activeTasks.map(task => <TaskCard key={task.id} task={task} mode="compact" />)}
    </div>
  );
};

export default TaskMonitor;
