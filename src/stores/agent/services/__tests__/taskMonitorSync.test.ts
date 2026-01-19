import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock useTaskStore - 必须在 import 之前
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: vi.fn()
}));

import { syncAgentActionToTaskMonitor } from '../taskMonitorSync';
import { useTaskStore } from '@/stores/taskStore';
import { TaskStatus as MonitorStatus } from '@/components/TaskMonitor/types';

describe('syncAgentActionToTaskMonitor', () => {
  const mockTaskStore = {
    tasks: [],
    addTask: vi.fn(),
    updateTask: vi.fn(),
    find: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useTaskStore as any).mockReturnValue(mockTaskStore);
    (useTaskStore as any).getState = () => mockTaskStore;
  });

  it('应该为新 agent 创建任务', () => {
    mockTaskStore.tasks = [];

    syncAgentActionToTaskMonitor('agent-123', 'explore', 'running', 'Starting exploration');

    expect(mockTaskStore.addTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'agent-123',
      title: 'explore Agent',
      description: 'Starting exploration',
      status: MonitorStatus.RUNNING
    }));
  });

  it('应该更新已存在的任务', () => {
    mockTaskStore.tasks = [{
      id: 'agent-123',
      createdAt: 1000000,
      description: 'Initial task'
    }];

    syncAgentActionToTaskMonitor('agent-123', 'explore', 'completed', 'Task completed');

    expect(mockTaskStore.updateTask).toHaveBeenCalledWith('agent-123', expect.objectContaining({
      status: MonitorStatus.SUCCESS
    }));
  });

  it('应该将 completed 状态映射为 SUCCESS', () => {
    mockTaskStore.tasks = [];

    syncAgentActionToTaskMonitor('agent-456', 'backend_dev', 'completed');

    expect(mockTaskStore.addTask).toHaveBeenCalledWith(expect.objectContaining({
      status: MonitorStatus.SUCCESS
    }));
  });

  it('应该将 failed 状态映射为 FAILED', () => {
    mockTaskStore.tasks = [];

    syncAgentActionToTaskMonitor('agent-789', 'frontend_dev', 'failed', 'Build failed');

    expect(mockTaskStore.addTask).toHaveBeenCalledWith(expect.objectContaining({
      status: MonitorStatus.FAILED,
      description: 'Build failed'
    }));
  });

  it('应该为 completed 任务设置 100% 进度', () => {
    mockTaskStore.tasks = [];

    syncAgentActionToTaskMonitor('agent-001', 'test', 'completed');

    expect(mockTaskStore.addTask).toHaveBeenCalledWith(expect.objectContaining({
      progress: expect.objectContaining({
        current: 100,
        total: 100,
        percentage: 100
      })
    }));
  });

  it('应该为 running 任务设置 50% 进度', () => {
    mockTaskStore.tasks = [];

    syncAgentActionToTaskMonitor('agent-002', 'deploy', 'running');

    expect(mockTaskStore.addTask).toHaveBeenCalledWith(expect.objectContaining({
      progress: expect.objectContaining({
        current: 50,
        total: 100,
        percentage: 50
      })
    }));
  });

  it('应该保留已存在任务的创建时间', () => {
    const originalCreatedAt = 1234567890;
    mockTaskStore.tasks = [{
      id: 'agent-retain',
      createdAt: originalCreatedAt
    }];

    syncAgentActionToTaskMonitor('agent-retain', 'explore', 'running', 'Updated');

    expect(mockTaskStore.updateTask).toHaveBeenCalledWith('agent-retain', expect.objectContaining({
      createdAt: originalCreatedAt
    }));
  });

  it('应该为日志创建时间戳', () => {
    mockTaskStore.tasks = [];

    const beforeTime = Date.now();
    syncAgentActionToTaskMonitor('agent-log', 'test', 'running', 'Test log message');
    const afterTime = Date.now();

    expect(mockTaskStore.addTask).toHaveBeenCalledWith(expect.objectContaining({
      logs: expect.arrayContaining([
        expect.objectContaining({
          level: 'info',
          message: 'Test log message',
          timestamp: expect.any(Number)
        })
      ])
    }));

    const addedTask = mockTaskStore.addTask.mock.calls[0][0];
    expect(addedTask.logs[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
    expect(addedTask.logs[0].timestamp).toBeLessThanOrEqual(afterTime);
  });

  it('应该使用默认描述当没有提供日志', () => {
    mockTaskStore.tasks = [];

    syncAgentActionToTaskMonitor('agent-default', 'explore', 'running');

    expect(mockTaskStore.addTask).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Executing explore logic...'
    }));
  });
});
