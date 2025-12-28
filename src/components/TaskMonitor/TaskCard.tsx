/**
 * TaskCard Component
 *
 * Main task card component that integrates all sub-components:
 * - Header with title, status badge, and actions
 * - Progress bar
 * - Metrics display
 * - Expandable details
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, X, Pause, Play, RotateCcw } from 'lucide-react';
import type { TaskMetadata, TaskCardMode } from './types';
import { TaskStatusBadge } from './TaskStatusBadge';
import { TaskProgressBar } from './TaskProgressBar';
import { TaskMetrics, MetricsSummary } from './TaskMetrics';
import { TaskLogStream } from './TaskLogStream';

// ============================================================================
// Category Icons
// ============================================================================

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  // Core operations
  scan: '🔍',
  build: '🔨',
  generation: '✨',
  transfer: '📦',
  analysis: '📊',

  // Development
  test: '🧪',
  deploy: '🚀',
  install: '📦',
  git: '🔀',
  format: '✨',
  refactor: '🔧',

  // Documentation & Maintenance
  document: '📝',
  backup: '💾',
  cleanup: '🧹',
  optimize: '⚡',
  security: '🔒',
};

// ============================================================================
// Props
// ============================================================================

export interface TaskCardProps {
  /** Task metadata */
  task: TaskMetadata;

  /** Display mode */
  mode?: TaskCardMode;

  /** Is expanded (for details) */
  expanded?: boolean;

  /** Custom className */
  className?: string;

  /** Event handlers */
  onToggle?: () => void;
  onCancel?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get progress bar color based on task status
 */
function getProgressColor(status: TaskMetadata['status']): 'blue' | 'green' | 'orange' | 'red' | 'gray' {
  switch (status) {
    case 'success':
      return 'green';
    case 'failed':
      return 'red';
    case 'paused':
      return 'orange';
    case 'cancelled':
    case 'pending':
      return 'gray';
    default:
      return 'blue';
  }
}

/**
 * Format duration
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Task card header
 */
interface TaskHeaderProps {
  task: TaskMetadata;
  onToggle?: () => void;
  expanded?: boolean;
}

