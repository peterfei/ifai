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

const exampleCardClass = 'theme-panel-muted theme-border rounded border p-4';
const exampleTitleClass = 'theme-text mb-3 text-sm font-semibold';
const exampleTextClass = 'theme-text-subtle mt-2 text-[10px]';

// ============================================================================
// Example 1: Test Runner
// ============================================================================

export const TestRunnerExample: React.FC = () => {
  const { addTask, updateTask } = useTaskStore();
  const [isRunning, setIsRunning] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);

  const runTests = async () => {
    setIsRunning(true);

    // 创建测试任务
    const task = createTask({
      title: '单元测试 - Auth 组件',
      description: '运行 50 个单元测试用例',
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
            summary: '✅ 所有 50 个测试通过',
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
        🧪 测试运行器示例
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
        {isRunning ? '运行中...' : '运行测试'}
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
  const { addTask, updateTask } = useTaskStore();

  const deploy = async () => {
    // 创建部署任务
    const deployTask = createTask({
      title: '部署到生产环境',
      description: 'AWS ECS - us-east-1',
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
          message: '🚀 开始部署流程...',
        },
      ],
      startedAt: Date.now(),
    });

    addTask(deployTask);

    // 模拟部署步骤
    const steps = [
      { name: '构建 Docker 镜像', duration: 3000 },
      { name: '推送到 ECR', duration: 5000 },
      { name: '更新 ECS 服务', duration: 4000 },
      { name: '健康检查', duration: 3000 },
      { name: '部署完成', duration: 1000 },
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
        summary: '🎉 部署成功！',
      },
    });
  };

  return (
    <div className={exampleCardClass}>
      <h3 className={exampleTitleClass}>
        🚀 CI/CD 部署管道示例
      </h3>

      <button
        onClick={deploy}
        className="theme-button-danger flex items-center gap-2 rounded px-3 py-2 text-xs font-medium"
      >
        <Terminal size={12} />
        部署到生产环境
      </button>

      <p className={exampleTextClass}>
        点击按钮模拟完整的 CI/CD 部署流程
      </p>
    </div>
  );
};

// ============================================================================
// Example 3: Git Operations
// ============================================================================

export const GitOperationsExample: React.FC = () => {
  const { addTask, updateTask } = useTaskStore();

  const gitPull = async () => {
    const task = createTask({
      title: 'Git Pull - main 分支',
      description: '拉取最新代码',
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
          message: 'From github.com:user/repo',
        },
        {
          timestamp: Date.now(),
          level: LogLevel.INFO,
          message: '   * [new branch]      feature-branch',
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
          message: 'Fast-forwarding...',
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
        summary: '已更新到 latest commit',
      },
    });
  };

  return (
    <div className={exampleCardClass}>
      <h3 className={exampleTitleClass}>
        🔀 Git 操作示例
      </h3>

      <button
        onClick={gitPull}
        className="theme-button-danger flex items-center gap-2 rounded px-3 py-2 text-xs font-medium"
      >
        <GitMerge size={12} />
        Git Pull
      </button>
    </div>
  );
};

// ============================================================================
// Example 4: Security Scanner
// ============================================================================

export const SecurityScannerExample: React.FC = () => {
  const { addTask, updateTask } = useTaskStore();

  const scan = async () => {
    const task = createTask({
      title: '依赖安全扫描',
      description: '检查 npm 依赖漏洞',
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
        summary: `发现 ${vulnerabilities.length} 个漏洞`,
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
        🔒 安全扫描示例
      </h3>

      <button
        onClick={scan}
        className="theme-button-danger flex items-center gap-2 rounded px-3 py-2 text-xs font-medium"
      >
        <Shield size={12} />
        运行安全扫描
      </button>

      <p className={exampleTextClass}>
        扫描 npm 依赖的安全漏洞
      </p>
    </div>
  );
};

// ============================================================================
// Example 5: Performance Optimization
// ============================================================================

export const PerformanceOptimizationExample: React.FC = () => {
  const { addTask, updateTask } = useTaskStore();

  const optimize = async () => {
    const task = createTask({
      title: '性能优化 - 代码分割',
      description: '优化前端资源加载性能',
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
      { name: '分析 bundle 大小', duration: 2000 },
      { name: '配置代码分割', duration: 3000 },
      { name: '优化懒加载', duration: 4000 },
      { name: '测试性能提升', duration: 2000 },
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
        summary: '性能提升 45%',
      },
      logs: [
        ...(useTaskStore.getState().getTask(task.id)?.logs || []),
        {
          timestamp: Date.now(),
          level: LogLevel.INFO,
          message: '✨ Bundle size: 2.5MB → 1.4MB',
        },
        {
          timestamp: Date.now(),
          level: LogLevel.INFO,
          message: '⚡ First paint: 1.2s → 0.6s',
        },
      ],
    });
  };

  return (
    <div className={exampleCardClass}>
      <h3 className={exampleTitleClass}>
        ⚡ 性能优化示例
      </h3>

      <button
        onClick={optimize}
        className="theme-button-primary flex items-center gap-2 rounded px-3 py-2 text-xs font-medium"
      >
        <Zap size={12} />
        运行优化
      </button>

      <p className={exampleTextClass}>
        优化前端资源加载性能
      </p>
    </div>
  );
};

// ============================================================================
// Main Examples Component
// ============================================================================

export const IntegrationExamples: React.FC = () => {
  return (
    <div className="integration-examples theme-panel p-6">
      <h2 className="theme-text mb-4 text-lg font-bold">
        TaskMonitor 集成示例
      </h2>
      <p className="theme-text-subtle mb-6 text-xs">
        这些示例展示了如何在现有项目中集成和使用 TaskMonitor 系统
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
          📊 任务监控面板
        </h3>
        <p className="theme-text-subtle mb-3 text-[10px]">
          点击上方按钮后，任务会自动添加到这里
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
