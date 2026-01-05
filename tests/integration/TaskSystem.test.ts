import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTaskStore } from '../../src/stores/taskStore';

describe('TaskStore Stability', () => {
  beforeEach(() => {
    useTaskStore.getState().setTasks([]);
  });

  it('should add and update tasks as array', () => {
    const store = useTaskStore.getState();
    const task = {
      id: '1',
      title: 'Test',
      status: 'pending' as any,
      category: 'scan' as any,
      priority: 'normal' as any,
      createdAt: Date.now(),
      progress: { current: 0, total: 100, percentage: 0 }
    };

    store.addTask(task);
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0].id).toBe('1');
  });
});
