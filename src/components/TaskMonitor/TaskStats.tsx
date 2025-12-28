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
    pending: '#858585',
    running: '#569cd6',
    paused: '#dcdcaa',
    success: '#4ec9b0',
    failed: '#f14c4c',
    cancelled: '#858585',
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

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function getCategoryLabel(category: TaskCategory): string {
  const labels: Record<TaskCategory, string> = {
    scan: '扫描',
    build: '构建',
    generation: '生成',
    transfer: '传输',
    analysis: '分析',
    test: '测试',
    deploy: '部署',
    install: '安装',
    git: 'Git',
    format: '格式化',
    refactor: '重构',
    document: '文档',
    backup: '备份',
    cleanup: '清理',
    optimize: '优化',
    security: '安全',
  };
  return labels[category] || category;
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
  if (compact) {
    return (
      <div className="flex h-2 rounded overflow-hidden bg-[#1e1e1e]">
        {distribution.map(({ status, percentage, color }) => (
          <div
            key={status}
            className="h-full transition-all duration-300"
            style={{ width: `${percentage}%`, backgroundColor: color }}
            title={`${status}: ${Math.round(percentage)}%`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {distribution.map(({ status, count, percentage, color }) => (
        <div key={status} className="flex items-center gap-2">
          <span className="text-[10px] text-[#858585] w-16 capitalize">
            {status}
          </span>
          <div className="flex-1 h-3 bg-[#1e1e1e] rounded overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${percentage}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-[10px] text-[#cccccc] w-16 text-right">
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
  const { total, byStatus, successRate, avgDuration } = stats;

  const successCount = byStatus.find(s => s.status === 'success')?.count || 0;
  const failedCount = byStatus.find(s => s.status === 'failed')?.count || 0;
  const runningCount = byStatus.find(s => s.status === 'running')?.count || 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {/* Total tasks */}
      <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Activity size={12} className="text-[#569cd6]" />
          <span className="text-[10px] text-[#858585]">总任务</span>
        </div>
        <div className="text-[16px] font-bold text-[#cccccc]">{total}</div>
      </div>

      {/* Success rate */}
      {total > 0 && (
        <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} className="text-[#4ec9b0]" />
            <span className="text-[10px] text-[#858585]">成功率</span>
          </div>
          <div className="text-[16px] font-bold text-[#4ec9b0]">
            {Math.round(successRate)}%
          </div>
        </div>
      )}

      {/* Completed */}
      {successCount > 0 && (
        <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 size={12} className="text-[#4ec9b0]" />
            <span className="text-[10px] text-[#858585]">已完成</span>
          </div>
          <div className="text-[16px] font-bold text-[#4ec9b0]">{successCount}</div>
        </div>
      )}

      {/* Failed */}
      {failedCount > 0 && (
        <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <XCircle size={12} className="text-[#f14c4c]" />
            <span className="text-[10px] text-[#858585]">失败</span>
          </div>
          <div className="text-[16px] font-bold text-[#f14c4c]">{failedCount}</div>
        </div>
      )}

      {/* Running */}
      {runningCount > 0 && (
        <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={12} className="text-[#569cd6]" />
            <span className="text-[10px] text-[#858585]">运行中</span>
          </div>
          <div className="text-[16px] font-bold text-[#569cd6]">{runningCount}</div>
        </div>
      )}

      {/* Avg duration */}
      {avgDuration > 0 && (
        <div className="bg-[#252526] border border-[#3c3c3c] rounded p-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap size={12} className="text-[#dcdcaa]" />
            <span className="text-[10px] text-[#858585]">平均耗时</span>
          </div>
          <div className="text-[14px] font-bold text-[#dcdcaa]">
            {formatDuration(avgDuration)}
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
  if (breakdown.length === 0) return null;

  const CATEGORY_COLORS: Record<TaskCategory, string> = {
    scan: '#569cd6',
    build: '#dcdcaa',
    generation: '#4ec9b0',
    transfer: '#f14c4c',
    analysis: '#ce9178',
    test: '#c586c0',
    deploy: '#dcdcaa',
    install: '#4ec9b0',
    git: '#f14c4c',
    format: '#569cd6',
    refactor: '#ce9178',
    document: '#808080',
    backup: '#4ec9b0',
    cleanup: '#dcdcaa',
    optimize: '#ff6b6b',
    security: '#f14c4c',
  };

  return (
    <div className="mt-3">
      <h4 className="text-[10px] text-[#858585] uppercase tracking-wider mb-2">
        按类别统计
      </h4>
      <div className="space-y-1">
        {breakdown.map(({ category, count, avgDuration }) => (
          <div
            key={category}
            className="flex items-center justify-between text-[11px] py-1 px-2 bg-[#1e1e1e] rounded"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[category] }}
              />
              <span className="text-[#cccccc] capitalize">
                {getCategoryLabel(category)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[#858585]">{count} 个</span>
              {avgDuration > 0 && (
                <span className="text-[#858585] font-mono">
                  {formatDuration(avgDuration)}
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
  const stats = useMemo(() => calculateStats(tasks), [tasks]);

  if (stats.total === 0) {
    return (
      <div className={`task-stats-empty ${className}`}>
        <div className="text-center py-8 text-[#858585]">
          <Activity size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-[12px]">暂无任务统计数据</p>
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
          <h4 className="text-[10px] text-[#858585] uppercase tracking-wider mb-2">
            状态分布
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
