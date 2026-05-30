/**
 * Session Persistence — IndexedDB 数据库层
 *
 * 提供 `ifai-sessions` 数据库的打开、升级和对象存储管理。
 * Schema:
 *   - thread_sessions (keyPath: threadId) — 快照存储
 *   - session_events  (keyPath: id, autoIncrement) — 事件日志
 *
 * @version 1.0.0
 * @proposal 011-per-thread-gui-session-persistence
 */

export const DB_NAME = 'ifai-sessions';
export const DB_VERSION = 1;

export const STORE_SESSIONS = 'thread_sessions';
export const STORE_EVENTS = 'session_events';

export interface DBSchema {
  [STORE_SESSIONS]: {
    key: string;
    value: ThreadSessionRow;
    indexes: { 'updatedAt': number };
  };
  [STORE_EVENTS]: {
    key: number;
    value: SessionEventRow;
    indexes: { 'threadId': string; 'sequence': [string, number] };
  };
}

export interface ThreadSessionRow {
  threadId: string;
  snapshot: SessionSnapshotData;
  eventLogCount: number;
  lastEventAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionSnapshotData {
  messages: any[];
  isLoading: boolean;
  scrollPosition: number;
  inputContent: string;
  lastPersistedAt: number;
  lastSequence: number;
}

export interface SessionEventRow {
  id?: number;
  threadId: string;
  sequence: number;
  type: string;
  timestamp: number;
  data: Record<string, any>;
}

/**
 * 打开/升级 IndexedDB 数据库。
 * 若数据库不存在则创建，若版本变化则升级 schema。
 */
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // ObjectStore 1: thread_sessions
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'threadId' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // ObjectStore 2: session_events
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        const store = db.createObjectStore(STORE_EVENTS, { keyPath: 'id', autoIncrement: true });
        store.createIndex('threadId', 'threadId', { unique: false });
        store.createIndex('sequence', ['threadId', 'sequence'], { unique: true });
      }
    };

    request.onsuccess = (event: Event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event: Event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * 获取 object store 的引用（读写事务）
 */
export function getStore(db: IDBDatabase, storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}
