/**
 * TaskStats Component
 *
 * Displays task statistics and metrics with visual charts:
 * - Status distribution (bar chart)
 * - Category breakdown
 * - Success/failure rate
 * - Average execution time
 * - Resource usage
 */

import React, { useMemo } from 'react';
import { CheckCircle2, XCircle, Clock, TrendingUp, Activity, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TaskMetadata, TaskStatus, TaskCategory } from './types';

// ============================================================================
// Types
// ============================================================================

export interface TaskStatsProps {
  tasks: TaskMetadata[];
  showChart?: boolean;
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

interface StatusDistribution {
  status: TaskStatus;
  count: number;
  percentage: number;
  color: string;
}

interface CategoryBreakdown {
  category: TaskCategory;
  count: number;
  avgDuration: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateStats(tasks: TaskMetadata[]) {
  const total = tasks.length;
  if (total === 0) {
    return {
      total: 0,
      byStatus: [] as StatusDistribution[],
      byCategory: [] as CategoryBreakdown[],
      successRate: 0,
      avgDuration: 0,
      totalDuration: 0,
    };
  }

  // Status distribution
  const statusCounts: Record<TaskStatus, number> = {
    pending: 0,
    running: 0,
    paused: 0,
    success: 0,
    failed: 0,
    cancelled: 0,
  };

  const STATUS_COLORS: Record<TaskStatus, string> = {
    pending: 'var(--text-subtle)',
    running: 'var(--info-color)',
    paused: 'var(--warning-color)',
    success: 'var(--success-color)',
    failed: 'var(--danger-color)',
    cancelled: 'var(--text-subtle)',
  };

  tasks.forEach(task => {
    statusCounts[task.status]++;
  });

  const byStatus: StatusDistribution[] = Object.entries(statusCounts)
    .filter(([_, count]) => count > 0)
    .map(([status, count]) => ({
      status: status as TaskStatus,
      count,
      percentage: (count / total) * 100,
      color: STATUS_COLORS[status as TaskStatus],
    }))
    .sort((a, b) => b.count - a.count);

  // Category breakdown
  const categoryMap = new Map<TaskCategory, { count: number; totalDuration: number }>();

  tasks.forEach(task => {
    const existing = categoryMap.get(task.category) || { count: 0, totalDuration: 0 };
    const duration = task.completedAt && task.startedAt
      ? task.completedAt - task.startedAt
      : 0;

    categoryMap.set(task.category, {
      count: existing.count + 1,
      totalDuration: existing.totalDuration + duration,
    });
  });

  const byCategory: CategoryBreakdown[] = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      avgDuration: data.count > 0 ? data.totalDuration / data.count : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Success rate (completed tasks only)
  const completedTasks = tasks.filter(t =>
    t.status === 'success' || t.status === 'failed' || t.status === 'cancelled'
  );
  const successCount = tasks.filter(t => t.status === 'success').length;
  const successRate = completedTasks.length > 0
    ? (successCount / completedTasks.length) * 100
    : 0;

  // Average duration
  const tasksWithDuration = tasks.filter(t =>
    t.completedAt && t.startedAt
  );
  const totalDuration = tasksWithDuration.reduce((sum, t) =>
    sum + (t.completedAt! - t.startedAt!), 0
  );
  const avgDuration = tasksWithDuration.length > 0
    ? totalDuration / tasksWithDuration.length
    : 0;

  return {
    total,
    byStatus,
    byCategory,
    successRate,
    avgDuration,
    totalDuration,
  };
}

function formatDuration(
  milliseconds: number,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return t('taskMonitor.duration.secondsShort', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t('taskMonitor.duration.minutesSecondsShort', {
      minutes,
      seconds: seconds % 60,
    });
  }
  const hours = Math.floor(minutes / 60);
  return t('taskMonitor.duration.hoursMinutesShort', {
    hours,
    minutes: minutes % 60,
  });
}

function getCategoryLabel(
  category: TaskCategory,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return t(`taskMonitor.categories.${category}`, { defaultValue: category });
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Status bar chart
 */
const StatusChart: React.FC<{ distribution: StatusDistribution[]; compact?: boolean }> = ({
  distribution,
  compact = false,
}) => {
  const { t } = useTranslation();
  if (compact) {
    return (
      <div className="theme-input-surface flex h-2 overflow-hidden rounded">
        {distribution.map(({ status, percentage, color }) => (
          <div
            key={status}
            className="h-full transition-all duration-300"
            style={{ width: `${percentage}%`, backgroundColor: color }}
            title={`${t(`taskMonitor.status.${status}`)}: ${Math.round(percentage)}%`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {distribution.map(({ status, count, percentage, color }) => (
        <div key={status} className="flex items-center gap-2">
          <span className="theme-text-subtle w-16 text-[10px] capitalize">
            {t(`taskMonitor.status.${status}`)}
          </span>
          <div className="theme-input-surface flex-1 h-3 overflow-hidden rounded">
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${percentage}%`, backgroundColor: color }}
            />
          </div>
          <span className="theme-text w-16 text-right text-[10px]">
            {count} ({Math.round(percentage)}%)
          </span>
        </div>
      ))}
    </div>
  );
};

/**
 * Summary cards
 */
const SummaryCards: React.FC<{
  stats: ReturnType<typeof calculateStats>;
}> = ({ stats }) => {
  const { t } = useTranslation();
  const { total, byStatus, successRate, avgDuration } = stats;

  const successCount = byStatus.find(s => s.status === 'success')?.count || 0;
  const failedCount = byStatus.find(s => s.status === 'failed')?.count || 0;
  const runningCount = byStatus.find(s => s.status === 'running')?.count || 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {/* Total tasks */}
      <div className="theme-panel-muted theme-border rounded p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity size={12} className="theme-text-info" />
            <span className="theme-text-subtle text-[10px]">{t('taskMonitor.stats.total')}</span>
          </div>
        <div className="theme-text text-[16px] font-bold">{total}</div>
      </div>

      {/* Success rate */}
      {total > 0 && (
        <div className="theme-panel-muted theme-border rounded p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} className="theme-text-success" />
            <span className="theme-text-subtle text-[10px]">{t('taskMonitor.stats.successRate')}</span>
          </div>
          <div className="theme-text-success text-[16px] font-bold">
            {Math.round(successRate)}%
          </div>
        </div>
      )}

      {/* Completed */}
      {successCount > 0 && (
        <div className="theme-panel-muted theme-border rounded p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 size={12} className="theme-text-success" />
            <span className="theme-text-subtle text-[10px]">{t('taskMonitor.stats.completed')}</span>
          </div>
          <div className="theme-text-success text-[16px] font-bold">{successCount}</div>
        </div>
      )}

      {/* Failed */}
      {failedCount > 0 && (
        <div className="theme-panel-muted theme-border rounded p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <XCircle size={12} className="theme-text-danger" />
            <span className="theme-text-subtle text-[10px]">{t('taskMonitor.stats.failed')}</span>
          </div>
          <div className="theme-text-danger text-[16px] font-bold">{failedCount}</div>
        </div>
      )}

      {/* Running */}
      {runningCount > 0 && (
        <div className="theme-panel-muted theme-border rounded p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={12} className="theme-text-info" />
            <span className="theme-text-subtle text-[10px]">{t('taskMonitor.stats.running')}</span>
          </div>
          <div className="theme-text-info text-[16px] font-bold">{runningCount}</div>
        </div>
      )}

      {/* Avg duration */}
      {avgDuration > 0 && (
        <div className="theme-panel-muted theme-border rounded p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap size={12} className="theme-text-warning" />
            <span className="theme-text-subtle text-[10px]">{t('taskMonitor.stats.averageDuration')}</span>
          </div>
          <div className="theme-text-warning text-[14px] font-bold">
            {formatDuration(avgDuration, t)}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Category breakdown table
 */
const CategoryTable: React.FC<{ breakdown: CategoryBreakdown[] }> = ({ breakdown }) => {
  const { t } = useTranslation();
  if (breakdown.length === 0) return null;

  const CATEGORY_COLORS: Record<TaskCategory, string> = {
    scan: 'var(--info-color)',
    build: 'var(--warning-color)',
    generation: 'var(--accent-color)',
    transfer: 'var(--info-color)',
    analysis: 'var(--info-color)',
    test: 'var(--success-color)',
    deploy: 'var(--success-color)',
    install: 'var(--accent-color)',
    git: 'var(--danger-color)',
    format: 'var(--accent-color)',
    refactor: 'var(--warning-color)',
    document: 'var(--text-subtle)',
    backup: 'var(--success-color)',
    cleanup: 'var(--warning-color)',
    optimize: 'var(--accent-color)',
    security: 'var(--danger-color)',
  };

  return (
    <div className="mt-3">
      <h4 className="theme-text-subtle mb-2 text-[10px] uppercase tracking-wider">
        {t('taskMonitor.stats.byCategory')}
      </h4>
      <div className="space-y-1">
        {breakdown.map(({ category, count, avgDuration }) => (
          <div
            key={category}
            className="theme-input-surface flex items-center justify-between rounded px-2 py-1 text-[11px]"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[category] }}
              />
              <span className="theme-text capitalize">
                {getCategoryLabel(category, t)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="theme-text-subtle">{t('taskMonitor.stats.categoryCount', { count })}</span>
              {avgDuration > 0 && (
                <span className="theme-text-subtle font-mono">
                  {formatDuration(avgDuration, t)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const TaskStats: React.FC<TaskStatsProps> = ({
  tasks,
  showChart = true,
  showDetails = true,
  compact = false,
  className = '',
}) => {
  const { t } = useTranslation();
  const stats = useMemo(() => calculateStats(tasks), [tasks]);

  if (stats.total === 0) {
    return (
      <div className={`task-stats-empty ${className}`}>
        <div className="theme-text-subtle py-8 text-center">
          <Activity size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-[12px]">{t('taskMonitor.stats.empty')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`task-stats ${className}`}>
      {/* Summary cards */}
      <SummaryCards stats={stats} />

      {/* Status distribution chart */}
      {showChart && stats.byStatus.length > 0 && (
        <div className="mt-3">
          <h4 className="theme-text-subtle mb-2 text-[10px] uppercase tracking-wider">
            {t('taskMonitor.stats.byStatus')}
          </h4>
          <StatusChart distribution={stats.byStatus} compact={compact} />
        </div>
      )}

      {/* Category breakdown */}
      {showDetails && <CategoryTable breakdown={stats.byCategory} />}
    </div>
  );
};

export default TaskStats;
