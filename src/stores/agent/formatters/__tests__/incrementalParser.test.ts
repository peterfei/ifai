import { describe, it, expect } from 'vitest';
import { extractTaskTitlesIncremental } from '../incrementalParser';

describe('extractTaskTitlesIncremental', () => {
  it('应该从简单 JSON 中提取标题', () => {
    const buffer = '{"title": "Task 1", "children": []}';
    const existingLogs: string[] = [];

    const logs = extractTaskTitlesIncremental(buffer, existingLogs);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('Task 1');
    expect(logs[0]).toContain('📋');
  });

  it('应该从嵌套结构中提取多个任务', () => {
    const buffer = '{"title": "Parent", "children": [{"title": "Child 1"}, {"title": "Child 2"}]}';
    const existingLogs: string[] = [];

    const logs = extractTaskTitlesIncremental(buffer, existingLogs);

    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs.some(l => l.includes('Parent'))).toBe(true);
    expect(logs.some(l => l.includes('Child 1'))).toBe(true);
    expect(logs.some(l => l.includes('Child 2'))).toBe(true);
  });

  it('应该跳过已经存在的日志（去重）', () => {
    const buffer = '{"title": "Existing Task", "children": [{"title": "New Task"}]}';
    const existingLogs = ['📋 Existing Task'];

    const logs = extractTaskTitlesIncremental(buffer, existingLogs);

    expect(logs).not.toContain('📋 Existing Task');
    expect(logs.some(l => l.includes('New Task'))).toBe(true);
  });

  it('应该解析嵌套任务并生成正确的前缀', () => {
    const buffer = '{"title": "Root", "children": [{"title": "Child A", "children": [{"title": "Grandchild"}]}, {"title": "Child B"}]}';
    const existingLogs: string[] = [];

    const logs = extractTaskTitlesIncremental(buffer, existingLogs);

    // 至少应该有 3 个任务（Root + 子任务）
    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(logs.some(l => l.includes('Root'))).toBe(true);
    expect(logs.some(l => l.includes('Child A'))).toBe(true);
    expect(logs.some(l => l.includes('Child B'))).toBe(true);
  });

  it('应该处理不完整的 JSON（流式数据）', () => {
    const buffer = '{"title": "Partial Task", "child';
    const existingLogs: string[] = [];

    const logs = extractTaskTitlesIncremental(buffer, existingLogs);

    // 应该回退到正则模式并提取标题
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('Partial Task');
  });

  it('应该在解析失败时回退到正则模式', () => {
    const buffer = 'Some text before {"title": "Fallback Task"} more text';
    const existingLogs: string[] = [];

    const logs = extractTaskTitlesIncremental(buffer, existingLogs);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('Fallback Task');
  });

  it('应该处理空缓冲区', () => {
    const buffer = '';
    const existingLogs: string[] = [];

    const logs = extractTaskTitlesIncremental(buffer, existingLogs);

    expect(logs).toHaveLength(0);
  });

  it('应该忽略没有标题的任务', () => {
    const buffer = '{"children": [{"name": "No Title"}]}';
    const existingLogs: string[] = [];

    const logs = extractTaskTitlesIncremental(buffer, existingLogs);

    expect(logs).toHaveLength(0);
  });

  it('应该处理带前缀的现有日志（提取纯标题）', () => {
    const buffer = '{"title": "Duplicated Title"}';
    const existingLogs = ['├─ 📋 Duplicated Title', '│   └─ 📋 Another Task'];

    const logs = extractTaskTitlesIncremental(buffer, existingLogs);

    // "Duplicated Title" 应该被去重
    expect(logs.some(l => l.includes('Duplicated Title'))).toBe(false);
  });

  it('应该从多个不相关的 JSON 对象中提取所有标题', () => {
    const buffer = '{"title": "First"} {"title": "Second"} {"title": "Third"}';
    const existingLogs: string[] = [];

    const logs = extractTaskTitlesIncremental(buffer, existingLogs);

    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(logs.some(l => l.includes('First'))).toBe(true);
    expect(logs.some(l => l.includes('Second'))).toBe(true);
    expect(logs.some(l => l.includes('Third'))).toBe(true);
  });
});
