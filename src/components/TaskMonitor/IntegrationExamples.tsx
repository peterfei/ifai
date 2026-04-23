/**
 * TaskMonitor Integration Examples
 *
 * 实际使用场景示例，展示如何在现有项目中集成 TaskMonitor
 */

import React, { useState } from 'react';
import { Play, Terminal, GitMerge, Zap, Shield, CheckCircle2, AlertCircle } from 'lucide-react';
import { TaskCard } from './TaskCard';
import { useTaskStore, createTask } from '../../stores/taskStore';
import { TaskCategory, TaskStatus, TaskPriority, LogLevel } from './types';
import { useTranslation } from 'react-i18next';

const exampleCardClass = 'theme-panel-muted theme-border rounded border p-4';
const exampleTitleClass = 'theme-text mb-3 text-sm font-semibold';
const exampleTextClass = 'theme-text-subtle mt-2 text-[10px]';

// ============================================================================
// Example 1: Test Runner
// ============================================================================

export const TestRunnerExample: React.FC = () => {
  const { t } = useTranslation();
  const { addTask, updateTask } = useTaskStore();
  const [isRunning, setIsRunning] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);

  const runTests = async () => {
    setIsRunning(true);

    // 创建测试任务
    const task = createTask({
      title: t('taskMonitor.integrationExamples.testRunner.taskTitle'),
      description: t('taskMonitor.integrationExamples.testRunner.taskDesc'),
      category: TaskCategory.TEST,
      status: TaskStatus.RUNNING,
      priority: TaskPriority.HIGH,
      progress: {
        current: 0,
        total: 50,
        percentage: 0,
      },
      metrics: {
        speed: 5, // tests per second
        eta: 10000,
      },
      startedAt: Date.now(),
    });

    addTask(task);
    setCurrentTaskId(task.id);

    // 模拟测试运行
    const interval = setInterval(() => {
      const currentTask = useTaskStore.getState().getTask(task.id);
      if (!currentTask || currentTask.progress.current >= 50) {
        clearInterval(interval);

        // 完成
        updateTask(task.id, {
          status: TaskStatus.SUCCESS,
          progress: { current: 50, total: 50, percentage: 100 },
          completedAt: Date.now(),
          result: {
            summary: t('taskMonitor.integrationExamples.testRunner.summary'),
          },
        });
        setIsRunning(false);
        return;
      }

      // 更新进度
      const newProgress = currentTask.progress.current + 5;
      updateTask(task.id, {
        progress: {
          current: newProgress,
          total: 50,
          percentage: (newProgress / 50) * 100,
        },
      });
    }, 500);
  };

  return (
    <div className={exampleCardClass}>
      <h3 className={exampleTitleClass}>
        🧪 {t('taskMonitor.integrationExamples.testRunner.title')}
      </h3>

      <button
        onClick={runTests}
        disabled={isRunning}
        className={`flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-colors ${
          isRunning
            ? 'theme-input-surface theme-text-subtle cursor-not-allowed'
            : 'theme-button-primary'
        }`}
      >
        <Play size={12} />
        {isRunning ? t('taskMonitor.integrationExamples.testRunner.running') : t('taskMonitor.integrationExamples.testRunner.runTest')}
      </button>

      {currentTaskId && (
        <div className="mt-3">
          {(() => {
            const task = useTaskStore.getState().getTask(currentTaskId);
            return task ? <TaskCard task={task} mode="compact" /> : null;
          })()}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Example 2: Deployment Pipeline
// ============================================================================

export const DeploymentPipelineExample: React.FC = () => {
  const { t } = useTranslation();
  const { addTask, updateTask } = useTaskStore();

  const deploy = async () => {
    // 创建部署任务
    const deployTask = createTask({
      title: t('taskMonitor.integrationExamples.deployment.deployTask'),
      description: t('taskMonitor.integrationExamples.deployment.deployDesc'),
      category: TaskCategory.DEPLOY,
      status: TaskStatus.RUNNING,
      priority: TaskPriority.URGENT,
      progress: {
        current: 0,
        total: 5,
        percentage: 0,
      },
      metrics: {
        eta: 120000, // 2 minutes
      },
      logs: [
        {
          timestamp: Date.now(),
          level: LogLevel.INFO,
          message: t('taskMonitor.integrationExamples.deployment.starting'),
        },
      ],
      startedAt: Date.now(),
    });

    addTask(deployTask);

    // 模拟部署步骤
    const steps = [
      { name: t('taskMonitor.integrationExamples.deployment.steps.build'), duration: 3000 },
      { name: t('taskMonitor.integrationExamples.deployment.steps.push'), duration: 5000 },
      { name: t('taskMonitor.integrationExamples.deployment.steps.update'), duration: 4000 },
      { name: t('taskMonitor.integrationExamples.deployment.steps.health'), duration: 3000 },
      { name: t('taskMonitor.integrationExamples.deployment.steps.complete'), duration: 1000 },
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, steps[i].duration));

      // 添加日志
      updateTask(deployTask.id, {
        progress: {
          current: i + 1,
          total: 5,
          percentage: ((i + 1) / 5) * 100,
        },
        logs: [
          ...(useTaskStore.getState().getTask(deployTask.id)?.logs || []),
          {
            timestamp: Date.now(),
            level: LogLevel.INFO,
            message: `✓ ${steps[i].name}`,
          },
        ],
      });
    }

    // 完成
    updateTask(deployTask.id, {
      status: TaskStatus.SUCCESS,
      completedAt: Date.now(),
      result: {
        summary: t('taskMonitor.integrationExamples.deployment.success'),
      },
    });
  };

  return (
    <div className={exampleCardClass}>
      <h3 className={exampleTitleClass}>
        🚀 {t('taskMonitor.integrationExamples.deployment.title')}
      </h3>

      <button
        onClick={deploy}
        className="theme-button-danger flex items-center gap-2 rounded px-3 py-2 text-xs font-medium"
      >
        <Terminal size={12} />
        {t('taskMonitor.integrationExamples.deployment.deployBtn')}
      </button>

      <p className={exampleTextClass}>
        {t('taskMonitor.integrationExamples.deployment.clickDeploy')}
      </p>
    </div>
  );
};

// ============================================================================
// Example 3: Git Operations
// ============================================================================

export const GitOperationsExample: React.FC = () => {
  const { t } = useTranslation();
  const { addTask, updateTask } = useTaskStore();

  const gitPull = async () => {
    const task = createTask({
      title: t('taskMonitor.integrationExamples.git.pullTask'),
      description: t('taskMonitor.integrationExamples.git.pullDesc'),
      category: TaskCategory.GIT,
      status: TaskStatus.RUNNING,
      priority: TaskPriority.NORMAL,
      progress: {
        current: 0,
        total: 3,
        percentage: 0,
      },
      startedAt: Date.now(),
    });

    addTask(task);

    // Fetch
    await new Promise(resolve => setTimeout(resolve, 1000));
    updateTask(task.id, {
      progress: { current: 1, total: 3, percentage: 33 },
      logs: [
        {
          timestamp: Date.now(),
          level: LogLevel.INFO,
          message: t('taskMonitor.integrationExamples.git.from'),
        },
        {
          timestamp: Date.now(),
          level: LogLevel.INFO,
          message: t('taskMonitor.integrationExamples.git.newBranch'),
        },
      ],
    });

    // Checkout
    await new Promise(resolve => setTimeout(resolve, 800));
    updateTask(task.id, {
      progress: { current: 2, total: 3, percentage: 66 },
      logs: [
        ...(useTaskStore.getState().getTask(task.id)?.logs || []),
        {
          timestamp: Date.now(),
          level: LogLevel.INFO,
          message: t('taskMonitor.integrationExamples.git.fastForward'),
        },
      ],
    });

    // Complete
    await new Promise(resolve => setTimeout(resolve, 500));
    updateTask(task.id, {
      status: TaskStatus.SUCCESS,
      progress: { current: 3, total: 3, percentage: 100 },
      completedAt: Date.now(),
      result: {
        summary: t('taskMonitor.integrationExamples.git.updated'),
      },
    });
  };

  return (
    <div className={exampleCardClass}>
      <h3 className={exampleTitleClass}>
        🔀 {t('taskMonitor.integrationExamples.git.title')}
      </h3>

      <button
        onClick={gitPull}
        className="theme-button-danger flex items-center gap-2 rounded px-3 py-2 text-xs font-medium"
      >
        <GitMerge size={12} />
        {t('taskMonitor.integrationExamples.git.gitPull')}
      </button>
    </div>
  );
};

// ============================================================================
// Example 4: Security Scanner
// ============================================================================

export const SecurityScannerExample: React.FC = () => {
  const { t } = useTranslation();
  const { addTask, updateTask } = useTaskStore();

  const scan = async () => {
    const task = createTask({
      title: t('taskMonitor.integrationExamples.security.scanTask'),
      description: t('taskMonitor.integrationExamples.security.scanDesc'),
      category: TaskCategory.SECURITY,
      status: TaskStatus.RUNNING,
      priority: TaskPriority.HIGH,
      progress: {
        current: 0,
        total: 100,
        percentage: 0,
      },
      startedAt: Date.now(),
    });

    addTask(task);

    // 模拟扫描
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));

      updateTask(task.id, {
        progress: {
          current: i,
          total: 100,
          percentage: i,
        },
      });
    }

    // 完成并显示结果
    const vulnerabilities = [
      { name: 'lodash', severity: 'high', count: 1 },
      { name: 'axios', severity: 'moderate', count: 2 },
      { name: 'moment', severity: 'low', count: 1 },
    ];

    updateTask(task.id, {
      status: TaskStatus.FAILED,
      completedAt: Date.now(),
      result: {
        summary: t('taskMonitor.integrationExamples.security.foundVuln', { count: vulnerabilities.length }),
        error: new Error(
          vulnerabilities.map(v =>
            `${v.name}: ${v.severity} (${v.count})`
          ).join(', ')
        ),
      },
      logs: vulnerabilities.map(v => ({
        timestamp: Date.now(),
        level: v.severity === 'high' ? LogLevel.ERROR : LogLevel.WARN,
        message: `\x1b[${v.severity === 'high' ? '31' : '33'}m${v.name}@latest: ${v.severity} severity\x1b[0m`,
      })),
    });
  };

  return (
    <div className={exampleCardClass}>
      <h3 className={exampleTitleClass}>
        🔒 {t('taskMonitor.integrationExamples.security.title')}
      </h3>

      <button
        onClick={scan}
        className="theme-button-danger flex items-center gap-2 rounded px-3 py-2 text-xs font-medium"
      >
        <Shield size={12} />
        {t('taskMonitor.integrationExamples.security.runScan')}
      </button>

      <p className={exampleTextClass}>
        {t('taskMonitor.integrationExamples.security.scanNpm')}
      </p>
    </div>
  );
};

