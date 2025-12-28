/**
 * TaskTimeline Component
 *
 * Displays task execution history in a visual timeline:
 * - Chronological task flow
 * - Duration indicators
 * - Status visualization
 * - Interactive timeline
 */

import React, { useState, useMemo } from 'react';
import {
  Circle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import type { TaskMetadata, TaskStatus, TaskCategory } from './types';
import { TaskStatusBadge } from './TaskStatusBadge';

// ============================================================================
// Types
// ============================================================================

export interface TaskTimelineProps {
  tasks: TaskMetadata[];
  groupBy?: 'none' | 'category' | 'date' | 'status';
  showDuration?: boolean;
  showMetrics?: boolean;
  maxItems?: number;
  className?: string;
  onTaskClick?: (taskId: string) => void;
}

interface TimelineTask {
  task: TaskMetadata;
  startTime: number;
  endTime: number;
  duration: number;
}

interface TimelineGroup {
  key: string;
  label: string;
  tasks: TimelineTask[];
  totalDuration: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return '今天';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return '昨天';
  } else {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}

function getStatusIcon(status: TaskStatus, size: number = 12) {
  switch (status) {
    case 'success':
      return <CheckCircle2 size={size} className="text-[#4ec9b0]" />;
    case 'failed':
      return <XCircle size={size} className="text-[#f14c4c]" />;
    case 'running':
      return <Clock size={size} className="text-[#569cd6] animate-pulse" />;
    case 'pending':
      return <Circle size={size} className="text-[#858585]" />;
    default:
      return <Clock size={size} className="text-[#dcdcaa]" />;
  }
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

function prepareTimelineTasks(tasks: TaskMetadata[]): TimelineTask[] {
  return tasks
    .filter(task => task.createdAt || task.startedAt)
    .map(task => ({
      task,
      startTime: task.startedAt || task.createdAt,
      endTime: task.completedAt || Date.now(),
      duration: (task.completedAt || Date.now()) - (task.startedAt || task.createdAt),
    }))
    .sort((a, b) => b.startTime - a.startTime); // Newest first
}

function groupTasks(
  timelineTasks: TimelineTask[],
  groupBy: 'none' | 'category' | 'date' | 'status'
): TimelineGroup[] {
  const groups = new Map<string, TimelineTask[]>();

  timelineTasks.forEach(timelineTask => {
    let key: string;
    let label: string;

    switch (groupBy) {
      case 'category':
        key = timelineTask.task.category;
        label = getCategoryLabel(timelineTask.task.category);
        break;
      case 'date':
        key = formatDate(timelineTask.startTime);
        label = key;
        break;
      case 'status':
        key = timelineTask.task.status;
        label = timelineTask.task.status;
        break;
      default:
        key = 'all';
        label = '全部';
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(timelineTask);
  });

  return Array.from(groups.entries()).map(([key, tasks]) => {
    // Determine label based on key and groupBy
    let groupLabel: string;
    if (key === 'all') {
      groupLabel = '全部任务';
    } else if (groupBy === 'category') {
      groupLabel = getCategoryLabel(key as TaskCategory);
    } else if (groupBy === 'status') {
      groupLabel = key;
    } else {
      groupLabel = key;
    }

    return {
      key,
      label: groupLabel,
      tasks,
      totalDuration: tasks.reduce((sum, t) => sum + t.duration, 0),
    };
  });
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Timeline item
 */
const TimelineItem: React.FC<{
  timelineTask: TimelineTask;
  isFirst: boolean;
  showDuration?: boolean;
  showMetrics?: boolean;
  onClick?: () => void;
}> = ({ timelineTask, isFirst, showDuration, showMetrics, onClick }) => {
  const { task, duration } = timelineTask;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`relative ${onClick ? 'cursor-pointer hover:bg-[#2a2d2e]' : ''} rounded transition-colors`}
      onClick={onClick}
    >
      {/* Timeline dot */}
      <div className="absolute left-0 top-3 -ml-[5px]">
        {getStatusIcon(task.status, 10)}
      </div>

      {/* Timeline line */}
      {!isFirst && (
        <div
          className="absolute left-[-4px] top-0 w-[2px] bg-[#3c3c3c]"
          style={{ height: '100%', marginTop: '-12px' }}
        />
      )}

      {/* Content */}
      <div className="ml-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12px] font-medium text-[#cccccc] truncate">
                {task.title}
              </span>
              <TaskStatusBadge status={task.status} size="sm" showLabel={false} />
            </div>

            {/* Time info */}
            <div className="flex items-center gap-2 text-[10px] text-[#858585]">
              <span className="font-mono">
                {formatTime(timelineTask.startTime)}
              </span>
              {showDuration && duration > 0 && (
                <>
                  <span>·</span>
                  <span className="font-mono">{formatDuration(duration)}</span>
                </>
              )}
              {task.description && (
                <>
                  <span>·</span>
                  <span className="truncate">{task.description}</span>
                </>
              )}
            </div>

            {/* Expanded metrics */}
            {expanded && showMetrics && task.metrics && (
              <div className="mt-2 p-2 bg-[#1e1e1e] rounded text-[10px] text-[#858585]">
                {task.metrics.speed !== undefined && (
                  <div>速度: {task.metrics.speed} 项/秒</div>
                )}
                {task.metrics.eta !== undefined && task.metrics.eta > 0 && (
                  <div>预计剩余: {formatDuration(task.metrics.eta)}</div>
                )}
                {task.metrics.resources && (
                  <>
                    {task.metrics.resources.cpu !== undefined && (
                      <div>CPU: {(task.metrics.resources.cpu * 100).toFixed(0)}%</div>
                    )}
                    {task.metrics.resources.memory !== undefined && (
                      <div>内存: {(task.metrics.resources.memory / 1024 / 1024).toFixed(0)}MB</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Expand button */}
          {(task.description || (showMetrics && task.metrics)) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="p-1 hover:bg-[#3c3c3c] rounded transition-colors"
            >
              {expanded ? (
                <ChevronDown size={12} className="text-[#858585]" />
              ) : (
                <ChevronRight size={12} className="text-[#858585]" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Timeline group
 */
const TimelineGroup: React.FC<{
  group: TimelineGroup;
  showDuration?: boolean;
  showMetrics?: boolean;
  onTaskClick?: (taskId: string) => void;
}> = ({ group, showDuration, showMetrics, onTaskClick }) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="timeline-group mb-4">
      {/* Group header */}
      <div
        className="flex items-center justify-between py-2 px-3 bg-[#252526] border border-[#3c3c3c] rounded cursor-pointer hover:border-[#555] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown size={14} className="text-[#858585]" />
          ) : (
            < ChevronRight size={14} className="text-[#858585]" />
          )}
          <span className="text-[12px] font-medium text-[#cccccc]">
            {group.label}
          </span>
          <span className="text-[10px] text-[#858585]">
            ({group.tasks.length})
          </span>
        </div>
        {showDuration && group.totalDuration > 0 && (
          <span className="text-[10px] text-[#858585] font-mono">
            {formatDuration(group.totalDuration)}
          </span>
        )}
      </div>

      {/* Group tasks */}
      {expanded && (
        <div className="mt-2 pl-2">
          {group.tasks.map((timelineTask, index) => (
            <TimelineItem
              key={timelineTask.task.id}
              timelineTask={timelineTask}
              isFirst={index === group.tasks.length - 1}
              showDuration={showDuration}
              showMetrics={showMetrics}
              onClick={() => onTaskClick?.(timelineTask.task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const TaskTimeline: React.FC<TaskTimelineProps> = ({
  tasks,
  groupBy = 'none',
  showDuration = true,
  showMetrics = false,
  maxItems,
  className = '',
  onTaskClick,
}) => {
  const timelineTasks = useMemo(() => {
    const prepared = prepareTimelineTasks(tasks);
    return maxItems ? prepared.slice(0, maxItems) : prepared;
  }, [tasks, maxItems]);

  const groups = useMemo(() => {
    return groupTasks(timelineTasks, groupBy);
  }, [timelineTasks, groupBy]);

  if (timelineTasks.length === 0) {
    return (
      <div className={`task-timeline-empty ${className}`}>
        <div className="text-center py-8 text-[#858585]">
          <Clock size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-[12px]">暂无任务历史</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`task-timeline ${className}`}>
      {/* Group selector (optional enhancement) */}
      {/* {groups.length > 1 && (
        <div className="flex gap-1 mb-3">
          {groups.map(group => (
            <button
              key={group.key}
              className="px-2 py-1 text-[10px] text-[#cccccc] bg-[#252526] border border-[#3c3c3c] rounded hover:bg-[#2a2d2e] transition-colors"
            >
              {group.label}
            </button>
          ))}
        </div>
      )} */}

      {/* Timeline groups */}
      {groups.map(group => (
        <TimelineGroup
          key={group.key}
          group={group}
          showDuration={showDuration}
          showMetrics={showMetrics}
          onTaskClick={onTaskClick}
        />
      ))}

      {/* Load more indicator */}
      {maxItems && tasks.length > maxItems && (
        <div className="text-center py-2 text-[10px] text-[#569cd6]">
          还有 {tasks.length - maxItems} 个任务...
        </div>
      )}
    </div>
  );
};

export default TaskTimeline;
