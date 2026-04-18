import type { TFunction } from 'i18next';
import type { TaskCategory, TaskPriority, TaskStatus } from '../../types/taskBreakdown';

type TaskStatusKey = 'pending' | 'inProgress' | 'completed' | 'failed';

interface TaskStatusMeta {
  badgeClass: string;
  borderClass: string;
  progressClass: string;
  surfaceClass: string;
  textClass: string;
  key: TaskStatusKey;
  label: string;
}

interface TaskPriorityMeta {
  badgeClass: string;
  label: string;
}

const normalizeTaskStatus = (status: TaskStatus): TaskStatusKey => {
  switch (status) {
    case 'done':
      return 'completed';
    case 'todo':
      return 'pending';
    case 'in_progress':
      return 'inProgress';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'pending':
    default:
      return 'pending';
  }
};

export const getTaskStatusMeta = (status: TaskStatus, t: TFunction): TaskStatusMeta => {
  const key = normalizeTaskStatus(status);

  switch (key) {
    case 'inProgress':
      return {
        key,
        label: t('taskBreakdown.status.inProgress'),
        textClass: 'text-[var(--accent-color)]',
        surfaceClass: 'bg-[var(--accent-soft-bg)]',
        borderClass: 'border-[var(--accent-soft-border)]',
        progressClass: 'bg-[var(--accent-color)]',
        badgeClass: 'bg-[var(--accent-soft-bg)] border-[var(--accent-soft-border)] text-[var(--accent-color)]',
      };
    case 'completed':
      return {
        key,
        label: t('taskBreakdown.status.completed'),
        textClass: 'text-[var(--success-color)]',
        surfaceClass: 'bg-[var(--success-soft-bg)]',
        borderClass: 'border-[var(--success-soft-border)]',
        progressClass: 'bg-[var(--success-color)]',
        badgeClass: 'bg-[var(--success-soft-bg)] border-[var(--success-soft-border)] text-[var(--success-color)]',
      };
    case 'failed':
      return {
        key,
        label: t('taskBreakdown.status.failed'),
        textClass: 'text-[var(--danger-color)]',
        surfaceClass: 'bg-[var(--danger-soft-bg)]',
        borderClass: 'border-[var(--danger-soft-border)]',
        progressClass: 'bg-[var(--danger-color)]',
        badgeClass: 'bg-[var(--danger-soft-bg)] border-[var(--danger-soft-border)] text-[var(--danger-color)]',
      };
    case 'pending':
    default:
      return {
        key,
        label: t('taskBreakdown.status.pending'),
        textClass: 'theme-text-subtle',
        surfaceClass: 'theme-panel-elevated',
        borderClass: 'theme-border',
        progressClass: 'bg-[var(--border-strong)]',
        badgeClass: 'theme-panel-elevated theme-border theme-text-subtle',
      };
  }
};

export const getTaskPriorityMeta = (priority: TaskPriority | undefined, t: TFunction): TaskPriorityMeta | null => {
  if (!priority) {
    return null;
  }

  switch (priority) {
    case 'critical':
    case 'urgent':
      return {
        label: t(`taskBreakdown.priority.${priority}`),
        badgeClass: 'bg-[var(--danger-soft-bg)] text-[var(--danger-color)] border border-[var(--danger-soft-border)]',
      };
    case 'high':
      return {
        label: t('taskBreakdown.priority.high'),
        badgeClass: 'bg-[var(--warning-soft-bg)] text-[var(--warning-color)] border border-[var(--warning-soft-border)]',
      };
    case 'medium':
      return {
        label: t('taskBreakdown.priority.medium'),
        badgeClass: 'bg-[var(--accent-soft-bg)] text-[var(--accent-color)] border border-[var(--accent-soft-border)]',
      };
    case 'low':
    default:
      return {
        label: t('taskBreakdown.priority.low'),
        badgeClass: 'theme-panel-elevated theme-border theme-text-subtle border',
      };
  }
};

export const getTaskCategoryLabel = (category: TaskCategory | undefined, t: TFunction): string | null => {
  if (!category) {
    return null;
  }

  const key = `taskBreakdown.categories.${category}`;
  const translated = t(key);
  return translated === key ? category : translated;
};

export const formatTaskHours = (hours: number, t: TFunction, compact = false): string => {
  return compact
    ? t('taskBreakdown.units.hoursShort', { count: hours })
    : t('taskBreakdown.units.hoursLong', { count: hours });
};