const TaskHeader: React.FC<TaskHeaderProps> = ({ task, onToggle, expanded }) => {
  const icon = CATEGORY_ICONS[task.category] || '📋';
  const isRunning = task.status === 'running';

  return (
    <div className="flex items-center justify-between">
      {/* Left: Icon + Title + Status */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Category icon */}
        <span className="text-sm flex-shrink-0">{icon}</span>

        {/* Title */}
        <span
          className="text-[13px] font-medium text-[#cccccc] truncate"
          title={task.title}
        >
          {task.title}
        </span>

        {/* Status badge */}
        <TaskStatusBadge
          status={task.status}
          size="sm"
          showIcon={isRunning}
          animated={isRunning}
        />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Expand/collapse button */}
        {onToggle && (
          <button
            onClick={onToggle}
            className="p-1 hover:bg-[#2a2d2e] rounded transition-colors"
            aria-label={expanded ? '收起详情' : '展开详情'}
          >
            {expanded ? (
              <ChevronDown size={14} className="text-[#858585]" />
            ) : (
              <ChevronRight size={14} className="text-[#858585]" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Task action buttons
 */
interface TaskActionsProps {
  task: TaskMetadata;
  onCancel?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
}

const TaskActions: React.FC<TaskActionsProps> = ({
  task,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onRemove,
}) => {
  const canCancel = task.status === 'running' || task.status === 'pending';
  const canPause = task.status === 'running';
  const canResume = task.status === 'paused';
  const canRetry = task.status === 'failed' || task.status === 'cancelled';
  const canRemove = task.status === 'success' || task.status === 'failed' || task.status === 'cancelled';

  if (!canCancel && !canPause && !canResume && !canRetry && !canRemove) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {canPause && onPause && (
        <button
          onClick={onPause}
          className="p-1.5 hover:bg-[#2a2d2e] rounded transition-colors"
          title="暂停"
        >
          <Pause size={12} className="text-[#dcdcaa]" />
        </button>
      )}
      {canResume && onResume && (
        <button
          onClick={onResume}
          className="p-1.5 hover:bg-[#2a2d2e] rounded transition-colors"
          title="继续"
        >
          <Play size={12} className="text-[#4ec9b0]" />
        </button>
      )}
      {canCancel && onCancel && (
        <button
          onClick={onCancel}
          className="p-1.5 hover:bg-[#2a2d2e] rounded transition-colors"
          title="取消"
        >
          <X size={12} className="text-[#f14c4c]" />
        </button>
      )}
      {canRetry && onRetry && (
        <button
          onClick={onRetry}
          className="p-1.5 hover:bg-[#2a2d2e] rounded transition-colors"
          title="重试"
        >
          <RotateCcw size={12} className="text-[#569cd6]" />
        </button>
      )}
      {canRemove && onRemove && (
        <button
          onClick={onRemove}
          className="p-1.5 hover:bg-[#2a2d2e] rounded transition-colors"
          title="移除"
        >
          <X size={12} className="text-[#858585]" />
        </button>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

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
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!expanded);
    }
  };

  // Calculate duration
  const duration = task.completedAt && task.startedAt
    ? task.completedAt - task.startedAt
    : task.startedAt
    ? Date.now() - task.startedAt
    : null;

  // Mode-specific rendering
  if (mode === 'compact') {
    // Minimal compact mode
    return (
      <div
        className={`task-card-compact flex items-center gap-3 bg-[#252526] border border-[#3c3c3c] rounded p-2 ${className}`}
      >
        {/* Icon */}
        <span className="text-xs flex-shrink-0">{CATEGORY_ICONS[task.category]}</span>

        {/* Title + Progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-[#cccccc] truncate">{task.title}</span>
            <span className="text-[11px] text-[#858585] font-mono">
              {task.progress.percentage}%
            </span>
          </div>
          <TaskProgressBar
            value={task.progress.percentage}
            height={3}
            color={getProgressColor(task.status)}
            showPercentage={false}
          />
        </div>

        {/* Status */}
        <TaskStatusBadge status={task.status} size="sm" showLabel={false} />
      </div>
    );
  }

  // Normal/detailed mode
  return (
    <div
      className={`task-card bg-[#252526] border border-[#3c3c3c] rounded ${
        mode === 'detailed' ? 'p-4' : 'p-3'
      } ${className} ${task.status === 'running' ? 'border-l-2 border-l-[#569cd6]' : ''}`}
    >
      {/* Header */}
      <div className="mb-2">
        <TaskHeader task={task} onToggle={onToggle || handleToggle} expanded={expanded} />
      </div>

      {/* Progress bar */}
      <TaskProgressBar
        value={task.progress.current}
        total={task.progress.total}
        height={mode === 'detailed' ? 6 : 4}
        color={getProgressColor(task.status)}
        showPercentage={mode === 'detailed'}
        className="mb-2"
      />

      {/* Metrics row */}
      <div className="flex items-center justify-between">
        {/* Left: Metrics summary */}
        <MetricsSummary metrics={task.metrics} />

        {/* Right: Duration + Actions */}
        <div className="flex items-center gap-2">
          {duration && (
            <span className="text-[11px] text-[#858585] font-mono">
              {formatDuration(duration)}
            </span>
          )}
          <TaskActions
            task={task}
            onCancel={onCancel}
            onPause={onPause}
            onResume={onResume}
            onRetry={onRetry}
            onRemove={onRemove}
          />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && mode === 'detailed' && (
        <div className="mt-3 pt-3 border-t border-[#3c3c3c] space-y-3">
          {/* Description */}
          {task.description && (
            <p className="text-[12px] text-[#858585]">{task.description}</p>
          )}

          {/* Detailed metrics */}
          {task.metrics && (
            <TaskMetrics
              metrics={task.metrics}
              showSpeed
              showEta
              showResources
            />
          )}

          {/* Result */}
          {task.result && task.result.summary && (
            <div className="text-[12px] text-[#cccccc] bg-[#1e1e1e] rounded p-2">
              {task.result.summary}
            </div>
          )}

          {/* Error */}
          {task.result?.error && (
            <div className="text-[12px] text-[#f14c4c] bg-[#f14c4c10] rounded p-2 border border-[#f14c4c30]">
              {task.result.error.message}
            </div>
          )}

          {/* Logs */}
          {task.logs && task.logs.length > 0 && (
            <TaskLogStream
              logs={task.logs}
              maxLines={100}
              showSearch={true}
              showFilters={true}
              showExport={true}
              showLineNumbers={true}
              showTimestamps={true}
              fontSize="xs"
              exportFilename={`${task.title.replace(/\s+/g, '_')}_logs.txt`}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default TaskCard;
