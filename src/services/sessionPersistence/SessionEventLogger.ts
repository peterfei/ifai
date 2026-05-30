/**
 * SessionEventLogger — 事件日志系统
 *
 * 管理 per-thread 的 session 事件，提供单调递增序列生成、
 * 事件持久化和按序列过滤的事件加载。
 *
 * 参考 Spec: gui-chat 6.1 Session Event Log
 *
 * @version 1.0.0
 * @proposal 011-per-thread-gui-session-persistence
 */

import { openDB, STORE_EVENTS } from './db';
import type { SessionEventRow } from './db';

// ─── Types ────────────────────────────────────────────────

export type SessionEventType =
  | 'user:message'
  | 'assistant:created'
  | 'stream:start'
  | 'stream:chunk'
  | 'stream:finished'
  | 'tool:call'
  | 'tool:completed'
  | 'thread:switch'
  | 'session:snapshot';

export interface SessionEvent {
  type: SessionEventType;
  threadId: string;
  timestamp: number;
  sequence: number;
  data: Record<string, any>;
}

// ─── Sequence Generator ───────────────────────────────────

/** per-thread 单调递增序列计数器（内存中维护） */
const sequenceGenerators = new Map<string, number>();

function nextSequence(threadId: string): number {
  const current = sequenceGenerators.get(threadId) ?? 0;
  const next = current + 1;
  sequenceGenerators.set(threadId, next);
  return next;
}

/** 设置序列起始值（从数据库恢复时调用） */
export function initSequence(threadId: string, lastSequence: number): void {
  sequenceGenerators.set(threadId, lastSequence);
}

/** 获取线程当前序列值（用于测试/查询） */
export function getCurrentSequence(threadId: string): number {
  return sequenceGenerators.get(threadId) ?? 0;
}

// ─── Logger ──────────────────────────────────────────────

const persistQueue = new Map<string, SessionEventRow[]>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 1000;

/**
 * 追加事件到持久化队列（1s 防抖批量写入）
 */
export function persistEvent(threadId: string, event: SessionEvent): void {
  const row: SessionEventRow = {
    threadId,
    sequence: event.sequence,
    type: event.type,
    timestamp: event.timestamp,
    data: event.data,
  };

  if (!persistQueue.has(threadId)) {
    persistQueue.set(threadId, []);
  }
  persistQueue.get(threadId)!.push(row);

  if (persistTimer === null) {
    persistTimer = setTimeout(flushPersistQueue, FLUSH_INTERVAL_MS);
  }
}

async function flushPersistQueue(): Promise<void> {
  persistTimer = null;
  if (persistQueue.size === 0) return;

  const batch = new Map(persistQueue);
  persistQueue.clear();

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_EVENTS, 'readwrite');
    const store = tx.objectStore(STORE_EVENTS);

    for (const [, events] of batch) {
      for (const evt of events) {
        store.add(evt);
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch (e) {
    console.error('[SessionEventLogger] Failed to flush events:', e);
    // 写入失败不阻塞 — 事件日志是非关键的
  }
}

/**
 * 立即刷新持久化队列（线程切换前调用确保数据安全）
 */
export async function flushNow(): Promise<void> {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await flushPersistQueue();
}

/**
 * 创建并持久化一个事件（自动生成 sequence）
 */
export function createAndPersistEvent(
  threadId: string,
  type: SessionEventType,
  data: Record<string, any> = {},
): SessionEvent {
  const event: SessionEvent = {
    type,
    threadId,
    timestamp: Date.now(),
    sequence: nextSequence(threadId),
    data,
  };
  persistEvent(threadId, event);
  return event;
}

/**
 * 加载线程的事件日志。可指定 sinceSequence 过滤。
 */
export async function loadEventLog(
  threadId: string,
  sinceSequence?: number,
): Promise<SessionEventRow[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_EVENTS, 'readonly');
  const index = tx.objectStore(STORE_EVENTS).index('sequence');

  let events: SessionEventRow[];
  if (sinceSequence !== undefined) {
    const range = IDBKeyRange.lowerBound([threadId, sinceSequence], true); // > sinceSequence
    events = await new Promise((resolve, reject) => {
      const req = index.getAll(range);
      req.onsuccess = () => resolve(req.result as SessionEventRow[]);
      req.onerror = () => reject(req.error);
    });
  } else {
    const idx = tx.objectStore(STORE_EVENTS).index('threadId');
    events = await new Promise((resolve, reject) => {
      const req = idx.getAll(threadId);
      req.onsuccess = () => resolve(req.result as SessionEventRow[]);
      req.onerror = () => reject(req.error);
    });
  }

  db.close();
  return events;
}

/**
 * 删除线程的所有事件日志（线程删除时调用）
 */
export async function deleteEventsForThread(threadId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_EVENTS, 'readwrite');
  const index = tx.objectStore(STORE_EVENTS).index('threadId');

  const events = await new Promise<SessionEventRow[]>((resolve, reject) => {
    const req = index.getAll(threadId);
    req.onsuccess = () => resolve(req.result as SessionEventRow[]);
    req.onerror = () => reject(req.error);
  });

  const store = tx.objectStore(STORE_EVENTS);
  for (const evt of events) {
    if (evt.id !== undefined) {
      store.delete(evt.id);
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
  sequenceGenerators.delete(threadId);
}

/**
 * 删除指定线程中早于给定序列号的事件日志（快照后清理）
 */
export async function pruneEventsBefore(threadId: string, sequence: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_EVENTS, 'readwrite');
  const index = tx.objectStore(STORE_EVENTS).index('sequence');
  const range = IDBKeyRange.bound([threadId, 0], [threadId, sequence], false, false); // same threadId, sequence <= given

  const events = await new Promise<SessionEventRow[]>((resolve, reject) => {
    const req = index.getAll(range);
    req.onsuccess = () => resolve(req.result as SessionEventRow[]);
    req.onerror = () => reject(req.error);
  });

  const store = tx.objectStore(STORE_EVENTS);
  for (const evt of events) {
    if (evt.threadId === threadId && evt.id !== undefined) {
      store.delete(evt.id);
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

/**
 * 获取线程的事件总数
 */
export async function countEvents(threadId: string): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(STORE_EVENTS, 'readonly');
  const index = tx.objectStore(STORE_EVENTS).index('threadId');
  const count = await new Promise<number>((resolve, reject) => {
    const req = index.count(threadId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return count;
}

/**
 * 重置日志系统（测试用）
 */
export function resetLogger(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistQueue.clear();
  sequenceGenerators.clear();
}
