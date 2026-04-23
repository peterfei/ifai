/**
 * TaskMonitor Demo Component
 *
 * Comprehensive demo showcasing all TaskMonitor system features:
 * - TaskMonitor with filtering
 * - TaskStats visualization
 * - TaskTimeline history
 * - TaskCard variants
 * - TaskLogStream & TaskLogCompact
 * - All progress bar types
 * - All status badges
 *
 * This demo creates sample tasks with various states, categories,
 * and includes interactive controls to explore all features.
 */

import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Settings,
  BarChart3,
  Clock,
  FileText,
  Layers
} from 'lucide-react';
import {
  TaskMonitor,
  TaskCard,
  TaskStats,
  TaskTimeline,
  TaskLogStream,
  TaskLogCompact,
  TaskProgressBar,
  CircularProgress,
  SegmentedProgress,
  TaskStatusBadge,
} from './index';
import { useTaskStore, createTask } from '../../stores/taskStore';
import { useTranslation } from 'react-i18next';
import {
  TaskCategory,
  TaskStatus,
  TaskPriority,
  LogLevel,
  type LogEntry,
} from './types';

// ============================================================================
// Demo Section Component
// ============================================================================

interface DemoSectionProps {
  title: string;
  icon: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

const DemoSection: React.FC<DemoSectionProps> = ({
  title,
  icon,
  description,
  children,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={`demo-section mb-6 ${className}`}>
      {/* Section header */}
      <div
        className="theme-panel-muted theme-border theme-hoverable flex items-center justify-between rounded border px-4 py-3 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="theme-text text-[14px] font-semibold">{title}</h2>
        </div>
        {description && (
          <span className="theme-text-subtle text-[11px]">{description}</span>
        )}
        <div className="ml-auto">
          {expanded ? (
            <Pause size={14} className="theme-text-subtle" />
          ) : (
            <Play size={14} className="theme-text-subtle" />
          )}
        </div>
      </div>

      {/* Section content */}
      {expanded && <div className="mt-3">{children}</div>}
    </div>
  );
};

// ============================================================================
// Main Demo Component
// ============================================================================

export const TaskMonitorDemo: React.FC = () => {
  const { t } = useTranslation();
  const { addTask, updateTask, clearCompleted } = useTaskStore();
  const [demoTasks, setDemoTasks] = useState<string[]>([]);
  const [autoUpdate, setAutoUpdate] = useState(true);

  // Create demo tasks on mount
  useEffect(() => {
    createDemoTasks();
    return () => {
      // Cleanup: remove all demo tasks
      demoTasks.forEach(id => {
        // Note: taskStore doesn't have a simple remove method in current API
        // Tasks will be cleaned up naturally over time
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simulate live task updates
  useEffect(() => {
    if (!autoUpdate || demoTasks.length === 0) return;

    const interval = setInterval(() => {
      // Update a random running task
      const runningTaskId = demoTasks.find(id => {
        const task = useTaskStore.getState().getTask(id);
        return task?.status === 'running';
      });

      if (runningTaskId) {
        const task = useTaskStore.getState().getTask(runningTaskId);
        if (task && task.progress.current < task.progress.total) {
          const newProgress = Math.min(
            task.progress.total,
            task.progress.current + Math.floor(Math.random() * 5) + 1
          );

          updateTask(runningTaskId, {
            progress: {
              current: newProgress,
              total: task.progress.total,
              percentage: Math.round((newProgress / task.progress.total) * 100),
            },
          });
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [demoTasks, autoUpdate, updateTask]);

  // Create sample tasks with various states
  const createDemoTasks = () => {
    const now = Date.now();
    const taskIds: string[] = [];

    // Task 1: Running scan task
    const scanTask = createTask({
      title: t('taskMonitor.demo.demoTasks.scanTitle'),
      description: t('taskMonitor.demo.demoTasks.scanDesc'),
      category: TaskCategory.SCAN,
      status: TaskStatus.RUNNING,
      priority: TaskPriority.NORMAL,
      progress: {
        current: 45,
        total: 150,
        percentage: 30,
      },
      metrics: {
        speed: 15,
        eta: 7000,
      },
      startedAt: now - 5000,
    });
    addTask(scanTask);
    taskIds.push(scanTask.id);

    // Task 2: Completed build task
    const buildLogs: LogEntry[] = [
      {
        timestamp: now - 10000,
        level: LogLevel.INFO,
        message: t('taskMonitor.demo.logs.starting'),
      },
      {
        timestamp: now - 9000,
        level: LogLevel.INFO,
        message: t('taskMonitor.demo.logs.compiling'),
      },
      {
        timestamp: now - 8000,
        level: LogLevel.WARN,
        message: t('taskMonitor.demo.logs.warning'),
      },
      {
        timestamp: now - 7000,
        level: LogLevel.INFO,
        message: t('taskMonitor.demo.logs.bundling'),
      },
      {
        timestamp: now - 6000,
        level: LogLevel.INFO,
        message: t('taskMonitor.demo.logs.completed'),
      },
    ];

    const buildTask = createTask({
      title: t('taskMonitor.demo.demoTasks.buildTitle'),
      description: t('taskMonitor.demo.demoTasks.buildDesc'),
      category: TaskCategory.BUILD,
      status: TaskStatus.SUCCESS,
      priority: TaskPriority.HIGH,
      progress: {
        current: 100,
        total: 100,
        percentage: 100,
      },
      metrics: {
        speed: 150,
      },
      logs: buildLogs,
      startedAt: now - 10000,
      completedAt: now - 6000,
    });
    addTask(buildTask);
    taskIds.push(buildTask.id);

    // Task 3: Failed generation task
    const genLogs: LogEntry[] = [
      {
        timestamp: now - 8000,
        level: LogLevel.INFO,
        message: t('taskMonitor.demo.logs.initModel'),
      },
      {
        timestamp: now - 7000,
        level: LogLevel.DEBUG,
        message: t('taskMonitor.demo.logs.modelLoaded'),
      },
      {
        timestamp: now - 6000,
        level: LogLevel.ERROR,
        message: t('taskMonitor.demo.logs.apiError'),
      },
      {
        timestamp: now - 5000,
        level: LogLevel.ERROR,
        message: t('taskMonitor.demo.logs.failedGen'),
      },
    ];

    const genTask = createTask({
      title: t('taskMonitor.demo.demoTasks.genTitle'),
      description: t('taskMonitor.demo.demoTasks.genDesc'),
      category: TaskCategory.GENERATION,
      status: TaskStatus.FAILED,
      priority: TaskPriority.NORMAL,
      progress: {
        current: 60,
        total: 100,
        percentage: 60,
      },
      logs: genLogs,
      startedAt: now - 8000,
      completedAt: now - 5000,
      result: {
        summary: t('taskMonitor.demo.demoTasks.genFailed'),
        error: new Error('Rate limit exceeded'),
      },
    });
    addTask(genTask);
    taskIds.push(genTask.id);

    // Task 4: Pending transfer task
    const transferTask = createTask({
      title: t('taskMonitor.demo.demoTasks.transferTitle'),
      description: t('taskMonitor.demo.demoTasks.transferDesc'),
      category: TaskCategory.TRANSFER,
      status: TaskStatus.PENDING,
      priority: TaskPriority.LOW,
      progress: {
        current: 0,
        total: 100,
        percentage: 0,
      },
      createdAt: now,
    });
    addTask(transferTask);
    taskIds.push(transferTask.id);

    // Task 5: Running analysis task with metrics
    const analysisTask = createTask({
      title: t('taskMonitor.demo.demoTasks.analysisTitle'),
      description: t('taskMonitor.demo.demoTasks.analysisDesc'),
      category: TaskCategory.ANALYSIS,
      status: TaskStatus.RUNNING,
      priority: TaskPriority.HIGH,
      progress: {
        current: 75,
        total: 100,
        percentage: 75,
      },
      metrics: {
        speed: 25,
        eta: 1000,
        resources: {
          cpu: 0.45,
          memory: 512 * 1024 * 1024, // 512MB
        },
      },
      startedAt: now - 3000,
    });
    addTask(analysisTask);
    taskIds.push(analysisTask.id);

    setDemoTasks(taskIds);
  };

  // Recreate tasks
  const handleReset = () => {
    setDemoTasks([]);
    setTimeout(() => createDemoTasks(), 100);
  };

  return (
    <div className="task-monitor-demo theme-panel min-h-screen space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="theme-text mb-2 text-2xl font-bold">
            {t('taskMonitor.demo.footer.title')}
          </h1>
          <p className="theme-text-subtle text-[12px]">
            {t('taskMonitor.demo.footer.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoUpdate(!autoUpdate)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded transition-colors ${
              autoUpdate
                ? 'theme-button-success'
                : 'theme-button-secondary theme-text-subtle'
            }`}
          >
            {autoUpdate ? <Pause size={12} /> : <Play size={12} />}
            {autoUpdate ? t('taskMonitor.autoUpdate') : t('taskMonitor.paused')}
          </button>
          <button
            onClick={handleReset}
            className="theme-button-primary flex items-center gap-1.5 rounded px-3 py-1.5 text-[11px]"
          >
            <RotateCcw size={12} />
            {t('taskMonitor.resetDemo')}
          </button>
        </div>
      </div>

      {/* Section 1: Main TaskMonitor */}
      <DemoSection
        title={t('taskMonitor.demo.mainMonitorTitle')}
        icon={<Layers size={16} className="theme-text-info" />}
        description={t('taskMonitor.demo.mainMonitorDesc')}
      >
        <TaskMonitor
          mode="normal"
          maxTasks={20}
          showFilter={true}
          showSummary={true}
        />
      </DemoSection>

      {/* Section 2: TaskStats */}
      <DemoSection
        title={t('taskMonitor.demo.statsTitle')}
        icon={<BarChart3 size={16} className="theme-text-success" />}
        description={t('taskMonitor.demo.statsDesc')}
      >
        <TaskStats
          tasks={useTaskStore.getState().getAllTasks()}
          showChart={true}
          showDetails={true}
          compact={false}
        />
      </DemoSection>

      {/* Section 3: TaskTimeline */}
      <DemoSection
        title={t('taskMonitor.demo.timelineTitle')}
        icon={<Clock size={16} className="theme-text-warning" />}
        description={t('taskMonitor.demo.timelineDesc')}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h4 className="theme-text-subtle mb-2 text-[11px]">{t('taskMonitor.demo.groupByCategory')}</h4>
            <TaskTimeline
              tasks={useTaskStore.getState().getAllTasks()}
              groupBy="category"
              showDuration={true}
              showMetrics={true}
              maxItems={10}
            />
          </div>
          <div>
            <h4 className="theme-text-subtle mb-2 text-[11px]">{t('taskMonitor.demo.groupByStatus')}</h4>
            <TaskTimeline
              tasks={useTaskStore.getState().getAllTasks()}
              groupBy="status"
              showDuration={true}
              showMetrics={false}
              maxItems={10}
            />
          </div>
        </div>
      </DemoSection>

      {/* Section 4: TaskCard Variants */}
      <DemoSection
        title={t('taskMonitor.demo.cardVariantsTitle')}
        icon={<FileText size={16} className="text-orange-400" />}
        description={t('taskMonitor.demo.cardVariantsDesc')}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <h4 className="theme-text-subtle mb-2 text-[11px]">{t('taskMonitor.demo.compactMode')}</h4>
            {demoTasks.slice(0, 2).map(id => {
              const task = useTaskStore.getState().getTask(id);
              return task ? (
                <TaskCard key={id} task={task} mode="compact" className="mb-2" />
              ) : null;
            })}
          </div>
          <div>
            <h4 className="theme-text-subtle mb-2 text-[11px]">{t('taskMonitor.demo.normalMode')}</h4>
            {demoTasks.slice(0, 2).map(id => {
              const task = useTaskStore.getState().getTask(id);
              return task ? (
                <TaskCard key={id} task={task} mode="normal" className="mb-2" />
              ) : null;
            })}
          </div>
          <div>
            <h4 className="theme-text-subtle mb-2 text-[11px]">{t('taskMonitor.demo.detailedMode')}</h4>
            {demoTasks.slice(0, 2).map(id => {
              const task = useTaskStore.getState().getTask(id);
              return task ? (
                <TaskCard key={id} task={task} mode="detailed" className="mb-2" />
              ) : null;
            })}
          </div>
        </div>
      </DemoSection>

      {/* Section 5: Progress Bars */}
      <DemoSection
        title={t('taskMonitor.demo.progressBarTitle')}
        icon={<Settings size={16} className="theme-text-info" />}
        description={t('taskMonitor.demo.progressBarDesc')}
      >
        <div className="space-y-6">
          {/* Linear progress bars */}
          <div>
            <h4 className="theme-text-subtle mb-3 text-[11px]">{t('taskMonitor.demo.linearProgress')}</h4>
            <div className="space-y-3">
              <div>
                <span className="theme-text-subtle text-[10px]">{t('taskMonitor.demo.blueDefault')}</span>
                <TaskProgressBar value={45} total={100} showPercentage height={6} />
              </div>
              <div>
                <span className="theme-text-subtle text-[10px]">{t('taskMonitor.demo.greenComplete')}</span>
                <TaskProgressBar value={100} total={100} showPercentage height={6} color="green" />
              </div>
              <div>
                <span className="theme-text-subtle text-[10px]">{t('taskMonitor.demo.redFailed')}</span>
                <TaskProgressBar value={30} total={100} showPercentage height={6} color="red" />
              </div>
              <div>
                <span className="theme-text-subtle text-[10px]">{t('taskMonitor.demo.orangeWarning')}</span>
                <TaskProgressBar value={60} total={100} showPercentage height={6} color="orange" />
              </div>
            </div>
          </div>

          {/* Circular progress */}
          <div>
            <h4 className="theme-text-subtle mb-3 text-[11px]">{t('taskMonitor.demo.circularProgress')}</h4>
            <div className="flex gap-6">
              <CircularProgress value={45} size={60} strokeWidth={4} color="blue" />
              <CircularProgress value={75} size={60} strokeWidth={4} color="green" />
              <CircularProgress value={30} size={60} strokeWidth={4} color="red" />
              <CircularProgress value={90} size={60} strokeWidth={4} color="orange" />
            </div>
          </div>

          {/* Segmented progress */}
          <div>
            <h4 className="theme-text-subtle mb-3 text-[11px]">{t('taskMonitor.demo.segmentedProgress')}</h4>
            <div className="space-y-3">
              <SegmentedProgress
                segments={[
                  { label: t('taskMonitor.demo.categories.scan'), value: 100, color: 'green' },
                  { label: t('taskMonitor.demo.categories.analysis'), value: 75, color: 'blue' },
                  { label: t('taskMonitor.demo.categories.generation'), value: 30, color: 'orange' },
                  { label: t('taskMonitor.demo.categories.deployment'), value: 0, color: 'gray' },
                ]}
                showLabels
                height={8}
              />
              <SegmentedProgress
                segments={[
                  { label: 'Step 1', value: 100, color: 'green' },
                  { label: 'Step 2', value: 100, color: 'green' },
                  { label: 'Step 3', value: 50, color: 'blue' },
                  { label: 'Step 4', value: 0, color: 'gray' },
                ]}
                showLabels
                height={6}
              />
            </div>
          </div>
        </div>
      </DemoSection>

      {/* Section 6: Status Badges */}
      <DemoSection
        title={t('taskMonitor.demo.statusBadges.title')}
        icon={<Settings size={16} className="theme-text-success" />}
        description={t('taskMonitor.demo.statusBadges.desc')}
      >
        <div className="space-y-4">
          {/* All statuses */}
          <div>
            <h4 className="theme-text-subtle mb-2 text-[11px]">{t('taskMonitor.demo.statusBadges.allStatuses')}</h4>
            <div className="flex flex-wrap gap-2">
              <TaskStatusBadge status={TaskStatus.PENDING} size="sm" />
              <TaskStatusBadge status={TaskStatus.RUNNING} size="sm" />
              <TaskStatusBadge status={TaskStatus.PAUSED} size="sm" />
              <TaskStatusBadge status={TaskStatus.SUCCESS} size="sm" />
              <TaskStatusBadge status={TaskStatus.FAILED} size="sm" />
              <TaskStatusBadge status={TaskStatus.CANCELLED} size="sm" />
            </div>
          </div>

          {/* All sizes */}
          <div>
            <h4 className="theme-text-subtle mb-2 text-[11px]">{t('taskMonitor.demo.statusBadges.allSizes')}</h4>
            <div className="flex items-center gap-4">
              <div>
                <span className="theme-text-subtle text-[10px]">Small</span>
                <TaskStatusBadge status={TaskStatus.RUNNING} size="sm" />
              </div>
              <div>
                <span className="theme-text-subtle text-[10px]">Medium</span>
                <TaskStatusBadge status={TaskStatus.RUNNING} size="md" />
              </div>
              <div>
                <span className="theme-text-subtle text-[10px]">Large</span>
                <TaskStatusBadge status={TaskStatus.RUNNING} size="lg" />
              </div>
            </div>
          </div>

          {/* With/without icons */}
          <div>
            <h4 className="theme-text-subtle mb-2 text-[11px]">{t('taskMonitor.demo.iconsAndAnimation.withIcons')}</h4>
            <div className="flex flex-wrap gap-2">
              <TaskStatusBadge status={TaskStatus.RUNNING} showIcon />
              <TaskStatusBadge status={TaskStatus.RUNNING} showIcon={false} />
              <TaskStatusBadge status={TaskStatus.SUCCESS} showIcon />
              <TaskStatusBadge status={TaskStatus.SUCCESS} showIcon={false} />
            </div>
          </div>

          {/* Animated */}
          <div>
            <h4 className="theme-text-subtle mb-2 text-[11px]">{t('taskMonitor.demo.iconsAndAnimation.animated')}</h4>
            <div className="flex flex-wrap gap-2">
              <TaskStatusBadge status={TaskStatus.RUNNING} animated />
              <TaskStatusBadge status={TaskStatus.RUNNING} animated={false} />
            </div>
          </div>
        </div>
      </DemoSection>

      {/* Section 7: Log Components */}
      <DemoSection
        title={t('taskMonitor.demo.logComponents.title')}
        icon={<FileText size={16} className="theme-text-warning" />}
        description={t('taskMonitor.demo.logComponents.desc')}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h4 className="theme-text-subtle mb-2 text-[11px]">{t('taskMonitor.demo.logComponents.streamFull')}</h4>
            <TaskLogStream
              logs={useTaskStore.getState().getTask(demoTasks[1])?.logs || []}
              showSearch={true}
              showFilters={true}
              showExport={true}
              showLineNumbers={true}
              showTimestamps={true}
              maxLines={50}
            />
          </div>
          <div>
            <h4 className="theme-text-subtle mb-2 text-[11px]">{t('taskMonitor.demo.logComponents.compactMode')}</h4>
            <div className="space-y-3">
              <div>
                <span className="theme-text-subtle text-[10px]">{t('taskMonitor.demo.logComponents.defaultStyle')}</span>
                <TaskLogCompact
                  logs={useTaskStore.getState().getTask(demoTasks[1])?.logs || []}
                  maxLines={3}
                />
              </div>
              <div>
                <span className="theme-text-subtle text-[10px]">{t('taskMonitor.demo.logComponents.withTimestamp')}</span>
                <TaskLogCompact
                  logs={useTaskStore.getState().getTask(demoTasks[1])?.logs || []}
                  maxLines={3}
                  showTimestamp={true}
                />
              </div>
              <div>
                <span className="theme-text-subtle text-[10px]">{t('taskMonitor.demo.logComponents.subtleTheme')}</span>
                <TaskLogCompact
                  logs={useTaskStore.getState().getTask(demoTasks[1])?.logs || []}
                  maxLines={3}
                  theme="subtle"
                />
              </div>
            </div>
          </div>
        </div>
      </DemoSection>

      {/* Footer */}
      <div className="theme-border mt-8 border-t pt-6 text-center">
        <p className="theme-text-subtle text-[11px]">
          {t('taskMonitor.demo.footer.phase')}
        </p>
        <p className="theme-text-subtle mt-1 text-[10px]">
          {t('taskMonitor.demo.footer.components')}
        </p>
      </div>
    </div>
  );
};

export default TaskMonitorDemo;
