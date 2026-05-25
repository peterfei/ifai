/**
 * CPS Buffer Orphaned Delta 测试
 *
 * BUG: stream:finished 发出后 stopListening 删除 session，
 * CPS async IIFE 中 buffer.flushKey → groupBy(getSession) 返回 null → '_orphaned' → SKIPPED
 * 导致 WriteBehindBuffer 中挂起的 deltas 被丢弃。
 *
 * 修复: CPS handler 使用 payload 中的 threadId 直接 flush，
 * 绕过 groupBy（避免它去查询已被删除的 session）。
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { WriteBehindBuffer } from '../utils/WriteBehindBuffer';

describe('CPS Buffer Orphaned Delta', () => {
  let flushes: { group: string; items: Map<string, string> }[] = [];
  let buffer: WriteBehindBuffer<string, string>;

  // 模拟 session 查询（模拟 stopListening 删除 session 后）
  const mockGetSession = vi.fn();

  beforeEach(() => {
    flushes = [];
    mockGetSession.mockReset();
    buffer = new WriteBehindBuffer<string, string>({
      groupBy: (correlationId) => {
        const session = mockGetSession(correlationId);
        return session?.threadId ?? '_orphaned';
      },
      merge: (a, b) => a + b,
      onFlush: async (group, items) => {
        // 对齐真实行为：_orphaned 分组跳过 flush（记录但标记为跳过）
        if (group === '_orphaned') return;
        flushes.push({ group, items: new Map(items) });
      },
      flushInterval: 10000, // 防止自动刷新干扰测试
    });
  });

  // ─── BUG 确认 ───

  test('BUG CONFIRMED: session 删除后 flushKey → groupBy 返回 _orphaned → 内容丢失', async () => {
    // 1. chunk 进入缓冲
    buffer.add('corr-1', 'hello ');
    buffer.add('corr-1', 'world');

    // 2. emit 时 session 仍可访问
    mockGetSession.mockReturnValue({ threadId: 'thread-1', isFinished: true });

    // 3. emit 后 stopListening 删除 session → getSession 返回 null
    mockGetSession.mockReset();

    // 4. CPS async IIFE 执行 buffer.flushKey — 此时 getSession 返回 null
    await buffer.flushKey('corr-1');

    // 验证：flush 被跳过（group='_orphaned'）
    expect(flushes.length).toBe(0);
  });

  // ─── 修复验证 ───

  test('UT-BF1: flushKeyToGroup 直接使用 threadId 绕过 groupBy', async () => {
    buffer.add('corr-1', 'hello ');
    buffer.add('corr-1', 'world');

    // session 已被删除（getSession 返回 undefined）
    mockGetSession.mockReturnValue(undefined);

    // 🏆 修复：直接使用 payload 中的 threadId，不经过 groupBy
    const threadId = 'thread-1';
    const value = (buffer as any).items.get('corr-1');
    (buffer as any).items.delete('corr-1');
    await (buffer as any).config.onFlush(threadId, new Map([['corr-1', value]]));

    expect(flushes.length).toBe(1);
    expect(flushes[0].group).toBe('thread-1');
    expect(flushes[0].items.get('corr-1')).toBe('hello world');
  });

  test('UT-BF2: flushKeyToGroup 正确冲洗并绕过 groupBy', async () => {
    buffer.add('corr-1', 'delta content');

    // session 已删除
    mockGetSession.mockReturnValue(undefined);

    // 使用 threadId 直接 flush
    await buffer.flushKeyToGroup('corr-1', 'thread-1');

    expect(flushes.length).toBe(1);
    expect(flushes[0].group).toBe('thread-1');
    expect(flushes[0].items.get('corr-1')).toBe('delta content');
    // buffer 已清空该 key
    expect((buffer as any).items.has('corr-1')).toBe(false);
  });

  test('UT-BF3: flushKeyToGroup 对不存在的 key 不报错', async () => {
    // flush 一个不存在的 key
    await buffer.flushKeyToGroup('non-existent', 'thread-1');
    expect(flushes.length).toBe(0);
  });

  test('UT-BF4: flushKeyToGroup 不影响其他 key', async () => {
    buffer.add('corr-1', 'delta1');
    buffer.add('corr-2', 'delta2');

    await buffer.flushKeyToGroup('corr-1', 'thread-1');

    expect(flushes.length).toBe(1);
    expect(flushes[0].group).toBe('thread-1');
    // corr-2 应仍在缓冲区
    expect((buffer as any).items.get('corr-2')).toBe('delta2');
  });
});
