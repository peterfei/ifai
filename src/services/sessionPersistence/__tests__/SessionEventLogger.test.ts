/**
 * SessionEventLogger 测试
 *
 * 验证事件持久化、单调序列、按 sinceSequence 过滤。
 *
 * 参考 Spec: SP-1/2/3
 *
 * @version 1.0.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createAndPersistEvent,
  loadEventLog,
  deleteEventsForThread,
  pruneEventsBefore,
  countEvents,
  getCurrentSequence,
  resetLogger,
  initSequence,
  flushNow,
} from '../SessionEventLogger';
import { openDB, DB_NAME, STORE_EVENTS } from '../db';

describe('SessionEventLogger', () => {

  beforeEach(() => {
    resetLogger();
  });

  afterEach(async () => {
    // 清理测试数据
    const db = await openDB();
    const tx = db.transaction(STORE_EVENTS, 'readwrite');
    const store = tx.objectStore(STORE_EVENTS);
    const all = await new Promise<any[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    for (const row of all) {
      if (row.id !== undefined) store.delete(row.id);
    }
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    db.close();
    resetLogger();
  });

  // ─── SP-1: 事件持久化 ───

  it('SP-1: should persist and load events for a thread', async () => {
    createAndPersistEvent('thread-a', 'user:message', { content: 'hello' });
    createAndPersistEvent('thread-a', 'stream:start', { correlationId: 'c1' });
    await flushNow();

    const events = await loadEventLog('thread-a');
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('user:message');
    expect(events[0].data.content).toBe('hello');
    expect(events[1].type).toBe('stream:start');
  });

  // ─── SP-2: 单调序列 ───

  it('SP-2: should generate monotonic increasing sequences per thread', () => {
    const e1 = createAndPersistEvent('thread-a', 'user:message', {});
    const e2 = createAndPersistEvent('thread-a', 'stream:start', {});
    const e3 = createAndPersistEvent('thread-b', 'user:message', {});

    expect(e1.sequence).toBe(1);
    expect(e2.sequence).toBe(2);
    expect(e3.sequence).toBe(1); // thread-b 从 1 开始

    expect(getCurrentSequence('thread-a')).toBe(2);
    expect(getCurrentSequence('thread-b')).toBe(1);
  });

  it('SP-2b: initSequence sets starting sequence', () => {
    initSequence('thread-a', 10);
    const e1 = createAndPersistEvent('thread-a', 'user:message', {});
    expect(e1.sequence).toBe(11);
  });

  // ─── SP-3: 按 sinceSequence 过滤 ───

  it('SP-3: should filter events since a given sequence', async () => {
    createAndPersistEvent('thread-a', 'user:message', { seq: 1 });
    createAndPersistEvent('thread-a', 'tool:call', { seq: 2 });
    createAndPersistEvent('thread-a', 'stream:finished', { seq: 3 });
    await flushNow();

    // 从 sequence 2 之后（即 sequence > 2 → 只返回 seq 3）
    const events = await loadEventLog('thread-a', 2);
    expect(events).toHaveLength(1);
    expect(events[0].data.seq).toBe(3);
  });

  // ─── SP-3b: 查询全部（sinceSequence 为空） ───

  it('SP-3b: loadEventLog without sinceSequence returns all events', async () => {
    createAndPersistEvent('thread-a', 'user:message', {});
    createAndPersistEvent('thread-a', 'stream:finished', {});
    await flushNow();

    const events = await loadEventLog('thread-a');
    expect(events).toHaveLength(2);
  });

  // ─── 线程隔离 ───

  it('should isolate events between threads', async () => {
    createAndPersistEvent('thread-a', 'user:message', {});
    createAndPersistEvent('thread-a', 'stream:start', {});
    createAndPersistEvent('thread-b', 'user:message', {});
    createAndPersistEvent('thread-b', 'stream:finished', {});
    await flushNow();

    const aEvents = await loadEventLog('thread-a');
    const bEvents = await loadEventLog('thread-b');

    expect(aEvents).toHaveLength(2);
    expect(bEvents).toHaveLength(2);
    expect(aEvents[0].type).toBe('user:message');
    expect(bEvents[1].type).toBe('stream:finished');
  });

  // ─── SP-7: 删除线程事件 ───

  it('SP-7: deleteEventsForThread removes all events for a thread', async () => {
    createAndPersistEvent('thread-a', 'user:message', {});
    createAndPersistEvent('thread-a', 'stream:finished', {});
    createAndPersistEvent('thread-b', 'user:message', {});
    await flushNow();

    await deleteEventsForThread('thread-a');

    const aEvents = await loadEventLog('thread-a');
    const bEvents = await loadEventLog('thread-b');
    expect(aEvents).toHaveLength(0);
    expect(bEvents).toHaveLength(1);
  });

  // ─── SP-9: 快照后 prune 事件日志 ───

  it('SP-9: pruneEventsBefore removes events up to given sequence', async () => {
    createAndPersistEvent('thread-a', 'user:message', { seq: 1 });
    createAndPersistEvent('thread-a', 'tool:call', { seq: 2 });
    createAndPersistEvent('thread-a', 'stream:finished', { seq: 3 });
    await flushNow();

    await pruneEventsBefore('thread-a', 2); // 删除 sequence <= 2 的

    const remaining = await loadEventLog('thread-a');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].data.seq).toBe(3);
  });

  // ─── countEvents ───

  it('countEvents returns correct count', async () => {
    createAndPersistEvent('thread-a', 'user:message', {});
    createAndPersistEvent('thread-a', 'stream:start', {});
    await flushNow();

    const count = await countEvents('thread-a');
    expect(count).toBe(2);
  });
});
