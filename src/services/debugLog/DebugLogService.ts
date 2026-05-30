/**
 * DebugLogService — 前端调试日志系统
 *
 * 异步持久化调试日志到 IndexedDB 独立数据库。
 * 默认关闭，通过 VITE_DEBUG_LOG 环境变量或运行时开关启用。
 *
 * 存储策略：
 * - 异步批量写入（500ms debounce）
 * - 滚动淘汰（最多 10000 条或 50MB）
 * - 启动时自动清理过期日志
 *
 * @version 1.0.0
 * @proposal 011-per-thread-gui-session-persistence
 */

import type { DebugLogEntry, DebugCategory, DebugLevel } from './types';

// ─── 常量 ────────────────────────────────────────────────

const DEBUG_DB_NAME = 'ifai-debug-logs';
const DEBUG_DB_VERSION = 1;
const STORE_NAME = 'debug_logs';
const MAX_LOG_ENTRIES = 10000;
const FLUSH_INTERVAL_MS = 500;
const BATCH_FLUSH_THRESHOLD = 50;

// ─── 开关 ────────────────────────────────────────────────

let _enabled = import.meta.env.VITE_DEBUG_LOG === 'true';

export function isDebugLogEnabled(): boolean {
  return _enabled;
}

export function setDebugLogEnabled(enabled: boolean): void {
  _enabled = enabled;
}

// ─── Service ──────────────────────────────────────────────

export class DebugLogService {
  private buffer: DebugLogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private seq = 0;

  /**
   * 初始化：打开 IndexedDB 数据库 + 启动时清理。
   */
  async init(): Promise<void> {
    if (!this.dbPromise) {
      this.dbPromise = this.openDB();
    }
    const db = await this.dbPromise;
    // 启动时清理
    await this.rotateLogs();
  }

  /**
   * 写入调试日志条目。
   * 如果调试日志未启用，直接返回。
   */
  log(entry: Omit<DebugLogEntry, 'id' | 'timestamp'>): void {
    if (!_enabled) return;

    this.seq++;
    const full: DebugLogEntry = {
      ...entry,
      id: `${Date.now()}-${this.seq}`,
      timestamp: Date.now(),
    };

    this.buffer.push(full);

    // buffer 达到批量阈值，立即 flush
    if (this.buffer.length >= BATCH_FLUSH_THRESHOLD) {
      this.flush();
      return;
    }

    // 否则 debounce 500ms
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  /**
   * 立即刷新 buffer 到 IndexedDB。
   */
  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = this.buffer.splice(0);
    if (batch.length === 0) return;

    const db = await this.ensureDB();
    if (!db) return;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const entry of batch) {
      store.add(this.toStoreRow(entry));
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // 写入完成后独立连接检查旋转
    await this.rotateLogs();
  }

  /**
   * 查询调试日志。
   */
  async query(options: {
    threadId?: string;
    category?: DebugCategory;
    level?: DebugLevel;
    since?: number;
    limit?: number;
  } = {}): Promise<DebugLogEntry[]> {
    const db = await this.ensureDB();
    if (!db) return [];

    let entries: DebugLogEntry[] = [];

    if (options.threadId) {
      const index = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).index('threadId');
      entries = await new Promise<DebugLogEntry[]>((resolve, reject) => {
        const req = index.getAll(options.threadId!);
        req.onsuccess = () => resolve(req.result.map((r: any) => this.fromStoreRow(r)));
        req.onerror = () => reject(req.error);
      });
    } else {
      entries = await new Promise<DebugLogEntry[]>((resolve, reject) => {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result.map((r: any) => this.fromStoreRow(r)));
        req.onerror = () => reject(req.error);
      });
    }

    // 过滤
    if (options.category) {
      entries = entries.filter(e => e.category === options.category);
    }
    if (options.level) {
      entries = entries.filter(e => e.level === options.level);
    }
    if (options.since) {
      entries = entries.filter(e => e.timestamp >= options.since!);
    }

    // 按 timestamp 降序排列
    entries.sort((a, b) => b.timestamp - a.timestamp);

    if (options.limit && options.limit > 0) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * 导出为 JSONL 格式文本。
   */
  async exportAsText(options: {
    threadId?: string;
    level?: DebugLevel;
    limit?: number;
  } = {}): Promise<string> {
    const entries = await this.query(options);
    return entries.map(e => JSON.stringify({
      t: new Date(e.timestamp).toISOString(),
      c: e.category,
      l: e.level,
      m: e.message,
      d: e.data,
      dur: e.duration,
    })).join('\n');
  }

  /**
   * 获取日志总数。
   */
  async count(): Promise<number> {
    const db = await this.ensureDB();
    if (!db) return 0;
    return new Promise<number>((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 清理所有日志。
   */
  async clearAll(): Promise<void> {
    const db = await this.ensureDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ─── 内部方法 ──────────────────────────────────────────

  private async ensureDB(): Promise<IDBDatabase | null> {
    try {
      if (!this.dbPromise) {
        this.dbPromise = this.openDB();
      }
      return await this.dbPromise;
    } catch {
      return null;
    }
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DEBUG_DB_NAME, DEBUG_DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('level', 'level', { unique: false });
          store.createIndex('threadId', 'threadId', { unique: false });
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

  private toStoreRow(entry: DebugLogEntry): any {
    return {
      id: entry.id,
      timestamp: entry.timestamp,
      category: entry.category,
      level: entry.level,
      threadId: entry.threadId || '',
      entry,
    };
  }

  private fromStoreRow(row: any): DebugLogEntry {
    return row.entry;
  }

  private async rotateLogs(): Promise<void> {
    // 使用独立连接确保事务隔离
    const db = await this.openDB();

    const count = await new Promise<number>((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (count > MAX_LOG_ENTRIES) {
      const deleteCount = count - Math.floor(MAX_LOG_ENTRIES * 0.8);
      const index = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).index('timestamp');
      const all = await new Promise<any[]>((resolve, reject) => {
        const req = index.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      all.sort((a, b) => a.timestamp - b.timestamp);
      const toDelete = all.slice(0, deleteCount);
      if (toDelete.length > 0) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const row of toDelete) {
          store.delete(row.id);
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    }

    db.close();
  }
}

// ─── 单例 ────────────────────────────────────────────────

let _debugLogInstance: DebugLogService | null = null;

export function getDebugLogService(): DebugLogService {
  if (!_debugLogInstance) {
    _debugLogInstance = new DebugLogService();
  }
  return _debugLogInstance;
}

/**
 * 全局调试日志快捷函数。
 * 默认关闭，通过 VITE_DEBUG_LOG=true 或 setDebugLogEnabled(true) 启用。
 */
export function debugLog(entry: Omit<DebugLogEntry, 'id' | 'timestamp'>): void {
  getDebugLogService().log(entry);
}
