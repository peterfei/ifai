import { describe, it, expect } from 'vitest';
import {
  sliceLogs,
  shouldUpdateStatus,
  extractTaskTreeFromBuffer,
  extractTitleFromBuffer
} from '../handlerHelpers';

describe('handlerHelpers', () => {
  describe('sliceLogs', () => {
    it('应该限制日志数量到指定大小', () => {
      const logs = Array.from({ length: 150 }, (_, i) => `Log ${i}`);
      const result = sliceLogs(logs, 100);

      expect(result).toHaveLength(100);
      expect(result[0]).toBe('Log 50'); // 保留最后 100 条
    });

    it('应该返回原数组如果小于限制', () => {
      const logs = ['a', 'b', 'c'];
      const result = sliceLogs(logs, 100);

      expect(result).toEqual(logs);
    });

    it('应该处理空数组', () => {
      const result = sliceLogs([], 100);

      expect(result).toEqual([]);
    });

    it('应该使用默认限制 100', () => {
      const logs = Array.from({ length: 150 }, (_, i) => `Log ${i}`);
      const result = sliceLogs(logs);

      expect(result).toHaveLength(100);
    });
  });

  describe('shouldUpdateStatus', () => {
    it('应该修复 initializing 状态', () => {
      expect(shouldUpdateStatus('initializing')).toBe(true);
    });

    it('应该修复 idle 状态', () => {
      expect(shouldUpdateStatus('idle')).toBe(true);
    });

    it('应该保留 running 状态', () => {
      expect(shouldUpdateStatus('running')).toBe(false);
    });

    it('应该保留 waitingfortool 状态', () => {
      expect(shouldUpdateStatus('waitingfortool')).toBe(false);
    });

    it('应该保留 completed 状态', () => {
      expect(shouldUpdateStatus('completed')).toBe(false);
    });

    it('应该保留 failed 状态', () => {
      expect(shouldUpdateStatus('failed')).toBe(false);
    });
  });

  describe('extractTitleFromBuffer', () => {
    it('应该从 JSON 缓冲区提取标题', () => {
      const buffer = '{"title": "My Task", "description": "Do something"}';
      const result = extractTitleFromBuffer(buffer);

      expect(result).toBe('My Task');
    });

    it('应该处理没有标题的缓冲区', () => {
      const buffer = '{"description": "No title here"}';
      const result = extractTitleFromBuffer(buffer);

      expect(result).toBeNull();
    });

    it('应该处理空字符串', () => {
      const result = extractTitleFromBuffer('');

      expect(result).toBeNull();
    });

    it('应该提取第一个标题', () => {
      const buffer = '{"title": "First", "children": [{"title": "Second"}]}';
      const result = extractTitleFromBuffer(buffer);

      expect(result).toBe('First');
    });
  });

  describe('extractTaskTreeFromBuffer', () => {
    it('应该从有效 JSON 中提取 taskTree', () => {
      const buffer = `{"taskTree": {"title": "Root", "children": [{"title": "Child"}]}}`;
      const result = extractTaskTreeFromBuffer(buffer);

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Root');
      expect(result?.children).toHaveLength(1);
      expect(result?.children?.[0].title).toBe('Child');
    });

    it('应该处理没有 taskTree 的 JSON', () => {
      const buffer = '{"other": "data"}';
      const result = extractTaskTreeFromBuffer(buffer);

      expect(result).toBeNull();
    });

    it('应该处理无效的 JSON', () => {
      const buffer = '{invalid json}';
      const result = extractTaskTreeFromBuffer(buffer);

      expect(result).toBeNull();
    });

    it('应该处理空字符串', () => {
      const result = extractTaskTreeFromBuffer('');

      expect(result).toBeNull();
    });

    it('应该处理嵌套的 taskTree 结构', () => {
      const buffer = `{"taskTree": {"title": "Parent", "children": [{"title": "Child1"}, {"title": "Child2"}]}}`;
      const result = extractTaskTreeFromBuffer(buffer);

      expect(result?.children).toHaveLength(2);
    });
  });
});
