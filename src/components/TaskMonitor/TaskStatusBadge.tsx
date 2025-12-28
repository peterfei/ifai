/**
 * TaskStatusBadge Component
 *
 * Status badge with icons, colors, and animations
 * for displaying task status in a consistent way.
 */

import React from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, Pause, Ban } from 'lucide-react';
import type { TaskStatus, StatusBadgeSize } from './types';

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
  label: string;
  color: string;
  bgColor: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  pending: {
    label: '等待中',
    color: '#858585',
    bgColor: '#85858520',
    icon: Clock,
  },
  running: {
    label: '运行中',
    color: '#569cd6',
    bgColor: '#569cd620',
    icon: Loader2,
  },
  paused: {
    label: '已暂停',
    color: '#dcdcaa',
    bgColor: '#dcdcaa20',
    icon: Pause,
  },
  success: {
    label: '已完成',
    color: '#4ec9b0',
    bgColor: '#4ec9b020',
    icon: CheckCircle2,
  },
  failed: {
    label: '失败',
    color: '#f14c4c',
    bgColor: '#f14c4c20',
    icon: XCircle,
  },
  cancelled: {
    label: '已取消',
    color: '#858585',
    bgColor: '#85858520',
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
  const config = STATUS_CONFIG[status];
  const sizeConfig = SIZE_CONFIG[size];
  const Icon = config.icon;

  const isRunning = status === 'running' && animated;

  return (
    <div
      className={`task-status-badge inline-flex items-center gap-1.5 rounded-md font-medium transition-colors ${className}`}
      style={{
        fontSize: sizeConfig.fontSize,
        padding: sizeConfig.padding,
        backgroundColor: config.bgColor,
        color: config.color,
        border: `1px solid ${config.color}40`,
      }}
    >
      {showIcon && (
        <Icon
          size={sizeConfig.iconSize}
          className={isRunning ? 'animate-spin flex-shrink-0' : 'flex-shrink-0'}
        />
      )}
      {showLabel && (
        <span>{customLabel || config.label}</span>
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
          {config.label}
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
        className="h-1.5 rounded-full overflow-hidden bg-[#3c3c3c]"
        style={{ width: '60px' }}
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
        <span className="text-[11px] text-[#858585] font-mono min-w-[32px]">
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
