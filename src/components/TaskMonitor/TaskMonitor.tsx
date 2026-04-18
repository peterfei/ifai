import React, { useState, useMemo } from 'react';
import { Filter, Trash2, Search, LayoutGrid, ListTree, Activity } from 'lucide-react';
import { TaskCard } from './TaskCard';
import { TaskTimeline } from './TaskTimeline';
import { useTaskStore, useFilteredTasks, useTaskCounts } from '../../stores/taskStore';
import type { TaskFilter } from './types';
import { TaskStatus } from './types';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const STATUS_OPTIONS: Array<{ value: TaskStatus | 'all'; label: string }> = [
    { value: 'all', label: t('taskMonitor.all') },
    { value: TaskStatus.RUNNING, label: t('taskMonitor.status.running') },
    { value: TaskStatus.PENDING, label: t('taskMonitor.status.pending') },
    { value: TaskStatus.SUCCESS, label: t('taskMonitor.status.success') },
    { value: TaskStatus.FAILED, label: t('taskMonitor.status.failed') },
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
        <span>{t('taskMonitor.filter')}</span>
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
  const chartData = useMemo(() => [
    { name: t('taskMonitor.summary.runningShort'), value: counts.running, color: 'var(--accent-color)' },
    { name: t('taskMonitor.summary.pendingShort'), value: counts.pending, color: 'var(--text-subtle)' },
    { name: t('taskMonitor.summary.successShort'), value: counts.success, color: 'var(--success-color)' },
    { name: t('taskMonitor.summary.failedShort'), value: counts.failed, color: 'var(--danger-color)' },
  ].filter(d => d.value > 0), [counts, t]);

  return (
    <div className="theme-panel-muted theme-border border-b p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
            <Activity size={14} className="theme-text-accent" />
            <span className="theme-text-subtle text-[11px] font-bold uppercase tracking-tight">{t('taskMonitor.title')}</span>
        </div>
        <div className="theme-panel flex rounded border p-0.5 theme-border">
            <button 
                onClick={() => setView('list')}
                className={`p-1 rounded ${view === 'list' ? 'bg-[var(--selected-bg)] text-[var(--accent-color)]' : 'theme-text-subtle'}`}
                title={t('taskMonitor.listView')}
            >
                <ListTree size={12} />
            </button>
            <button 
                onClick={() => setView('timeline')}
                className={`p-1 rounded ${view === 'timeline' ? 'bg-[var(--selected-bg)] text-[var(--accent-color)]' : 'theme-text-subtle'}`}
                title={t('taskMonitor.timelineView')}
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
              <button onClick={onClearCompleted} className="theme-hoverable theme-text-subtle ml-auto rounded p-1.5 transition-colors hover:text-[var(--danger-color)]" title={t('taskMonitor.clearCompleted')}>
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
  const { t } = useTranslation();
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const tasks = useFilteredTasks();
  const counts = useTaskCounts();
  const filter = useTaskStore((state: any) => state.filter);
  const setFilter = useTaskStore((state: any) => state.setFilter);
  const clearCompleted = useTaskStore((state: any) => state.clearCompleted);

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
                        placeholder={t('taskMonitor.searchPlaceholder')}
                        className="theme-text w-20 bg-transparent text-[10px] outline-none placeholder:text-[var(--text-muted)]"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {tasks.length === 0 ? (
                  <div className="theme-text-subtle flex flex-col items-center justify-center py-20 opacity-50">
                    <Activity size={32} className="mb-2" />
                    <span className="text-xs">{t('taskMonitor.noTasks')}</span>
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
