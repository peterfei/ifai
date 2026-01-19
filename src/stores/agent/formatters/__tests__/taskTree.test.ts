import { describe, it, expect } from 'vitest';
import { buildTaskTreeLogs } from '../taskTree';

describe('buildTaskTreeLogs', () => {
  it('应该为根节点生成简单日志', () => {
    const node = {
      id: 'root-1',
      title: 'Main Task',
      children: []
    };

    const logs = buildTaskTreeLogs(node);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toBe('📋 Main Task');
  });

  it('应该为单层子节点生成带前缀的日志', () => {
    const node = {
      id: 'root-1',
      title: 'Main Task',
      children: [
        { id: 'child-1', title: 'Subtask 1' },
        { id: 'child-2', title: 'Subtask 2' }
      ]
    };

    const logs = buildTaskTreeLogs(node);

    expect(logs).toHaveLength(3);
    expect(logs[0]).toBe('📋 Main Task');
    expect(logs[1]).toMatch('├─');
    expect(logs[1]).toMatch('Subtask 1');
    expect(logs[2]).toMatch('└─');
    expect(logs[2]).toMatch('Subtask 2');
  });

  it('应该为多层嵌套节点生成正确的树状结构', () => {
    const node = {
      id: 'root-1',
      title: 'Main Task',
      children: [
        {
          id: 'child-1',
          title: 'Subtask 1',
          children: [
            { id: 'grandchild-1', title: 'Nested Task' }
          ]
        },
        { id: 'child-2', title: 'Subtask 2' }
      ]
    };

    const logs = buildTaskTreeLogs(node);

    expect(logs).toHaveLength(4);
    expect(logs[0]).toBe('📋 Main Task');
    expect(logs[1]).toMatch('├─');
    expect(logs[1]).toMatch('Subtask 1');
    expect(logs[2]).toMatch('└─');
    expect(logs[2]).toMatch('Nested Task');
    expect(logs[3]).toMatch('└─');
    expect(logs[3]).toMatch('Subtask 2');
  });

  it('应该处理空子节点数组', () => {
    const node = {
      id: 'root-1',
      title: 'Main Task',
      children: undefined as any
    };

    const logs = buildTaskTreeLogs(node);

    expect(logs).toHaveLength(1);
  });
});
