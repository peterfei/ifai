/**
 * db.ts — IndexedDB 数据库层测试
 *
 * 验证数据库创建、升级和 object store schema。
 *
 * @version 1.0.0
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openDB, DB_NAME, DB_VERSION, STORE_SESSIONS, STORE_EVENTS } from '../db';

describe('SessionPersistence DB Layer', () => {
  let db: IDBDatabase;

  beforeAll(async () => {
    // 清理旧的测试数据库
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // ignore if not exists
    });
    db = await openDB();
  });

  afterAll(() => {
    db.close();
  });

  it('DB-1: should open database with correct name and version', () => {
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
  });

  it('DB-2: should have thread_sessions object store', () => {
    expect(db.objectStoreNames.contains(STORE_SESSIONS)).toBe(true);
  });

  it('DB-3: should have session_events object store', () => {
    expect(db.objectStoreNames.contains(STORE_EVENTS)).toBe(true);
  });

  it('DB-4: thread_sessions should have updatedAt index', () => {
    const tx = db.transaction(STORE_SESSIONS, 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    expect(store.indexNames.contains('updatedAt')).toBe(true);
  });

  it('DB-5: session_events should have threadId index', () => {
    const tx = db.transaction(STORE_EVENTS, 'readonly');
    const store = tx.objectStore(STORE_EVENTS);
    expect(store.indexNames.contains('threadId')).toBe(true);
  });

  it('DB-6: session_events should have sequence index', () => {
    const tx = db.transaction(STORE_EVENTS, 'readonly');
    const store = tx.objectStore(STORE_EVENTS);
    expect(store.indexNames.contains('sequence')).toBe(true);
  });

  it('DB-7: should write and read a thread_sessions row', async () => {
    const row = {
      threadId: 'test-thread-1',
      snapshot: {
        messages: [{ id: 'm1', role: 'user', content: 'hello' }],
        isLoading: false,
        scrollPosition: 100,
        inputContent: '',
        lastPersistedAt: Date.now(),
        lastSequence: 0,
      },
      eventLogCount: 0,
      lastEventAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Write
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const req = tx.objectStore(STORE_SESSIONS).put(row);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Read
    const tx2 = db.transaction(STORE_SESSIONS, 'readonly');
    const readRow = await new Promise<any>((resolve, reject) => {
      const req = tx2.objectStore(STORE_SESSIONS).get('test-thread-1');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    expect(readRow).toBeDefined();
    expect(readRow.threadId).toBe('test-thread-1');
    expect(readRow.snapshot.messages).toHaveLength(1);
    expect(readRow.snapshot.messages[0].content).toBe('hello');
  });

  it('DB-8: should write and query session_events by threadId', async () => {
    const events = [
      { threadId: 'thread-a', sequence: 1, type: 'user:message', timestamp: Date.now(), data: { content: 'hi' } },
      { threadId: 'thread-a', sequence: 2, type: 'stream:start', timestamp: Date.now(), data: {} },
      { threadId: 'thread-b', sequence: 1, type: 'user:message', timestamp: Date.now(), data: { content: 'hello' } },
    ];

    const tx = db.transaction(STORE_EVENTS, 'readwrite');
    const store = tx.objectStore(STORE_EVENTS);
    for (const evt of events) {
      await new Promise<void>((resolve, reject) => {
        const req = store.add(evt);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    // Query by threadId index
    const tx2 = db.transaction(STORE_EVENTS, 'readonly');
    const index = tx2.objectStore(STORE_EVENTS).index('threadId');
    const threadAEvents = await new Promise<any[]>((resolve, reject) => {
      const req = index.getAll('thread-a');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    expect(threadAEvents).toHaveLength(2);
    expect(threadAEvents[0].sequence).toBe(1);
    expect(threadAEvents[1].sequence).toBe(2);
  });

  it('DB-9: should query events since a specific sequence', async () => {
    const tx = db.transaction(STORE_EVENTS, 'readonly');
    const index = tx.objectStore(STORE_EVENTS).index('sequence');
    const range = IDBKeyRange.lowerBound(['thread-a', 2], false); // sequence >= 2

    const events = await new Promise<any[]>((resolve, reject) => {
      const req = index.getAll(range);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].sequence).toBe(2);
  });
});
