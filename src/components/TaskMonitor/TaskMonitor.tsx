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
          expanded ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'
        }`}
      >
        <Filter size={12} />
        <span>筛选</span>
      </button>

      {expanded && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-[#252526] border border-gray-700 rounded shadow-2xl z-[100] p-2 space-y-2">
          <div className="flex flex-col gap-1">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onFilterChange({ ...filter, status: opt.value }); setExpanded(false); }}
                className={`text-left px-2 py-1.5 rounded text-[10px] ${
                  filter.status === opt.value ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-400'
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
  const chartData = useMemo(() => [
    { name: 'R', value: counts.running, color: '#3b82f6' },
    { name: 'P', value: counts.pending, color: '#6b7280' },
    { name: 'S', value: counts.success, color: '#10b981' },
    { name: 'F', value: counts.failed, color: '#ef4444' },
  ].filter(d => d.value > 0), [counts]);

  return (
    <div className="bg-[#1e1e1e] border-b border-gray-800 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
            <Activity size={14} className="text-blue-500" />
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-tight">Mission Control</span>
        </div>
        <div className="flex bg-black/20 rounded p-0.5 border border-gray-800">
            <button 
                onClick={() => setView('list')}
                className={`p-1 rounded ${view === 'list' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}
                title="List View"
            >
                <ListTree size={12} />
            </button>
            <button 
                onClick={() => setView('timeline')}
                className={`p-1 rounded ${view === 'timeline' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}
                title="Timeline View"
            >
                <LayoutGrid size={12} />
            </button>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="flex items-center gap-4 bg-black/10 p-2 rounded-lg border border-gray-800/50">
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
                        <span className="text-[9px] text-gray-500 font-bold">{d.name}</span>
                        <span className="text-[11px] text-gray-200 font-mono leading-none">{d.value}</span>
                    </div>
                ))}
            </div>
            {counts.success > 0 && (
              <button onClick={onClearCompleted} className="ml-auto p-1.5 text-gray-500 hover:text-red-400">
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

  return (
    <div className={`flex flex-col bg-[#1e1e1e] h-full overflow-hidden ${className}`}>
      <TaskSummary 
        counts={counts} 
        onClearCompleted={clearCompleted} 
        view={view}
        setView={setView}
      />

      {view === 'list' ? (
        <>
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-[#1a1a1a]">
                <TaskFilterControls filter={filter} onFilterChange={setFilter} />
                <div className="flex items-center gap-1.5 px-2 py-1 bg-black/20 rounded border border-gray-800">
                    <Search size={10} className="text-gray-600" />
                    <input
                        value={(filter as TaskFilter).search || ''}
                        onChange={(e) => setFilter({ ...filter, search: e.target.value || undefined })}
                        placeholder="快速过滤..."
                        className="bg-transparent text-[10px] outline-none w-20 text-gray-300"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 opacity-40">
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
