import React, { useMemo } from 'react';
import { useTaskStore } from '../../stores/taskStore';
import { CheckCircle2, Clock, PlayCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { TaskStatus, TaskMetadata } from './types';
import { useSettingsStore } from '../../stores/settingsStore';
import { isDarkTheme } from '../../utils/theme';

export interface TaskTimelineProps {
  tasks?: TaskMetadata[];
  groupBy?: 'category' | 'status' | 'none';
  showDuration?: boolean;
  showMetrics?: boolean;
  maxItems?: number;
}

export const TaskTimeline: React.FC<TaskTimelineProps> = () => {
  const tasks = useTaskStore(state => state.tasks);
  const { t } = useTranslation();
  const theme = useSettingsStore(state => state.theme);
  const dark = isDarkTheme(theme);

  // Memoize the sorted array
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => b.createdAt - a.createdAt);
  }, [tasks]);

  if (sortedTasks.length === 0) {
    return <div className="theme-text-subtle p-8 text-center text-xs">{t('taskTimeline.noActivity')}</div>;
  }

  return (
    <div className="relative p-4">
      {/* Vertical Line */}
      <div className="theme-divider absolute bottom-0 left-7 top-0 w-px opacity-60" />

      <div className="space-y-6">
        {sortedTasks.map((task) => (
          <div key={task.id} className="relative flex gap-4 group">
            {/* Icon Column */}
            <div className="theme-panel z-10 rounded-full p-1 ring-4 ring-[var(--bg-primary)]">
              {task.status === TaskStatus.SUCCESS ? (
                <CheckCircle2 size={16} className="text-green-500" />
              ) : task.status === TaskStatus.RUNNING ? (
                <PlayCircle size={16} className="text-blue-500 animate-pulse" />
              ) : task.status === TaskStatus.FAILED ? (
                <XCircle size={16} className="text-red-500" />
              ) : (
                <Clock size={16} className="theme-text-subtle" />
              )}
            </div>

            {/* Content Column */}
            <div className="theme-panel-muted theme-border flex-1 min-w-0 rounded-lg border p-3 shadow-sm transition-colors hover:border-[var(--border-strong)]">
              <div className="flex justify-between items-start mb-1">
                <h4 className="theme-text truncate text-xs font-semibold">{task.title}</h4>
                <span className="theme-text-subtle shrink-0 text-[10px]">
                  {formatDistanceToNow(task.createdAt, { addSuffix: true })}
                </span>
              </div>
              <p className="theme-text-subtle line-clamp-2 text-[11px]">{task.description}</p>
              
              {task.logs && task.logs.length > 0 && (
                <div className="theme-input-surface theme-border theme-text-subtle mt-2 overflow-hidden rounded border p-2 font-mono text-[9px]">
                  <div className="theme-border mb-1 border-b pb-1 italic opacity-70">Recent Log:</div>
                  {task.logs.slice(-1)[0].message}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
