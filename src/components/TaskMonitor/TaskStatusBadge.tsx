/**
 * TaskStatusBadge Component
 *
 * Status badge with icons, colors, and animations
 * for displaying task status in a consistent way.
 */

import React from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, Pause, Ban } from 'lucide-react';
import type { TaskStatus, StatusBadgeSize } from './types';
import { useTranslation } from 'react-i18next';

// ============================================================================
// Props
// ============================================================================

export interface TaskStatusBadgeProps {
  /** Task status */
  status: TaskStatus;

  /** Badge size */
  size?: StatusBadgeSize;

  /** Show icon */
  showIcon?: boolean;

  /** Show text label */
  showLabel?: boolean;

  /** Animate icon (for running status) */
  animated?: boolean;

  /** Custom className */
  className?: string;

  /** Custom label text */
  customLabel?: string;
}

// ============================================================================
// Status Configuration
// ============================================================================

interface StatusConfig {
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  pending: {
    color: 'var(--text-subtle)',
    bgColor: 'var(--hover-soft)',
    borderColor: 'var(--border-color)',
    icon: Clock,
  },
  running: {
    color: 'var(--accent-color)',
    bgColor: 'var(--accent-soft-bg)',
    borderColor: 'var(--accent-soft-border)',
    icon: Loader2,
  },
  paused: {
    color: 'var(--warning-color)',
    bgColor: 'var(--warning-soft-bg)',
    borderColor: 'var(--warning-soft-border)',
    icon: Pause,
  },
  success: {
    color: 'var(--success-color)',
    bgColor: 'var(--success-soft-bg)',
    borderColor: 'var(--success-soft-border)',
    icon: CheckCircle2,
  },
  failed: {
    color: 'var(--danger-color)',
    bgColor: 'var(--danger-soft-bg)',
    borderColor: 'var(--danger-soft-border)',
    icon: XCircle,
  },
  cancelled: {
    color: 'var(--text-subtle)',
    bgColor: 'var(--hover-soft)',
    borderColor: 'var(--border-color)',
    icon: Ban,
  },
};

// ============================================================================
// Size Configuration
// ============================================================================

const SIZE_CONFIG: Record<StatusBadgeSize, { fontSize: string; padding: string; iconSize: number }> = {
  sm: {
    fontSize: '10px',
    padding: '2px 6px',
    iconSize: 10,
  },
  md: {
    fontSize: '11px',
    padding: '4px 8px',
    iconSize: 12,
  },
  lg: {
    fontSize: '12px',
    padding: '6px 10px',
    iconSize: 14,
  },
};

// ============================================================================
// Component
// ============================================================================

export const TaskStatusBadge: React.FC<TaskStatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
  showLabel = true,
  animated = true,
  className = '',
  customLabel,
}) => {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status];
  const sizeConfig = SIZE_CONFIG[size];
  const Icon = config.icon;
  const defaultLabel = t(`taskMonitor.status.${status}`);

  const isRunning = status === 'running' && animated;

  return (
    <div
      className={`task-status-badge inline-flex items-center gap-1.5 rounded-md font-medium transition-colors ${className}`}
      style={{
        fontSize: sizeConfig.fontSize,
        padding: sizeConfig.padding,
        backgroundColor: config.bgColor,
        color: config.color,
        border: `1px solid ${config.borderColor}`,
      }}
    >
      {showIcon && (
        <Icon
          size={sizeConfig.iconSize}
          className={isRunning ? 'animate-spin flex-shrink-0' : 'flex-shrink-0'}
        />
      )}
      {showLabel && (
        <span>{customLabel || defaultLabel}</span>
      )}
    </div>
  );
};

// ============================================================================
// Compact Status Indicator (Dot Style)
// ============================================================================

export interface StatusDotProps {
  status: TaskStatus;
  size?: number;
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 8,
  showLabel = false,
  animated = true,
  className = '',
}) => {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status];
  const isRunning = status === 'running' && animated;

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <div
        className="status-dot rounded-full"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: config.color,
          animation: isRunning ? 'status-pulse 1.5s infinite' : undefined,
        }}
      />
      {showLabel && (
        <span className="text-[11px]" style={{ color: config.color }}>
          {t(`taskMonitor.status.${status}`)}
        </span>
      )}
    </div>
  );
};

// ============================================================================
// Status Progress Bar (Inline)
// ============================================================================

export interface StatusProgressProps {
  status: TaskStatus;
  progress?: number;
  showPercentage?: boolean;
  className?: string;
}

export const StatusProgress: React.FC<StatusProgressProps> = ({
  status,
  progress = 0,
  showPercentage = true,
  className = '',
}) => {
  const config = STATUS_CONFIG[status];

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <TaskStatusBadge status={status} size="sm" />
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ width: '60px', backgroundColor: 'var(--bg-tertiary)' }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
            backgroundColor: config.color,
          }}
        />
      </div>
      {showPercentage && (
        <span className="theme-text-subtle min-w-[32px] text-[11px] font-mono">
          {Math.round(progress)}%
        </span>
      )}
    </div>
  );
};

// ============================================================================
// CSS Animation (add to global styles)
// ============================================================================

export const statusBadgeStyles = `
  @keyframes status-pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .task-status-badge {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
  }
`;

export default TaskStatusBadge;
