/**
 * WriteBehindBuffer 单元测试
 *
 * 元编程验证：声明式配置替代过程式 timer/map/threshold 管理。
 * 9 个测试覆盖：merge/groupBy/autoFlush/batchSize/flushKey/destroy/clear/容错
 */
import { describe, test, expect, vi, afterEach } from 'vitest';
import { WriteBehindBuffer } from '../WriteBehindBuffer';

describe('WriteBehindBuffer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── 核心功能 ───

  test('UT-WB1: add 合并相同 key 的值', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const buffer = new WriteBehindBuffer<string, string>({
      groupBy: () => 'g1',
      merge: (a, b) => a + b,
      onFlush,
      flushInterval: 10000, // disable auto-flush for test
    });
    buffer.add('k1', 'hello ');
    buffer.add('k1', 'world');
    buffer.add('k1', '!');
    await buffer.flush();
    expect(onFlush).toHaveBeenCalledWith('g1', expect.any(Map));
    const flushed = onFlush.mock.calls[0][1] as Map<string, string>;
    expect(flushed.get('k1')).toBe('hello world!');
  });

  test('UT-WB2: 不同 key 独立合并', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const buffer = new WriteBehindBuffer({
      groupBy: () => 'g1',
      merge: (a, b) => a + b,
      onFlush,
      flushInterval: 10000,
    });
    buffer.add('k1', 'A');
    buffer.add('k2', '1');
    buffer.add('k1', 'B');
    buffer.add('k2', '2');
    await buffer.flush();
    const flushed = onFlush.mock.calls[0][1] as Map<string, string>;
    expect(flushed.get('k1')).toBe('AB');
    expect(flushed.get('k2')).toBe('12');
  });

  test('UT-WB3: groupBy 实现按组分散写入', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const buffer = new WriteBehindBuffer({
      groupBy: (k) => (k as string).startsWith('t1') ? 'thread1' : 'thread2',
      merge: (a, b) => a + b,
      onFlush,
      flushInterval: 10000,
    });
    buffer.add('t1-msg1', 'hello ');
    buffer.add('t2-msg1', 'world ');
    buffer.add('t1-msg1', 'there');
    await buffer.flush();
    const calls = onFlush.mock.calls as Array<[string, Map<string, string>]>;
    const thread1Call = calls.find(([g]) => g === 'thread1');
    const thread2Call = calls.find(([g]) => g === 'thread2');
    expect(thread1Call).toBeDefined();
    expect(thread1Call![1].get('t1-msg1')).toBe('hello there');
    expect(thread2Call![1].get('t2-msg1')).toBe('world ');
  });

  // ─── 自动刷新 ───

  test('UT-WB4: add 后自动调度 flush（flushInterval 内触发）', async () => {
    vi.useFakeTimers();
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const buffer = new WriteBehindBuffer({
      groupBy: () => 'g1',
      merge: (a, b) => a + b,
      onFlush,
      flushInterval: 500,
    });
    buffer.add('k1', 'data');
    expect(onFlush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    // flush 是异步的，需要等待微任务
    await vi.waitFor(() => {
      expect(onFlush).toHaveBeenCalledTimes(1);
    });
    vi.useRealTimers();
    buffer.destroy();
  });

  test('UT-WB5: maxBatchSize 超阈值时立即刷新', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const buffer = new WriteBehindBuffer({
      groupBy: () => 'g1',
      merge: (a, b) => a + b,
      onFlush,
      flushInterval: 10000,
      maxBatchSize: 3,
    });
    buffer.add('k1', 'a');
    buffer.add('k2', 'b');
    expect(onFlush).not.toHaveBeenCalled();
    buffer.add('k3', 'c'); // 第 3 个 → 立即 flush
    expect(onFlush).toHaveBeenCalledTimes(1);
    buffer.add('k4', 'd');
    await buffer.flush();
    expect(onFlush).toHaveBeenCalledTimes(2);
  });

  // ─── flushKey ───

  test('UT-WB6: flushKey 只冲刷单个 key', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const buffer = new WriteBehindBuffer({
      groupBy: () => 'g1',
      merge: (a, b) => a + b,
      onFlush,
      flushInterval: 10000,
    });
    buffer.add('k1', 'data1');
    buffer.add('k2', 'data2');
    await buffer.flushKey('k1');
    expect(onFlush).toHaveBeenCalledTimes(1);
    const flushed = onFlush.mock.calls[0][1] as Map<string, string>;
    expect(flushed.has('k1')).toBe(true);
    expect(flushed.has('k2')).toBe(false); // k2 仍在 buffer
    await buffer.flush();
    expect(onFlush).toHaveBeenCalledTimes(2);
    const flushed2 = onFlush.mock.calls[1][1] as Map<string, string>;
    expect(flushed2.has('k2')).toBe(true);
  });

  // ─── 生命周期 ───

  test('UT-WB7: destroy 后 add 被静默忽略', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const buffer = new WriteBehindBuffer({
      groupBy: () => 'g1',
      merge: (a, b) => a + b,
      onFlush,
      flushInterval: 10000,
    });
    buffer.destroy();
    buffer.add('k1', 'data');
    await buffer.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });

  test('UT-WB8: flush 异常时不会抛出', async () => {
    const onFlush = vi.fn().mockRejectedValue(new Error('DB write failed'));
    const buffer = new WriteBehindBuffer({
      groupBy: () => 'g1',
      merge: (a, b) => a + b,
      onFlush,
      flushInterval: 10000,
    });
    buffer.add('k1', 'data');
    await expect(buffer.flush()).resolves.not.toThrow();
  });

  test('UT-WB9: clear 清空 buffer 不触发 flush', async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const buffer = new WriteBehindBuffer({
      groupBy: () => 'g1',
      merge: (a, b) => a + b,
      onFlush,
      flushInterval: 10000,
    });
    buffer.add('k1', 'data');
    buffer.clear();
    await buffer.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });
});
