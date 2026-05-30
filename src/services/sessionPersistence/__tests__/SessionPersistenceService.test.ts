/**
 * SessionPersistenceService 测试
 *
 * 验证统一编排层的委托正确性、序列初始化和配额监控。
 *
 * 参考 Spec: gui-chat 6.2 Session Snapshot, 6.1 Session Event Log
 *
 * @version 1.0.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SessionPersistenceService,
  getSessionPersistenceService,
} from '../SessionPersistenceService';
import {
  createAndPersistEvent,
  flushNow,
  resetLogger,
  getCurrentSequence,
} from '../SessionEventLogger';
import { createSnapshot } from '../SessionSnapshot';
import { openDB, DB_NAME, STORE_SESSIONS, STORE_EVENTS } from '../db';

describe('SessionPersistenceService', () => {
  let service: SessionPersistenceService;

  beforeEach(() => {
    resetLogger();
    service = new SessionPersistenceService();
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

  // ─── SP-10: initialize ───

  it('SP-10: initialize loads threads and init sequences', async () => {
    // Create a snapshot with events
    createAndPersistEvent('thread-a', 'user:message', { content: 'hi' });
    await flushNow();
    await createSnapshot('thread-a', {
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      isLoading: false,
      scrollPosition: 0,
      inputContent: '',
      lastSequence: 1,
    });

    // Reset sequence to verify initSequence is called
    resetLogger();

    await service.initialize();

    // Sequence should be restored from snapshot
    expect(getCurrentSequence('thread-a')).toBe(1);

    // New events should continue from seq 2
    const evt = createAndPersistEvent('thread-a', 'user:message', { content: 'hello' });
    expect(evt.sequence).toBe(2);
  });

  it('SP-10b: initialize is idempotent', async () => {
    await service.initialize();
    await service.initialize(); // should not throw
    expect(true).toBe(true);
  });

  // ─── SP-11: persistEvent ───

  it('SP-11: persistEvent delegates to event logger', async () => {
    service.persistEvent('thread-a', 'user:message', { content: 'hi' });
    await service.flush();

    const events = await service.loadEventLog('thread-a');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('user:message');
    expect(events[0].data.content).toBe('hi');
  });

  // ─── SP-12: flush ───

  it('SP-12: flush persists pending events immediately', async () => {
    service.persistEvent('thread-a', 'user:message', { content: 'test' });
    await service.flush();

    const events = await service.loadEventLog('thread-a');
    expect(events).toHaveLength(1);
  });

  // ─── SP-13: createSnapshot / loadSession ───

  it('SP-13: createSnapshot and loadSession round-trip', async () => {
    await service.createSnapshot('thread-a', {
      messages: [{ id: 'm1', role: 'user', content: 'hello' }],
      isLoading: false,
      scrollPosition: 42,
      inputContent: 'typing...',
      lastSequence: 5,
    });

    const loaded = await service.loadSession('thread-a');
    expect(loaded).not.toBeNull();
    expect(loaded!.messages).toHaveLength(1);
    expect(loaded!.messages[0].content).toBe('hello');
    expect(loaded!.scrollPosition).toBe(42);
    expect(loaded!.inputContent).toBe('typing...');
    expect(loaded!.lastSequence).toBe(5);
  });

  it('SP-13b: loadSession returns null for unknown thread', async () => {
    const loaded = await service.loadSession('never-existed');
    expect(loaded).toBeNull();
  });

  // ─── SP-14: loadSession with events replay ───

  it('SP-14: loadSession restores sequence and replays events', async () => {
    // Create snapshot at seq 2
    await service.createSnapshot('thread-a', {
      messages: [
        { id: 'm1', role: 'user', content: 'hello' },
        { id: 'a1', role: 'assistant', content: '', isStreaming: true, timestamp: 100 },
      ],
      isLoading: true,
      scrollPosition: 0,
      inputContent: '',
      lastSequence: 2,
    });

    // Simulate app restart: reset logger, then initialize restores sequences
    resetLogger();
    await service.initialize();

    // Events after restart (sequences continue from snapshot's lastSequence)
    service.persistEvent('thread-a', 'stream:chunk', { correlationId: 'a1', delta: 'World' });
    service.persistEvent('thread-a', 'stream:finished', { correlationId: 'a1' });
    await service.flush();

    // Load should init sequence and replay events
    const loaded = await service.loadSession('thread-a');
    expect(loaded).not.toBeNull();
    expect(loaded!.messages).toHaveLength(2);
    const assistantMsg = loaded!.messages.find(m => m.id === 'a1');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toContain('World');
    expect(assistantMsg!.isStreaming).toBe(false);
    expect(loaded!.isLoading).toBe(false);
    expect(loaded!.lastSequence).toBeGreaterThan(2);
  });

  // ─── SP-15: listThreads ───

  it('SP-15: listThreads returns thread summaries', async () => {
    await service.createSnapshot('thread-a', {
      messages: [{ id: 'm1', role: 'user', content: 'A' }],
      isLoading: false,
      scrollPosition: 0,
      inputContent: '',
      lastSequence: 1,
    });

    const threads = await service.listThreads();
    expect(threads.length).toBeGreaterThanOrEqual(1);
    expect(threads[0].threadId).toBe('thread-a');
    expect(threads[0].messageCount).toBe(1);
  });

  // ─── SP-16: deleteThreadSession ───

  it('SP-16: deleteThreadSession removes snapshot and events', async () => {
    // Create snapshot
    await service.createSnapshot('thread-a', {
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      isLoading: false,
      scrollPosition: 0,
      inputContent: '',
      lastSequence: 1,
    });

    // Create events
    service.persistEvent('thread-a', 'user:message', { content: 'hello' });
    await service.flush();

    // Verify both exist
    expect(await service.loadSession('thread-a')).not.toBeNull();
    const eventsBefore = await service.loadEventLog('thread-a');
    expect(eventsBefore.length).toBeGreaterThan(0);

    // Delete
    await service.deleteThreadSession('thread-a');

    // Verify both are gone
    expect(await service.loadSession('thread-a')).toBeNull();
    const eventsAfter = await service.loadEventLog('thread-a');
    expect(eventsAfter).toHaveLength(0);
  });

  // ─── SP-17: shouldCreateSnapshot ───

  it('SP-17: shouldCreateSnapshot returns true over threshold', async () => {
    // Create 55 events
    for (let i = 1; i <= 55; i++) {
      service.persistEvent('thread-a', 'user:message', { seq: i });
    }
    await service.flush();

    const shouldCreate = await service.shouldCreateSnapshot('thread-a');
    expect(shouldCreate).toBe(true);
  });

  it('SP-17b: shouldCreateSnapshot returns false under threshold', async () => {
    service.persistEvent('thread-a', 'user:message', {});
    await service.flush();

    const shouldCreate = await service.shouldCreateSnapshot('thread-a');
    expect(shouldCreate).toBe(false);
  });

  // ─── SP-18: checkStorageQuota ───

  it('SP-18: checkStorageQuota returns storage estimate or null', async () => {
    const report = await service.checkStorageQuota();
    // In test environment, navigator.storage may not be available
    if (report === null) {
      expect(report).toBeNull();
    } else {
      expect(report).toHaveProperty('used');
      expect(report).toHaveProperty('quota');
      expect(report).toHaveProperty('usagePercent');
    }
  });

  // ─── SP-19: getSessionPersistenceService singleton ───

  it('SP-19: getSessionPersistenceService returns singleton', () => {
    const instance1 = getSessionPersistenceService();
    const instance2 = getSessionPersistenceService();
    expect(instance1).toBe(instance2);
  });
});
