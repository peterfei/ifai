/**
 * SessionPersistenceService — 会话持久化统一编排层
 *
 * 整合 SessionEventLogger + SessionSnapshot 为统一 API，
 * 处理序列初始化、会话恢复和生命周期管理。
 *
 * 参考 Spec: gui-chat 6.2 Session Snapshot, 6.1 Session Event Log
 *
 * @version 1.0.0
 * @proposal 011-per-thread-gui-session-persistence
 */

import type { SessionSnapshotData } from './db';
import {
  createAndPersistEvent,
  loadEventLog,
  deleteEventsForThread,
  initSequence,
  flushNow,
} from './SessionEventLogger';
import type { SessionEventType } from './SessionEventLogger';
import {
  createSnapshot,
  loadSnapshot,
  loadSession,
  deleteSnapshot,
  listThreads,
} from './SessionSnapshot';

export type { SessionSnapshotData };

// ─── 常量 ────────────────────────────────────────────────

const MAX_EVENTS_BEFORE_SNAPSHOT = 50;

// ─── Service ──────────────────────────────────────────────

export class SessionPersistenceService {
  private initialized = false;

  /**
   * 应用启动时初始化：加载所有线程摘要，恢复序列生成器。
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const threads = await listThreads();
    for (const thread of threads) {
      const snap = await loadSnapshot(thread.threadId);
      if (snap) {
        initSequence(thread.threadId, snap.lastSequence);
      }
    }

    this.initialized = true;
  }

  /**
   * 追加事件日志。
   * 自动生成单调递增的 sequence 号。
   */
  persistEvent(
    threadId: string,
    type: SessionEventType,
    data: Record<string, any> = {},
  ): void {
    createAndPersistEvent(threadId, type, data);
  }

  /**
   * 立即刷新事件持久化队列（线程切换前调用）。
   */
  async flush(): Promise<void> {
    await flushNow();
  }

  /**
   * 创建线程的快照。
   * 快照后自动清理已覆盖的旧事件（超过阈值时）。
   */
  async createSnapshot(
    threadId: string,
    data: Omit<SessionSnapshotData, 'lastPersistedAt'>,
  ): Promise<void> {
    await createSnapshot(threadId, data);
  }

  /**
   * 加载线程的完整 session（快照 + 增量事件重建）。
   * 返回 null 表示线程从未保存过。
   */
  async loadSession(threadId: string): Promise<SessionSnapshotData | null> {
    const session = await loadSession(threadId);
    if (session) {
      initSequence(threadId, session.lastSequence);
    }
    return session;
  }

  /**
   * 加载线程的事件日志（用于增量恢复或调试）。
   */
  async loadEventLog(
    threadId: string,
    sinceSequence?: number,
  ): Promise<any[]> {
    return loadEventLog(threadId, sinceSequence);
  }

  /**
   * 列出所有有快照的线程摘要，按更新时间降序。
   */
  async listThreads(): Promise<Array<{
    threadId: string;
    updatedAt: number;
    messageCount: number;
  }>> {
    return listThreads();
  }

  /**
   * 删除线程的所有数据（快照 + 事件日志）。
   */
  async deleteThreadSession(threadId: string): Promise<void> {
    await deleteSnapshot(threadId);
    await deleteEventsForThread(threadId);
  }

  /**
   * 检查是否需要为该线程创建快照。
   * 返回 true 表示事件数超过阈值，建议创建快照。
   */
  async shouldCreateSnapshot(threadId: string): Promise<boolean> {
    const events = await loadEventLog(threadId);
    return events.length > MAX_EVENTS_BEFORE_SNAPSHOT;
  }

  // ─── 存储监控 ──────────────────────────────────────────

  /**
   * 检查存储配额使用情况。
   * 返回 { used, quota, usagePercent } 或 null（浏览器不支持时）。
   */
  async checkStorageQuota(): Promise<{
    used: number;
    quota: number;
    usagePercent: number;
  } | null> {
    if (!navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    if (estimate.usage === undefined || estimate.quota === undefined) return null;
    return {
      used: estimate.usage,
      quota: estimate.quota,
      usagePercent: (estimate.usage / estimate.quota) * 100,
    };
  }
}

// ─── 单例 ────────────────────────────────────────────────

let _instance: SessionPersistenceService | null = null;

export function getSessionPersistenceService(): SessionPersistenceService {
  if (!_instance) {
    _instance = new SessionPersistenceService();
  }
  return _instance;
}
