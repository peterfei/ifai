import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTaskBreakdownStore } from '../../src/stores/taskBreakdownStore';
import { getTaskExecutionService } from '../../src/services/taskExecutionService';

// Mock dependencies
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd) => {
    return undefined;
  })
}));

describe('Intelligent Task System Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaskBreakdownStore.getState().clearCurrent();
  });

  it('should correctly store and switch task breakdown data', () => {
    const store = useTaskBreakdownStore.getState();
    const mockBreakdown = {
      id: 'test-tb-1',
      title: 'Test Feature',
      description: 'Test Desc',
      originalPrompt: 'Prompt',
      taskTree: {
        id: 'root',
        title: 'Root Task',
        status: 'pending' as const,
        dependencies: [],
        children: [
          { id: 'child-1', title: 'Task 1', status: 'pending' as const, dependencies: [], children: [] }
        ]
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'draft' as const
    };

    store.setCurrentBreakdown(mockBreakdown);
    expect(useTaskBreakdownStore.getState().currentBreakdown?.id).toBe('test-tb-1');
  });

  it('should manage task execution states correctly', async () => {
    const service = getTaskExecutionService();
    const mockTasks = [
      { id: '1', title: 'Task 1', content: 'Do 1', status: 'todo' as const, level: 1 },
      { id: '2', title: 'Task 2', content: 'Do 2', status: 'todo' as const, level: 1, parentId: '1' }
    ];
    
    // 完整模拟 TasksFile 结构
    // @ts-ignore
    service.tasksData = {
        title: 'Test',
        description: '',
        tasks: mockTasks
    };
    // @ts-ignore
    service.tasksFile = '/test/tasks.md';

    // 1. 开始任务
    await service.startTask('1');
    expect(service.findTask('1')?.status).toBe('in_progress');

    // 2. 完成任务
    await service.completeTask('1');
    expect(service.findTask('1')?.status).toBe('done');

    // 统计逻辑
    const stats = service.getTaskStats();
    expect(stats.done).toBe(1);
    expect(stats.todo).toBe(1);
  });
});