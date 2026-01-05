import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTaskExecutionService } from '../../src/services/taskExecutionService';
import { useTaskStore } from '../../src/stores/taskStore';
import { TaskStatus } from '../../src/components/TaskMonitor/types';

// Mock Tauri invoke to prevent actual file writing
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => undefined)
}));

// Mock readFileContent
vi.mock('../../src/utils/fileSystem', () => ({
  readFileContent: vi.fn(async () => 'test content')
}));

describe('Task Command Sync Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaskStore.getState().setTasks([]);
  });

  it('should sync Mission Control UI when a task is completed via service', async () => {
    const service = getTaskExecutionService();
    const taskStore = useTaskStore.getState();

    // 1. Prepare initial data
    const mockTasks = [
      { id: '1', title: 'Test Task', content: 'Desc', status: 'todo' as const, level: 0 }
    ];
    
    // @ts-ignore
    service.tasksFile = { tasks: mockTasks, rawContent: '- [ ] 1 Test Task: Desc', proposalId: 'test' };
    // @ts-ignore
    service.tasksFilePath = '/project/.ifai/changes/test/tasks.md';
    
    // Initial sync
    // @ts-ignore
    service.syncWithStore();

    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0].status).toBe(TaskStatus.PENDING);

    // 2. Complete task via service (simulating /task:complete command)
    await service.completeTask('1');

    // 3. Verify sync to TaskStore (Mission Control data source)
    expect(useTaskStore.getState().tasks[0].status).toBe(TaskStatus.SUCCESS);
    expect(useTaskStore.getState().tasks[0].progress.percentage).toBe(100);
    
    console.log('[Test] Mission Control sync verified!');
  });

  it('should sync Mission Control UI when a task is started via service', async () => {
    const service = getTaskExecutionService();
    
    // @ts-ignore
    service.tasksFile = { 
        tasks: [{ id: '2', title: 'Run Task', content: 'Desc', status: 'todo' as const, level: 0 }], 
        rawContent: '- [ ] 2 Run Task: Desc' 
    };
    // @ts-ignore
    service.tasksFilePath = '/project/.ifai/changes/test/tasks.md';

    await service.startTask('2');

    const updatedTasks = useTaskStore.getState().tasks;
    expect(updatedTasks[0].status).toBe(TaskStatus.RUNNING);
    expect(updatedTasks[0].progress.percentage).toBe(50);
  });
});
