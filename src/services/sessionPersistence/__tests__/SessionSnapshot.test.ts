/**
 * SessionSnapshot 测试
 *
 * 验证快照创建、加载、事件重放。
 *
 * 参考 Spec: SP-4/5/6/8/9
 *
 * @version 1.0.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSnapshot,
  loadSnapshot,
  loadSession,
  deleteSnapshot,
  listThreads,
  replayEvents,
} from '../SessionSnapshot';
import {
  createAndPersistEvent,
  flushNow,
  resetLogger,
  initSequence,
  deleteEventsForThread,
} from '../SessionEventLogger';
import { openDB, DB_NAME, STORE_SESSIONS, STORE_EVENTS } from '../db';

describe('SessionSnapshot', () => {

  beforeEach(() => {
    resetLogger();
  });

  afterEach(async () => {
    // 清理所有测试数据
    const db = await openDB();
    for (const storeName of [STORE_SESSIONS, STORE_EVENTS]) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const all = await new Promise<any[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const row of all) {
        const key = storeName === STORE_SESSIONS ? row.threadId : row.id;
        if (key !== undefined) store.delete(key);
      }
      await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    }
    db.close();
    resetLogger();
  });

  // ─── SP-4: 快照创建 ───

  it('SP-4: createSnapshot saves and loadSnapshot retrieves', async () => {
    await createSnapshot('thread-a', {
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      isLoading: false,
      scrollPosition: 42,
      inputContent: 'typing...',
      lastSequence: 5,
    });

    const loaded = await loadSnapshot('thread-a');
    expect(loaded).not.toBeNull();
    expect(loaded!.messages).toHaveLength(1);
    expect(loaded!.messages[0].content).toBe('hi');
    expect(loaded!.scrollPosition).toBe(42);
    expect(loaded!.inputContent).toBe('typing...');
    expect(loaded!.lastSequence).toBe(5);
    expect(loaded!.lastPersistedAt).toBeGreaterThan(0);
  });

  // ─── SP-5: 快照 + 事件重放恢复 ───

  it('SP-5: loadSession restores full state with snapshot + events', async () => {
    // 创建快照（序列号 5）
    await createSnapshot('thread-a', {
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      isLoading: false,
      scrollPosition: 0,
      inputContent: '',
      lastSequence: 5,
    });

    // 添加增量事件 > 序列 5
    createAndPersistEvent('thread-a', 'stream:start', { correlationId: 'c1' });
    createAndPersistEvent('thread-a', 'stream:chunk', { correlationId: 'c1', delta: 'Hello' });
    createAndPersistEvent('thread-a', 'stream:finished', { correlationId: 'c1' });
    await flushNow();

    // 加载完整 session
    const loaded = await loadSession('thread-a');
    expect(loaded).not.toBeNull();
    // 应包含快照中的消息 + 事件重放的效果
    expect(loaded!.messages).toHaveLength(1);
    // stream:chunk 追加到最近的 assistant 消息（这里 snapshot 只有 user message，所以不会有追加）
    // 但 stream:finished 的 isLoading = false 应被重放
    expect(loaded!.isLoading).toBe(false);
  });

  it('SP-5b: loadSession with assistant message and chunks replays content', async () => {
    await createSnapshot('thread-a', {
      messages: [
        { id: 'm1', role: 'user', content: 'hello' },
        { id: 'c1', role: 'assistant', content: '', isStreaming: true, timestamp: 100 },
      ],
      isLoading: true,
      scrollPosition: 0,
      inputContent: '',
      lastSequence: 2,
    });

    // Init sequence to continue from snapshot's lastSequence
    initSequence('thread-a', 2);
    createAndPersistEvent('thread-a', 'stream:chunk', { correlationId: 'c1', delta: 'World' });
    createAndPersistEvent('thread-a', 'stream:finished', { correlationId: 'c1' });
    await flushNow();

    const loaded = await loadSession('thread-a');
    expect(loaded).not.toBeNull();
    expect(loaded!.messages).toHaveLength(2);
    // The chunk "World" should be appended to the assistant message with id 'c1'
    const assistantMsg = loaded!.messages.find(m => m.id === 'c1');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toContain('World');
    expect(assistantMsg!.isStreaming).toBe(false);
    expect(loaded!.isLoading).toBe(false);
  });

  // ─── SP-6: 未知线程返回 null ───

  it('SP-6: loadSnapshot returns null for unknown thread', async () => {
    const loaded = await loadSnapshot('never-existed');
    expect(loaded).toBeNull();
  });

  // ─── SP-8: listThreads ───

  it('SP-8: listThreads returns all threads sorted by updatedAt', async () => {
    await createSnapshot('thread-b', {
      messages: [{ id: 'm1', role: 'user', content: 'B msg' }],
      isLoading: false,
      scrollPosition: 0,
      inputContent: '',
      lastSequence: 1,
    });

    // 延迟确保不同时间戳
    await new Promise(r => setTimeout(r, 10));

    await createSnapshot('thread-a', {
      messages: [{ id: 'm1', role: 'user', content: 'A msg' }],
      isLoading: false,
      scrollPosition: 10,
      inputContent: '',
      lastSequence: 1,
    });

    const threads = await listThreads();
    expect(threads.length).toBeGreaterThanOrEqual(2);
    // thread-a 应该排在前面（最近更新）
    expect(threads[0].threadId).toBe('thread-a');
    expect(threads[0].messageCount).toBe(1);
  });

  it('SP-8b: listThreads returns empty for no threads', async () => {
    const threads = await listThreads();
    expect(threads).toEqual([]);
  });

  // ─── SP-7: 删除线程 ───

  it('SP-7: deleteSnapshot removes thread snapshot', async () => {
    await createSnapshot('thread-a', {
      messages: [],
      isLoading: false,
      scrollPosition: 0,
      inputContent: '',
      lastSequence: 0,
    });

    expect(await loadSnapshot('thread-a')).not.toBeNull();
    await deleteSnapshot('thread-a');
    expect(await loadSnapshot('thread-a')).toBeNull();
  });

  // ─── replayEvents 单元测试 ───

  it('replayEvents applies all event types correctly', () => {
    const snapshot = {
      messages: [],
      isLoading: false,
      scrollPosition: 0,
      inputContent: '',
      lastPersistedAt: 100,
      lastSequence: 0,
    };

    const events = [
      { id: 1, threadId: 't', sequence: 1, type: 'user:message', timestamp: 200, data: { content: 'Hello' } },
      { id: 2, threadId: 't', sequence: 2, type: 'assistant:created', timestamp: 300, data: { messageId: 'a1', content: '' } },
      { id: 3, threadId: 't', sequence: 3, type: 'stream:chunk', timestamp: 400, data: { correlationId: 'a1', delta: 'Hi ' } },
      { id: 4, threadId: 't', sequence: 4, type: 'stream:chunk', timestamp: 500, data: { correlationId: 'a1', delta: 'there' } },
      { id: 5, threadId: 't', sequence: 5, type: 'stream:finished', timestamp: 600, data: { correlationId: 'a1' } },
    ];

    const result = replayEvents(snapshot, events as any);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toBe('Hello');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[1].content).toBe('Hi there');
    expect(result.messages[1].isStreaming).toBe(false);
    expect(result.messages[1].status).toBe('completed');
    expect(result.isLoading).toBe(false);
    expect(result.lastSequence).toBe(5);
  });

  it('replayEvents handles tool calls', () => {
    const snapshot = {
      messages: [{ id: 'a1', role: 'assistant', content: 'Let me check' }],
      isLoading: true,
      scrollPosition: 0,
      inputContent: '',
      lastPersistedAt: 100,
      lastSequence: 0,
    };

    const events = [
      { id: 1, threadId: 't', sequence: 1, type: 'tool:call', timestamp: 200, data: { toolId: 't1', name: 'bash', arguments: '{}' } },
      { id: 2, threadId: 't', sequence: 2, type: 'tool:completed', timestamp: 300, data: { toolId: 't1', result: 'done' } },
    ];

    const result = replayEvents(snapshot, events as any);

    expect(result.messages[0].toolCalls).toHaveLength(1);
    expect(result.messages[0].toolCalls[0].id).toBe('t1');
    expect(result.messages[0].toolCalls[0].status).toBe('completed');
    expect(result.messages[0].toolCalls[0].result).toBe('done');
  });

  // ─── 快照后事件清理（SP-9） ───

  it('SP-9: should prune events after snapshot if over threshold', async () => {
    // Create many events
    for (let i = 1; i <= 55; i++) {
      createAndPersistEvent('thread-a', 'user:message', { seq: i });
    }
    await flushNow();

    // Create snapshot at sequence 55
    await createSnapshot('thread-a', {
      messages: [{ id: 'm1', role: 'user', content: 'last' }],
      isLoading: false,
      scrollPosition: 0,
      inputContent: '',
      lastSequence: 55,
    });

    // Events before seq 55 should be pruned (> 50 events threshold)
    const { loadEventLog } = await import('../SessionEventLogger');
    const { countEvents } = await import('../SessionEventLogger');

    // After pruning, the events before lastSequence should be gone
    // But there might be some events at exactly lastSequence that remain
    const remaining = await loadEventLog('thread-a');
    expect(remaining.length).toBeLessThanOrEqual(1); // 0 or 1 (the one at seq=55 might remain)
  });
});