// ============================================================================
// Example 5: Performance Optimization
// ============================================================================

export const PerformanceOptimizationExample: React.FC = () => {
  const { t } = useTranslation();
  const { addTask, updateTask } = useTaskStore();

  const optimize = async () => {
    const task = createTask({
      title: t('taskMonitor.integrationExamples.performance.optTask'),
      description: t('taskMonitor.integrationExamples.performance.optDesc'),
      category: TaskCategory.OPTIMIZE,
      status: TaskStatus.RUNNING,
      priority: TaskPriority.NORMAL,
      progress: {
        current: 0,
        total: 4,
        percentage: 0,
      },
      metrics: {
        eta: 15000,
      },
      startedAt: Date.now(),
    });

    addTask(task);

    const steps = [
      { name: t('taskMonitor.integrationExamples.performance.steps.analyze'), duration: 2000 },
      { name: t('taskMonitor.integrationExamples.performance.steps.config'), duration: 3000 },
      { name: t('taskMonitor.integrationExamples.performance.steps.lazy'), duration: 4000 },
      { name: t('taskMonitor.integrationExamples.performance.steps.test'), duration: 2000 },
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, steps[i].duration));

      updateTask(task.id, {
        progress: {
          current: i + 1,
          total: 4,
          percentage: ((i + 1) / 4) * 100,
        },
        logs: [
          ...(useTaskStore.getState().getTask(task.id)?.logs || []),
          {
            timestamp: Date.now(),
            level: LogLevel.INFO,
            message: `✓ ${steps[i].name}`,
          },
        ],
      });
    }

    updateTask(task.id, {
      status: TaskStatus.SUCCESS,
      completedAt: Date.now(),
      result: {
        summary: t('taskMonitor.integrationExamples.performance.improved'),
      },
      logs: [
        ...(useTaskStore.getState().getTask(task.id)?.logs || []),
        {
          timestamp: Date.now(),
          level: LogLevel.INFO,
          message: t('taskMonitor.integrationExamples.performance.bundle'),
        },
        {
          timestamp: Date.now(),
          level: LogLevel.INFO,
          message: t('taskMonitor.integrationExamples.performance.firstPaint'),
        },
      ],
    });
  };

  return (
    <div className={exampleCardClass}>
      <h3 className={exampleTitleClass}>
        ⚡ {t('taskMonitor.integrationExamples.performance.title')}
      </h3>

      <button
        onClick={optimize}
        className="theme-button-primary flex items-center gap-2 rounded px-3 py-2 text-xs font-medium"
      >
        <Zap size={12} />
        {t('taskMonitor.integrationExamples.performance.runOpt')}
      </button>

      <p className={exampleTextClass}>
        {t('taskMonitor.integrationExamples.performance.optPerf')}
      </p>
    </div>
  );
};

// ============================================================================
// Main Examples Component
// ============================================================================

export const IntegrationExamples: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="integration-examples theme-panel p-6">
      <h2 className="theme-text mb-4 text-lg font-bold">
        {t('taskMonitor.integrationExamples.main.title')}
      </h2>
      <p className="theme-text-subtle mb-6 text-xs">
        {t('taskMonitor.integrationExamples.main.desc')}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TestRunnerExample />
        <DeploymentPipelineExample />
        <GitOperationsExample />
        <SecurityScannerExample />
        <PerformanceOptimizationExample />
      </div>

      {/* Task Monitor */}
      <div className="mt-6">
        <h3 className="theme-text mb-3 text-sm font-semibold">
          {t('taskMonitor.integrationExamples.main.monitorTitle')}
        </h3>
        <p className="theme-text-subtle mb-3 text-[10px]">
          {t('taskMonitor.integrationExamples.main.monitorDesc')}
        </p>
        <div className="theme-panel-muted theme-border rounded p-4">
          {/* 使用 taskStore 的 getAllTasks 显示所有任务 */}
          {/* 在实际使用中，可以使用 TaskMonitor 组件 */}
        </div>
      </div>
    </div>
  );
};

export default IntegrationExamples;
