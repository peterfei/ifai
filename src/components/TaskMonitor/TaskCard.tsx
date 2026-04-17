/**
 * TaskCard Component
 *
 * Industrial-grade task card component that integrates all sub-components:
 * - Header with title, status badge, and actions
 * - Progress bar with Framer Motion animations
 * - Metrics display (CPU/Memory)
 * - Expandable real-time log stream
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, X, Pause, Play, RotateCcw, Activity, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TaskMetadata, TaskCardMode } from './types';
import { TaskStatusBadge } from './TaskStatusBadge';
import { TaskProgressBar } from './TaskProgressBar';
import { TaskMetrics, MetricsSummary } from './TaskMetrics';
import { TaskLogStream } from './TaskLogStream';

// ============================================================================
// Category Icons
// ============================================================================

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  scan: '🔍',
  build: '🔨',
  generation: '✨',
  transfer: '📦',
  analysis: '📊',
  test: '🧪',
  deploy: '🚀',
  install: '📦',
  git: '🔀',
  format: '✨',
  refactor: '🔧',
  document: '📝',
  backup: '💾',
  cleanup: '🧹',
  optimize: '⚡',
  security: '🔒',
};

// ============================================================================
// Helper Functions
// ============================================================================

function getProgressColor(status: TaskMetadata['status']): 'blue' | 'green' | 'orange' | 'red' | 'gray' {
  switch (status) {
    case 'success': return 'green';
    case 'failed': return 'red';
    case 'paused': return 'orange';
    case 'cancelled':
    case 'pending': return 'gray';
    default: return 'blue';
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// ============================================================================
// Sub-components
// ============================================================================

const TaskActions: React.FC<{
  task: TaskMetadata;
  onCancel?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
}> = ({ task, onCancel, onPause, onResume, onRetry, onRemove }) => {
  const canCancel = task.status === 'running' || task.status === 'pending';
  const canPause = task.status === 'running';
  const canResume = task.status === 'paused';
  const canRetry = task.status === 'failed' || task.status === 'cancelled';
  const canRemove = task.status === 'success' || task.status === 'failed' || task.status === 'cancelled';

  return (
    <div className="flex items-center gap-1">
      {canPause && onPause && (
        <button onClick={onPause} className="theme-soft-hover rounded p-1.5 transition-colors" title="Pause">
          <Pause size={12} className="text-yellow-500" />
        </button>
      )}
      {canResume && onResume && (
        <button onClick={onResume} className="theme-soft-hover rounded p-1.5 transition-colors" title="Resume">
          <Play size={12} className="text-green-500" />
        </button>
      )}
      {canCancel && onCancel && (
        <button onClick={onCancel} className="theme-soft-hover rounded p-1.5 transition-colors" title="Cancel">
          <X size={12} className="text-red-500" />
        </button>
      )}
      {canRetry && onRetry && (
        <button onClick={onRetry} className="theme-soft-hover rounded p-1.5 transition-colors" title="Retry">
          <RotateCcw size={12} className="text-blue-500" />
        </button>
      )}
      {canRemove && onRemove && (
        <button onClick={onRemove} className="theme-soft-hover rounded p-1.5 transition-colors" title="Remove">
          <X size={12} className="theme-text-subtle" />
        </button>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export interface TaskCardProps {
  task: TaskMetadata;
  mode?: TaskCardMode;
  expanded?: boolean;
  className?: string;
  onToggle?: () => void;
  onCancel?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  mode = 'normal',
  expanded: expandedProp = false,
  className = '',
  onToggle,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onRemove,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(expandedProp);
  const expanded = onToggle ? expandedProp : internalExpanded;

  const handleToggle = () => {
    if (onToggle) onToggle();
    else setInternalExpanded(!expanded);
  };

  const isRunning = task.status === 'running';

  // Calculate duration
  const duration = task.completedAt && task.startedAt
    ? task.completedAt - task.startedAt
    : task.startedAt
    ? Date.now() - task.startedAt
    : null;

  // Mode-specific rendering
  if (mode === 'compact') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className={`task-card-compact theme-panel-muted theme-border flex items-center gap-2 rounded border p-1.5 ${className}`}
      >
        <span className="text-[10px] flex-shrink-0 opacity-80">{CATEGORY_ICONS[task.category] || '📋'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-0.5">
            <span className="theme-text truncate text-[10px] font-medium">{task.title}</span>
            <span className="theme-text-subtle text-[9px] font-mono">{task.progress.percentage}%</span>
          </div>
          <TaskProgressBar value={task.progress.percentage} height={2} color={getProgressColor(task.status)} />
        </div>
        <TaskStatusBadge status={task.status} size="sm" showLabel={false} />
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`task-card theme-panel group border rounded-lg transition-all duration-300 ${
        isRunning ? 'border-blue-500/50 shadow-[0_0_15px_-5px_rgba(59,130,246,0.2)]' : 'theme-border'
      } ${mode === 'detailed' ? 'p-4' : 'p-3'} ${className}`}
    >
      {/* Top row: Icon + Title + Actions */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className={`theme-panel-muted p-1.5 rounded-md border ${isRunning ? 'border-blue-500/30 text-blue-400' : 'theme-border theme-text-subtle'}`}>
             <span className="text-xs">{CATEGORY_ICONS[task.category] || <Activity size={12}/>}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
                <h4 className="theme-text truncate text-[12px] font-semibold leading-tight">{task.title}</h4>
                <TaskStatusBadge status={task.status} size="sm" />
            </div>
            {task.description && (mode as string) !== 'compact' && (
                <p className="theme-text-subtle mt-0.5 truncate text-[10px]">{task.description}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
           <TaskActions task={task} onCancel={onCancel} onPause={onPause} onResume={onResume} onRetry={onRetry} onRemove={onRemove} />
           <button onClick={handleToggle} className="theme-soft-hover theme-text-subtle rounded p-1 transition-colors">
             {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
           </button>
        </div>
      </div>

      {/* Progress Section */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-end">
            <span className="theme-text-subtle text-[10px] font-mono">
                {isRunning ? 'PROCESSING...' : task.status.toUpperCase()}
            </span>
            <span className="theme-text text-[11px] font-bold font-mono">{task.progress.percentage}%</span>
        </div>
        <TaskProgressBar
            value={task.progress.current}
            total={task.progress.total}
            height={4}
            color={getProgressColor(task.status)}
            className="rounded-full overflow-hidden"
        />
      </div>

      {/* Footer info: Metrics & Duration */}
      <div className="theme-border mt-3 flex items-center justify-between border-t pt-2.5">
        <MetricsSummary metrics={task.metrics} />
        
        <div className="theme-text-subtle flex items-center gap-2 text-[10px] font-mono">
           {duration && (
             <span className="flex items-center gap-1">
               <Clock size={10}/>
               {formatDuration(duration)}
             </span>
           )}
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
          {expanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="theme-border mt-4 space-y-4 border-t pt-4">
                  {task.logs && task.logs.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                         <span className="theme-text-subtle text-[10px] font-bold uppercase tracking-widest">Real-time Logs</span>
                         <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-900/20 text-blue-400 border border-blue-500/20 animate-pulse">LIVE</span>
                      </div>
                      <TaskLogStream
                        logs={task.logs}
                        maxLines={20}
                        showSearch={false}
                        showLineNumbers={false}
                        fontSize="xs"
                        className="theme-panel-muted theme-border rounded-lg border"
                      />
                    </div>
                  )}
              </div>
            </motion.div>
          )}
      </AnimatePresence>
    </motion.div>
  );
};

export default TaskCard;
