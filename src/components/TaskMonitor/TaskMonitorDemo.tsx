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
        className="flex items-center justify-between py-3 px-4 bg-[#252526] border border-[#3c3c3c] rounded cursor-pointer hover:border-[#555] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-[14px] font-semibold text-[#cccccc]">{title}</h2>
        </div>
        {description && (
          <span className="text-[11px] text-[#858585]">{description}</span>
        )}
        <div className="ml-auto">
          {expanded ? (
            <Pause size={14} className="text-[#858585]" />
          ) : (
            <Play size={14} className="text-[#858585]" />
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
      title: '扫描项目文件',
      description: '递归扫描 src 目录下的所有文件',
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
        message: '\x1b[36mStarting\x1b[0m build process...',
      },
      {
        timestamp: now - 9000,
        level: LogLevel.INFO,
        message: 'Compiling TypeScript files...',
      },
      {
        timestamp: now - 8000,
        level: LogLevel.WARN,
        message: '\x1b[33mWarning:\x1b[0m Deprecated API in utils/old.ts',
      },
      {
        timestamp: now - 7000,
        level: LogLevel.INFO,
        message: 'Bundling assets...',
      },
      {
        timestamp: now - 6000,
        level: LogLevel.INFO,
        message: '\x1b[32m✓ Build completed\x1b[0m successfully',
      },
    ];

    const buildTask = createTask({
      title: '生产环境构建',
      description: '构建生产环境的优化代码包',
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
        message: 'Initializing AI model...',
      },
      {
        timestamp: now - 7000,
        level: LogLevel.DEBUG,
        message: 'Model loaded: gpt-4',
      },
      {
        timestamp: now - 6000,
        level: LogLevel.ERROR,
        message: '\x1b[31m✗ API Error:\x1b[0m Rate limit exceeded',
      },
      {
        timestamp: now - 5000,
        level: LogLevel.ERROR,
        message: 'Failed to generate component',
      },
    ];

    const genTask = createTask({
      title: 'AI 代码生成',
      description: '使用 AI 生成 React 组件',
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
        summary: '生成失败：API 速率限制',
        error: new Error('Rate limit exceeded'),
      },
    });
    addTask(genTask);
    taskIds.push(genTask.id);

    // Task 4: Pending transfer task
    const transferTask = createTask({
      title: '上传文件到服务器',
      description: '上传 dist 目录到 CDN',
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
      title: '代码质量分析',
      description: '分析代码复杂度和潜在问题',
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
    <div className="task-monitor-demo p-6 space-y-6 bg-[#1e1e1e] min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#cccccc] mb-2">
            TaskMonitor 工业级任务监控系统
          </h1>
          <p className="text-[12px] text-[#858585]">
            完整功能演示 - 所有组件、模式和交互
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoUpdate(!autoUpdate)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded transition-colors ${
              autoUpdate
                ? 'bg-[#4ec9b0] text-white'
                : 'bg-[#3c3c3c] text-[#858585] hover:text-[#cccccc]'
            }`}
          >
            {autoUpdate ? <Pause size={12} /> : <Play size={12} />}
            {autoUpdate ? '自动更新' : '已暂停'}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#569cd6] text-white text-[11px] rounded hover:bg-[#569cd680] transition-colors"
          >
            <RotateCcw size={12} />
            重置演示
          </button>
        </div>
      </div>

      {/* Section 1: Main TaskMonitor */}
      <DemoSection
        title="TaskMonitor - 主监控视图"
        icon={<Layers size={16} className="text-[#569cd6]" />}
        description="完整的任务监控界面，包含筛选、过滤和汇总"
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
        title="TaskStats - 统计图表"
        icon={<BarChart3 size={16} className="text-[#4ec9b0]" />}
        description="任务执行统计和性能指标"
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
        title="TaskTimeline - 执行时间线"
        icon={<Clock size={16} className="text-[#dcdcaa]" />}
        description="任务执行历史和时间线视图"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h4 className="text-[11px] text-[#858585] mb-2">按类别分组</h4>
            <TaskTimeline
              tasks={useTaskStore.getState().getAllTasks()}
              groupBy="category"
              showDuration={true}
              showMetrics={true}
              maxItems={10}
            />
          </div>
          <div>
            <h4 className="text-[11px] text-[#858585] mb-2">按状态分组</h4>
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
        title="TaskCard - 卡片变体"
        icon={<FileText size={16} className="text-[#ce9178]" />}
        description="不同显示模式的任务卡片"
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <h4 className="text-[11px] text-[#858585] mb-2">Compact 模式</h4>
            {demoTasks.slice(0, 2).map(id => {
              const task = useTaskStore.getState().getTask(id);
              return task ? (
                <TaskCard key={id} task={task} mode="compact" className="mb-2" />
              ) : null;
            })}
          </div>
          <div>
            <h4 className="text-[11px] text-[#858585] mb-2">Normal 模式</h4>
            {demoTasks.slice(0, 2).map(id => {
              const task = useTaskStore.getState().getTask(id);
              return task ? (
                <TaskCard key={id} task={task} mode="normal" className="mb-2" />
              ) : null;
            })}
          </div>
          <div>
            <h4 className="text-[11px] text-[#858585] mb-2">Detailed 模式</h4>
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
        title="ProgressBar - 进度条"
        icon={<Settings size={16} className="text-[#569cd6]" />}
        description="各种进度条样式和动画"
      >
        <div className="space-y-6">
          {/* Linear progress bars */}
          <div>
            <h4 className="text-[11px] text-[#858585] mb-3">线性进度条</h4>
            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-[#858585]">蓝色 (默认)</span>
                <TaskProgressBar value={45} total={100} showPercentage height={6} />
              </div>
              <div>
                <span className="text-[10px] text-[#858585]">绿色 (完成)</span>
                <TaskProgressBar value={100} total={100} showPercentage height={6} color="green" />
              </div>
              <div>
                <span className="text-[10px] text-[#858585]">红色 (失败)</span>
                <TaskProgressBar value={30} total={100} showPercentage height={6} color="red" />
              </div>
              <div>
                <span className="text-[10px] text-[#858585]">橙色 (警告)</span>
                <TaskProgressBar value={60} total={100} showPercentage height={6} color="orange" />
              </div>
            </div>
          </div>

          {/* Circular progress */}
          <div>
            <h4 className="text-[11px] text-[#858585] mb-3">环形进度</h4>
            <div className="flex gap-6">
              <CircularProgress value={45} size={60} strokeWidth={4} color="blue" />
              <CircularProgress value={75} size={60} strokeWidth={4} color="green" />
              <CircularProgress value={30} size={60} strokeWidth={4} color="red" />
              <CircularProgress value={90} size={60} strokeWidth={4} color="orange" />
            </div>
          </div>

          {/* Segmented progress */}
          <div>
            <h4 className="text-[11px] text-[#858585] mb-3">分段进度</h4>
            <div className="space-y-3">
              <SegmentedProgress
                segments={[
                  { label: '扫描', value: 100, color: 'green' },
                  { label: '分析', value: 75, color: 'blue' },
                  { label: '生成', value: 30, color: 'orange' },
                  { label: '部署', value: 0, color: 'gray' },
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
        title="TaskStatusBadge - 状态徽章"
        icon={<Settings size={16} className="text-[#4ec9b0]" />}
        description="所有状态和尺寸的徽章"
      >
        <div className="space-y-4">
          {/* All statuses */}
          <div>
            <h4 className="text-[11px] text-[#858585] mb-2">所有状态</h4>
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
            <h4 className="text-[11px] text-[#858585] mb-2">所有尺寸</h4>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-[10px] text-[#858585]">Small</span>
                <TaskStatusBadge status={TaskStatus.RUNNING} size="sm" />
              </div>
              <div>
                <span className="text-[10px] text-[#858585]">Medium</span>
                <TaskStatusBadge status={TaskStatus.RUNNING} size="md" />
              </div>
              <div>
                <span className="text-[10px] text-[#858585]">Large</span>
                <TaskStatusBadge status={TaskStatus.RUNNING} size="lg" />
              </div>
            </div>
          </div>

          {/* With/without icons */}
          <div>
            <h4 className="text-[11px] text-[#858585] mb-2">带图标/不带图标</h4>
            <div className="flex flex-wrap gap-2">
              <TaskStatusBadge status={TaskStatus.RUNNING} showIcon />
              <TaskStatusBadge status={TaskStatus.RUNNING} showIcon={false} />
              <TaskStatusBadge status={TaskStatus.SUCCESS} showIcon />
              <TaskStatusBadge status={TaskStatus.SUCCESS} showIcon={false} />
            </div>
          </div>

          {/* Animated */}
          <div>
            <h4 className="text-[11px] text-[#858585] mb-2">动画效果</h4>
            <div className="flex flex-wrap gap-2">
              <TaskStatusBadge status={TaskStatus.RUNNING} animated />
              <TaskStatusBadge status={TaskStatus.RUNNING} animated={false} />
            </div>
          </div>
        </div>
      </DemoSection>

      {/* Section 7: Log Components */}
      <DemoSection
        title="日志组件"
        icon={<FileText size={16} className="text-[#dcdcaa]" />}
        description="TaskLogStream 和 TaskLogCompact"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h4 className="text-[11px] text-[#858585] mb-2">TaskLogStream - 完整功能</h4>
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
            <h4 className="text-[11px] text-[#858585] mb-2">TaskLogCompact - 紧凑模式</h4>
            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-[#858585]">默认样式</span>
                <TaskLogCompact
                  logs={useTaskStore.getState().getTask(demoTasks[1])?.logs || []}
                  maxLines={3}
                />
              </div>
              <div>
                <span className="text-[10px] text-[#858585]">带时间戳</span>
                <TaskLogCompact
                  logs={useTaskStore.getState().getTask(demoTasks[1])?.logs || []}
                  maxLines={3}
                  showTimestamp={true}
                />
              </div>
              <div>
                <span className="text-[10px] text-[#858585]">Subtle 主题</span>
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
      <div className="mt-8 pt-6 border-t border-[#3c3c3c] text-center">
        <p className="text-[11px] text-[#858585]">
          TaskMonitor 工业级任务监控系统 - Phase 3 完成
        </p>
        <p className="text-[10px] text-[#858585] mt-1">
          包含 8 个核心组件 + 2 个可视化组件 + 完整的状态管理系统
        </p>
      </div>
    </div>
  );
};

export default TaskMonitorDemo;
