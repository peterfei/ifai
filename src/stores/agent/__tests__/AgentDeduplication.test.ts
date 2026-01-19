import { describe, it, expect, beforeEach } from 'vitest';
import { createToolCallDeduplicator } from '../AgentDeduplication';

describe('ToolCallDeduplicator', () => {
  it('应该添加重复映射', () => {
    const deduplicator = createToolCallDeduplicator();

    deduplicator.addDuplicate('skip1', 'canonical1');

    expect(deduplicator.getCanonicalId('skip1')).toBe('canonical1');
  });

  it('应该处理多个映射', () => {
    const deduplicator = createToolCallDeduplicator();

    deduplicator.addDuplicate('skip1', 'canonical1');
    deduplicator.addDuplicate('skip2', 'canonical2');

    expect(deduplicator.getCanonicalId('skip1')).toBe('canonical1');
    expect(deduplicator.getCanonicalId('skip2')).toBe('canonical2');
  });

  it('应该覆盖已存在的映射', () => {
    const deduplicator = createToolCallDeduplicator();

    deduplicator.addDuplicate('skip1', 'canonical1');
    deduplicator.addDuplicate('skip1', 'canonical2');

    expect(deduplicator.getCanonicalId('skip1')).toBe('canonical2');
  });

  it('未映射的 ID 返回 undefined', () => {
    const deduplicator = createToolCallDeduplicator();

    expect(deduplicator.getCanonicalId('nonexistent')).toBeUndefined();
  });

  it('应该清理所有映射', () => {
    const deduplicator = createToolCallDeduplicator();

    deduplicator.addDuplicate('skip1', 'canonical1');
    deduplicator.addDuplicate('skip2', 'canonical2');

    deduplicator.clearAll();

    expect(deduplicator.getCanonicalId('skip1')).toBeUndefined();
    expect(deduplicator.getCanonicalId('skip2')).toBeUndefined();
  });

  it('clearAll 在空状态时不应报错', () => {
    const deduplicator = createToolCallDeduplicator();

    expect(() => deduplicator.clearAll()).not.toThrow();
  });
});
