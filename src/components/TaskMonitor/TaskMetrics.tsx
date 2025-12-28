/**
 * TaskMetrics Component
 *
 * Displays performance metrics including speed, ETA,
 * and resource usage in a compact, readable format.
 */

import React from 'react';
import { Zap, Clock, Cpu, HardDrive } from 'lucide-react';
import type { TaskMetrics as TaskMetricsType } from './types';

// ============================================================================
// Props
// ============================================================================

export interface TaskMetricsProps {
  /** Task metrics data */
  metrics?: TaskMetricsType;

  /** Compact mode (horizontal layout) */
  compact?: boolean;

  /** Show speed indicator */
  showSpeed?: boolean;

  /** Show ETA indicator */
  showEta?: boolean;

  /** Show resource usage */
  showResources?: boolean;

  /** Custom className */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format duration in human-readable format
 */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format speed with appropriate unit
 */
export function formatSpeed(
  speed: number,
  unit: 'files' | 'bytes' | 'items' = 'files'
): string {
  if (unit === 'bytes') {
    // Format as MB/s, KB/s, etc.
    const mb = speed / (1024 * 1024);
    const kb = speed / 1024;

    if (mb >= 1) {
      return `${mb.toFixed(1)} MB/s`;
    } else if (kb >= 1) {
      return `${kb.toFixed(1)} KB/s`;
    } else {
      return `${speed} B/s`;
    }
  } else {
    // Format as items/s
    return `${speed} ${unit}/s`;
  }
}

/**
 * Format resource usage
 */
export function formatResourceUsage(value: number, type: 'cpu' | 'memory'): string {
  if (type === 'cpu') {
    return `${value}%`;
  } else if (type === 'memory') {
    const mb = value / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    } else {
      return `${mb.toFixed(0)} MB`;
    }
  }
  return `${value}`;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Speed indicator
 */
export const SpeedIndicator: React.FC<{
  speed?: number;
  unit?: 'files' | 'bytes' | 'items';
}> = ({ speed, unit = 'files' }) => {
  if (speed === undefined || speed <= 0) return null;

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[#4ec9b0]">
      <Zap size={10} className="flex-shrink-0" />
      <span className="font-mono">{formatSpeed(speed, unit)}</span>
    </div>
  );
};

/**
 * ETA indicator
 */
export const ETAIndicator: React.FC<{
  eta?: number;
}> = ({ eta }) => {
  if (eta === undefined || eta <= 0) return null;

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[#cccccc]">
      <Clock size={10} className="flex-shrink-0" />
      <span className="font-mono">剩余 {formatDuration(eta)}</span>
    </div>
  );
};

/**
 * Resource usage indicator
 */
export const ResourceIndicator: React.FC<{
  resources?: TaskMetricsType['resources'];
}> = ({ resources }) => {
  if (!resources) return null;

  const { cpu, memory } = resources;
  const hasCpu = cpu !== undefined;
  const hasMemory = memory !== undefined;

  if (!hasCpu && !hasMemory) return null;

  return (
    <div className="flex items-center gap-3">
      {hasCpu && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#858585]">
          <Cpu size={10} className="flex-shrink-0" />
          <span className="font-mono">{formatResourceUsage(cpu, 'cpu')}</span>
        </div>
      )}
      {hasMemory && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#858585]">
          <HardDrive size={10} className="flex-shrink-0" />
          <span className="font-mono">{formatResourceUsage(memory, 'memory')}</span>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const TaskMetrics: React.FC<TaskMetricsProps> = ({
  metrics,
  compact = false,
  showSpeed = true,
  showEta = true,
  showResources = false,
  className = '',
}) => {
  if (!metrics) return null;

  const { speed, eta, resources } = metrics;
  const hasContent =
    (showSpeed && speed !== undefined && speed > 0) ||
    (showEta && eta !== undefined && eta > 0) ||
    (showResources && resources);

  if (!hasContent) return null;

  if (compact) {
    // Horizontal compact layout
    return (
      <div className={`task-metrics-compact flex items-center gap-3 ${className}`}>
        {showSpeed && <SpeedIndicator speed={speed} />}
        {showEta && <ETAIndicator eta={eta} />}
        {showResources && <ResourceIndicator resources={resources} />}
      </div>
    );
  }

  // Vertical detailed layout
  return (
    <div className={`task-metrics flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-3">
        {showSpeed && <SpeedIndicator speed={speed} />}
        {showEta && <ETAIndicator eta={eta} />}
      </div>
      {showResources && <ResourceIndicator resources={resources} />}
    </div>
  );
};

// ============================================================================
// Metrics Summary (Single Line)
// ============================================================================

export interface MetricsSummaryProps {
  metrics?: TaskMetricsType;
  separator?: string;
  className?: string;
}

export const MetricsSummary: React.FC<MetricsSummaryProps> = ({
  metrics,
  separator = '|',
  className = '',
}) => {
  if (!metrics) return null;

  const parts: React.ReactNode[] = [];
  const { speed, eta } = metrics;

  if (speed !== undefined && speed > 0) {
    parts.push(<SpeedIndicator key="speed" speed={speed} />);
  }

  if (eta !== undefined && eta > 0) {
    parts.push(<ETAIndicator key="eta" eta={eta} />);
  }

  if (parts.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 text-[11px] ${className}`}>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <span className="text-[#3c3c3c]">{separator}</span>
          )}
          {part}
        </React.Fragment>
      ))}
    </div>
  );
};

// ============================================================================
// Resource Bar (Visual representation)
// ============================================================================

export interface ResourceBarProps {
  cpu?: number;
  memory?: number;
  className?: string;
}

export const ResourceBar: React.FC<ResourceBarProps> = ({
  cpu,
  memory,
  className = '',
}) => {
  const hasCpu = cpu !== undefined;
  const hasMemory = memory !== undefined;

  if (!hasCpu && !hasMemory) return null;

  const getColor = (value: number): string => {
    if (value >= 80) return '#f14c4c'; // red
    if (value >= 50) return '#dcdcaa'; // yellow
    return '#4ec9b0'; // green
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {hasCpu && (
        <div className="flex items-center gap-1">
          <Cpu size={8} className="text-[#858585]" />
          <div className="w-12 h-1 bg-[#2d2d2d] rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${cpu}%`,
                backgroundColor: getColor(cpu),
              }}
            />
          </div>
          <span className="text-[10px] text-[#858585] font-mono min-w-[24px]">
            {cpu}%
          </span>
        </div>
      )}
      {hasMemory && (
        <div className="flex items-center gap-1">
          <HardDrive size={8} className="text-[#858585]" />
          <div className="w-12 h-1 bg-[#2d2d2d] rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${Math.min(100, memory)}%`,
                backgroundColor: getColor(memory),
              }}
            />
          </div>
          <span className="text-[10px] text-[#858585] font-mono min-w-[40px]">
            {formatResourceUsage(memory, 'memory')}
          </span>
        </div>
      )}
    </div>
  );
};

export default TaskMetrics;
