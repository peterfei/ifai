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
import {
  ChevronDown,
  ChevronRight,
  X,
  Pause,
  Play,
  RotateCcw,
  Activity,
  Clock,
  Search,
  Hammer,
  Sparkles,
  Package,
  BarChart3,
  FlaskConical,
  Rocket,
  GitBranch,
  Wand2,
  BookText,
  Archive,
  Trash2,
  Gauge,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { TaskMetadata, TaskCardMode } from './types';
import { TaskStatusBadge } from './TaskStatusBadge';
import { TaskProgressBar } from './TaskProgressBar';
import { MetricsSummary } from './TaskMetrics';
import { TaskLogStream } from './TaskLogStream';

// ============================================================================
// Category Icons
// ============================================================================

const CATEGORY_META: Record<string, { icon: LucideIcon; className: string }> = {
  scan: { icon: Search, className: 'theme-text-info' },
  build: { icon: Hammer, className: 'theme-text-warning' },
  generation: { icon: Sparkles, className: 'theme-text-accent' },
  transfer: { icon: Package, className: 'theme-text-info' },
  analysis: { icon: BarChart3, className: 'theme-text-info' },
  test: { icon: FlaskConical, className: 'theme-text-success' },
  deploy: { icon: Rocket, className: 'theme-text-success' },
  install: { icon: Package, className: 'theme-text-accent' },
  git: { icon: GitBranch, className: 'theme-text-danger' },
  format: { icon: Wand2, className: 'theme-text-accent' },
  refactor: { icon: Wand2, className: 'theme-text-warning' },
  document: { icon: BookText, className: 'theme-text-subtle' },
  backup: { icon: Archive, className: 'theme-text-success' },
  cleanup: { icon: Trash2, className: 'theme-text-warning' },
  optimize: { icon: Gauge, className: 'theme-text-accent' },
  security: { icon: ShieldCheck, className: 'theme-text-danger' },
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

function formatDuration(
  ms: number,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return t('taskMonitor.duration.secondsShort', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t('taskMonitor.duration.minutesSecondsShort', {
      minutes,
      seconds: seconds % 60,
    });
  }
  return t('taskMonitor.duration.hoursMinutesShort', {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  });
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
  const { t } = useTranslation();
  const canCancel = task.status === 'running' || task.status === 'pending';
  const canPause = task.status === 'running';
  const canResume = task.status === 'paused';
  const canRetry = task.status === 'failed' || task.status === 'cancelled';
  const canRemove = task.status === 'success' || task.status === 'failed' || task.status === 'cancelled';

  return (
    <div className="flex items-center gap-1">
      {canPause && onPause && (
        <button onClick={onPause} className="theme-button-ghost rounded p-1.5 transition-colors" title={t('taskMonitor.card.pause')}>
          <Pause size={12} className="theme-text-warning" />
        </button>
      )}
      {canResume && onResume && (
        <button onClick={onResume} className="theme-button-ghost rounded p-1.5 transition-colors" title={t('taskMonitor.card.resume')}>
          <Play size={12} className="theme-text-success" />
        </button>
      )}
      {canCancel && onCancel && (
        <button onClick={onCancel} className="theme-button-ghost rounded p-1.5 transition-colors" title={t('taskMonitor.card.cancel')}>
          <X size={12} className="theme-text-danger" />
        </button>
      )}
      {canRetry && onRetry && (
        <button onClick={onRetry} className="theme-button-ghost rounded p-1.5 transition-colors" title={t('taskMonitor.card.retry')}>
          <RotateCcw size={12} className="theme-text-accent" />
        </button>
      )}
      {canRemove && onRemove && (
        <button onClick={onRemove} className="theme-button-ghost rounded p-1.5 transition-colors" title={t('taskMonitor.card.remove')}>
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
  const { t } = useTranslation();
  const [internalExpanded, setInternalExpanded] = useState(expandedProp);
  const expanded = onToggle ? expandedProp : internalExpanded;

  const handleToggle = () => {
    if (onToggle) onToggle();
    else setInternalExpanded(!expanded);
  };

  const isRunning = task.status === 'running';
  const categoryMeta = CATEGORY_META[task.category] || { icon: Activity, className: 'theme-text-subtle' };
  const CategoryIcon = categoryMeta.icon;

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
        <div className="theme-panel flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border theme-border">
          <CategoryIcon className={`h-3.5 w-3.5 ${categoryMeta.className}`} />
        </div>
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
        isRunning ? 'border-[var(--accent-soft-border)] shadow-[0_0_15px_-5px_var(--accent-soft-border)]' : 'theme-border'
      } ${mode === 'detailed' ? 'p-4' : 'p-3'} ${className}`}
    >
      {/* Top row: Icon + Title + Actions */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className={`theme-panel-muted p-1.5 rounded-md border ${isRunning ? 'theme-surface-accent' : 'theme-border theme-text-subtle'}`}>
            <CategoryIcon className={`h-4 w-4 ${isRunning ? 'theme-text-accent' : categoryMeta.className}`} />
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
           <button onClick={handleToggle} className="theme-button-ghost theme-text-subtle rounded p-1 transition-colors">
             {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
           </button>
        </div>
      </div>

      {/* Progress Section */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-end">
            <span className="theme-text-subtle text-[10px] font-mono">
                {isRunning ? t('taskMonitor.processing') : t(`taskMonitor.status.${task.status}`)}
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
               {formatDuration(duration, t)}
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
                         <span className="theme-text-subtle text-[10px] font-bold uppercase tracking-widest">{t('taskMonitor.card.logs')}</span>
                         <span className="animate-pulse rounded border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-1.5 py-0.5 text-[9px] text-[var(--accent-color)]">
                           {t('taskMonitor.card.live')}
                         </span>
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
