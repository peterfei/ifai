/**
 * MessageOperations 单元测试
 *
 * 元编程验证：操作即数据（Operation as Data），纯函数可组合。
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { ops, applyToMessagesWith } from '../MessageOperations';

describe('MessageOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── 操作组合子 ───

  test('UT-MO1: appendContent 追加 delta + 标记 isStreaming', () => {
    const msg = { id: 'm1', content: 'hello', isStreaming: false };
    const result = ops.appendContent(' world').apply(msg);
    expect(result.content).toBe('hello world');
    expect(result.isStreaming).toBe(true);
    expect(result.id).toBe('m1');
  });

  test('UT-MO2: appendContent 处理空 content', () => {
    const msg = { id: 'm1', content: '', isStreaming: false };
    const result = ops.appendContent('hello').apply(msg);
    expect(result.content).toBe('hello');
  });

  test('UT-MO3: finishStream 标记 isStreaming=false + status=completed', () => {
    const msg = { id: 'm1', content: 'done', isStreaming: true, status: 'streaming' };
    const result = ops.finishStream().apply(msg);
    expect(result.isStreaming).toBe(false);
    expect(result.status).toBe('completed');
    expect(result.content).toBe('done');
  });

  test('UT-MO4: 操作 pipeline 可组合（先追加后完成）', () => {
    const msg = { id: 'm1', content: '', isStreaming: false };
    const pipeline = [ops.appendContent('hello'), ops.finishStream()];
    const result = pipeline.reduce((m, op) => op.apply(m), msg);
    expect(result.content).toBe('hello');
    expect(result.isStreaming).toBe(false);
    expect(result.status).toBe('completed');
  });

  // ─── applyToMessagesWith ───

  test('UT-MO5: applyToMessagesWith 加载 → 操作 → 保存', async () => {
    const mockMessages = [{ id: 'corr-1', content: 'partial' }];
    const mockPersistence = {
      loadThreadMessages: vi.fn().mockResolvedValue(mockMessages),
      saveThreadMessages: vi.fn().mockResolvedValue(undefined),
    };

    await applyToMessagesWith(
      mockPersistence, 'thread-1', 'corr-1',
      ops.appendContent(' more'), ops.finishStream(),
    );

    expect(mockPersistence.loadThreadMessages).toHaveBeenCalledWith('thread-1');
    expect(mockPersistence.saveThreadMessages).toHaveBeenCalledWith('thread-1', [
      { id: 'corr-1', content: 'partial more', isStreaming: false, status: 'completed' },
    ]);
  });

  test('UT-MO6: applyToMessagesWith 找不到消息不报错', async () => {
    const mockPersistence = {
      loadThreadMessages: vi.fn().mockResolvedValue([{ id: 'other' }]),
      saveThreadMessages: vi.fn(),
    };

    await expect(
      applyToMessagesWith(mockPersistence, 'thread-1', 'non-existent', ops.finishStream()),
    ).resolves.not.toThrow();
    expect(mockPersistence.saveThreadMessages).not.toHaveBeenCalled();
  });
});
