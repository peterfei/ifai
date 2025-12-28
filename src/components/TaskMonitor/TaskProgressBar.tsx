/**
 * TaskProgressBar Component
 *
 * Industrial-grade progress bar with smooth animations,
 * percentage display, and color themes.
 */

import React from 'react';
import type { ProgressBarColor } from './types';

// ============================================================================
// Props
// ============================================================================

export interface TaskProgressBarProps {
  /** Current progress value (0-100) */
  value: number;

  /** Total value (for calculating percentage if different from value) */
  total?: number;

  /** Show percentage text */
  showPercentage?: boolean;

  /** Show progress text (e.g., "50/100") */
  showProgressText?: boolean;

  /** Progress bar height */
  height?: number;

  /** Color theme */
  color?: ProgressBarColor;

  /** Animate progress changes */
  animated?: boolean;

  /** Custom className */
  className?: string;

  /** Accessibility label */
  ariaLabel?: string;
}

// ============================================================================
// Color Mapping
// ============================================================================

const COLOR_MAP: Record<ProgressBarColor, string> = {
  blue: '#569cd6',
  green: '#4ec9b0',
  orange: '#dcdcaa',
  red: '#f14c4c',
  gray: '#858585',
};

const BG_COLOR = '#2d2d2d';
const TRACK_COLOR = '#3c3c3c';

// ============================================================================
// Component
// ============================================================================

export const TaskProgressBar: React.FC<TaskProgressBarProps> = ({
  value,
  total,
  showPercentage = true,
  showProgressText = false,
  height = 4,
  color = 'blue',
  animated = true,
  className = '',
  ariaLabel = 'Progress bar',
}) => {
  // Calculate percentage
  const percentage = total !== undefined
    ? Math.min(100, Math.max(0, Math.round((value / total) * 100)))
    : Math.min(100, Math.max(0, Math.round(value)));

  // Determine color based on percentage
  const getColor = (): ProgressBarColor => {
    if (color !== 'blue') return color;
    if (percentage >= 100) return 'green';
    if (percentage < 20) return 'red';
    if (percentage < 50) return 'orange';
    return 'blue';
  };

  const currentColor = COLOR_MAP[getColor()];

  return (
    <div className={`task-progress-bar ${className}`}>
      {/* Progress bar track */}
      <div
        className="task-progress-track"
        style={{
          height: `${height}px`,
          backgroundColor: TRACK_COLOR,
          borderRadius: `${height / 2}px`,
          overflow: 'hidden',
        }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total || 100}
        aria-label={ariaLabel}
      >
        {/* Progress fill */}
        <div
          className="task-progress-fill"
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: currentColor,
            borderRadius: `${height / 2}px`,
            transition: animated
              ? 'width 0.3s ease-out, background-color 0.3s ease'
              : 'none',
          }}
        />
      </div>

      {/* Progress text */}
      {(showPercentage || showProgressText) && (
        <div className="task-progress-text" style={{ marginTop: '4px' }}>
          {showProgressText && total !== undefined && (
            <span className="text-[11px] text-[#858585] font-mono mr-2">
              {value}/{total}
            </span>
          )}
          {showPercentage && (
            <span className="text-[11px] text-[#cccccc] font-mono">
              {percentage}%
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Circular Progress (Alternative Style)
// ============================================================================

export interface CircularProgressProps {
  value: number;
  total?: number;
  size?: number;
  strokeWidth?: number;
  color?: ProgressBarColor;
  showPercentage?: boolean;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  total,
  size = 32,
  strokeWidth = 3,
  color = 'blue',
  showPercentage = true,
}) => {
  const percentage = total !== undefined
    ? Math.min(100, Math.max(0, (value / total) * 100))
    : Math.min(100, Math.max(0, value));

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const currentColor = COLOR_MAP[color];

  return (
    <div className="circular-progress" style={{ position: 'relative', width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TRACK_COLOR}
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={currentColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.3s ease-out',
          }}
        />
      </svg>
      {showPercentage && (
        <div
          className="circular-progress-text"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: `${size / 4}px`,
            fontWeight: '600',
            color: currentColor,
          }}
        >
          {Math.round(percentage)}%
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Segmented Progress (Multi-step)
// ============================================================================

export interface SegmentedProgressProps {
  segments: Array<{ value: number; label?: string; color?: ProgressBarColor }>;
  height?: number;
  showLabels?: boolean;
}

export const SegmentedProgress: React.FC<SegmentedProgressProps> = ({
  segments,
  height = 8,
  showLabels = false,
}) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="segmented-progress">
      <div
        className="segmented-progress-track"
        style={{
          display: 'flex',
          height: `${height}px`,
          borderRadius: `${height / 2}px`,
          overflow: 'hidden',
          backgroundColor: TRACK_COLOR,
        }}
      >
        {segments.map((segment, index) => {
          const width = total > 0 ? (segment.value / total) * 100 : 0;
          const segmentColor = segment.color
            ? COLOR_MAP[segment.color]
            : COLOR_MAP.blue;

          return (
            <div
              key={index}
              className="segmented-progress-segment"
              style={{
                width: `${width}%`,
                height: '100%',
                backgroundColor: segmentColor,
                transition: 'width 0.3s ease-out',
              }}
              title={segment.label}
            />
          );
        })}
      </div>
      {showLabels && (
        <div className="segmented-progress-labels" style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          {segments.map((segment, index) => (
            segment.label && (
              <div
                key={index}
                className="text-[10px] text-[#858585]"
                style={{ flex: segment.value }}
              >
                {segment.label}
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskProgressBar;
