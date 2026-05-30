/**
 * SessionSnapshot — 快照系统
 *
 * 管理 per-thread 会话快照的创建、加载和基于快照+增量事件的状态恢复。
 *
 * 参考 Spec: gui-chat 6.2 Session Snapshot
 *
 * @version 1.0.0
 * @proposal 011-per-thread-gui-session-persistence
 */

import { openDB, STORE_SESSIONS } from './db';
import type { ThreadSessionRow, SessionSnapshotData } from './db';
import { loadEventLog, pruneEventsBefore, countEvents } from './SessionEventLogger';
import type { SessionEventRow } from './db';

export { SessionSnapshotData };

// ─── 常量 ────────────────────────────────────────────────

const MAX_EVENTS_BEFORE_SNAPSHOT = 50;

// ─── 新建快照 ────────────────────────────────────────────

/**
 * 创建并保存线程的完整快照。
 * 快照后自动清理已包含的事件日志。
 */
export async function createSnapshot(
  threadId: string,
  data: Omit<SessionSnapshotData, 'lastPersistedAt'>,
): Promise<void> {
  const now = Date.now();
  const snapshot: ThreadSessionRow = {
    threadId,
    snapshot: {
      ...data,
      lastPersistedAt: now,
    },
    eventLogCount: 0,
    lastEventAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const db = await openDB();
  const tx = db.transaction(STORE_SESSIONS, 'readwrite');
  const store = tx.objectStore(STORE_SESSIONS);

  // Check if existing row exists to preserve createdAt
  const existing = await new Promise<ThreadSessionRow | undefined>((resolve, reject) => {
    const req = store.get(threadId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (existing) {
    snapshot.createdAt = existing.createdAt;
    snapshot.eventLogCount = existing.eventLogCount;
  }

  await new Promise<void>((resolve, reject) => {
    const req = store.put(snapshot);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();

  // 快照后清理旧事件：如果线程事件总数超过阈值，清理快照前的旧事件
  const totalCount = await countEvents(threadId);
  if (totalCount > MAX_EVENTS_BEFORE_SNAPSHOT) {
    await pruneEventsBefore(threadId, data.lastSequence);
  }
}

/**
 * 加载线程的最新快照。
 * 如果线程从未保存过快照，返回 null。
 */
export async function loadSnapshot(threadId: string): Promise<SessionSnapshotData | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_SESSIONS, 'readonly');
  const store = tx.objectStore(STORE_SESSIONS);

  const row = await new Promise<ThreadSessionRow | undefined>((resolve, reject) => {
    const req = store.get(threadId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  db.close();
  return row?.snapshot ?? null;
}

/**
 * 从快照 + 增量事件重建完整状态。
 *
 * 重放逻辑：事件按 sequence 顺序应用
 * - user:message → messages.push
 * - stream:finished → 标记消息完成
 * - etc.
 */
export function replayEvents(
  snapshot: SessionSnapshotData,
  events: SessionEventRow[],
): SessionSnapshotData {
  const result: SessionSnapshotData = {
    messages: [...snapshot.messages],
    isLoading: snapshot.isLoading,
    scrollPosition: snapshot.scrollPosition,
    inputContent: snapshot.inputContent,
    lastPersistedAt: snapshot.lastPersistedAt,
    lastSequence: snapshot.lastSequence,
  };

  // 按 sequence 排序
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

  for (const event of sorted) {
    result.lastSequence = Math.max(result.lastSequence, event.sequence);

    switch (event.type) {
      case 'user:message': {
        result.messages = [
          ...result.messages,
          {
            id: `user-${event.sequence}`,
            role: 'user',
            content: event.data.content || '',
            timestamp: event.timestamp,
          },
        ];
        break;
      }
      case 'assistant:created': {
        result.messages = [
          ...result.messages,
          {
            id: event.data.messageId || `assistant-${event.sequence}`,
            role: 'assistant',
            content: event.data.content || '',
            status: 'streaming',
            isStreaming: true,
            timestamp: event.timestamp,
          },
        ];
        break;
      }
      case 'stream:chunk': {
        // Append delta to the last assistant message
        for (let i = result.messages.length - 1; i >= 0; i--) {
          const msg = result.messages[i];
          if (msg.role === 'assistant' && msg.id === event.data.correlationId) {
            msg.content = (msg.content || '') + (event.data.delta || '');
            result.isLoading = true;
            break;
          }
        }
        break;
      }
      case 'stream:finished': {
        // Mark the correlationId message as completed
        for (const msg of result.messages) {
          if (msg.id === event.data.correlationId) {
            msg.isStreaming = false;
            msg.status = 'completed';
            break;
          }
        }
        result.isLoading = false;
        break;
      }
      case 'tool:call': {
        // Add tool call to the last assistant message
        for (let i = result.messages.length - 1; i >= 0; i--) {
          const msg = result.messages[i];
          if (msg.role === 'assistant') {
            if (!msg.toolCalls) msg.toolCalls = [];
            msg.toolCalls.push({
              id: event.data.toolId,
              name: event.data.name,
              arguments: event.data.arguments,
              status: 'pending',
            });
            break;
          }
        }
        break;
      }
      case 'tool:completed': {
        // Mark tool call as completed
        for (const msg of result.messages) {
          if (msg.toolCalls) {
            const tc = msg.toolCalls.find((t: any) => t.id === event.data.toolId);
            if (tc) {
              tc.status = 'completed';
              tc.result = event.data.result;
            }
          }
        }
        break;
      }
      case 'thread:switch': {
        // thread:switch events don't modify state
        break;
      }
      case 'session:snapshot': {
        // snapshot marker events don't modify state
        break;
      }
      case 'stream:start': {
        // stream:start doesn't modify message content
        result.isLoading = true;
        break;
      }
      default:
        break;
    }
  }

  return result;
}

/**
 * 加载线程的完整 session（快照 + 增量事件重建）。
 * 如果线程从未保存过快照，返回 null。
 */
export async function loadSession(threadId: string): Promise<SessionSnapshotData | null> {
  const snapshot = await loadSnapshot(threadId);
  if (!snapshot) return null;

  const sinceSeq = snapshot.lastSequence;
  const events = await loadEventLog(threadId, sinceSeq);

  if (events.length === 0) return snapshot;

  return replayEvents(snapshot, events);
}

/**
 * 删除线程的快照（线程删除时调用）
 */
export async function deleteSnapshot(threadId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_SESSIONS, 'readwrite');
  const store = tx.objectStore(STORE_SESSIONS);
  store.delete(threadId);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
}

/**
 * 列出所有有快照的线程摘要
 */
export async function listThreads(): Promise<Array<{
  threadId: string;
  updatedAt: number;
  messageCount: number;
}>> {
  const db = await openDB();
  const tx = db.transaction(STORE_SESSIONS, 'readonly');
  const index = tx.objectStore(STORE_SESSIONS).index('updatedAt');

  const rows = await new Promise<ThreadSessionRow[]>((resolve, reject) => {
    const req = index.getAll();
    req.onsuccess = () => resolve(req.result as ThreadSessionRow[]);
    req.onerror = () => reject(req.error);
  });

  db.close();

  return rows
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(row => ({
      threadId: row.threadId,
      updatedAt: row.updatedAt,
      messageCount: row.snapshot?.messages?.length || 0,
    }));
}

// ─── 内部工具 ────────────────────────────────────────────
// (empty — utility functions are imported from SessionEventLogger)
