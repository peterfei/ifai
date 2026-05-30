/**
 * SessionMigration — 存储迁移工具
 *
 * 从 localStorage 迁移数据到 IndexedDB（通过 PersistenceManager 路由）。
 * 提供迁移、回滚和状态检查功能。
 *
 * @version 1.0.0
 * @proposal 011-per-thread-gui-session-persistence
 */

import { PersistenceManager } from '../storage/PersistenceManager';

// ─── 迁移清单 ────────────────────────────────────────────

const MIGRATION_KEYS = [
  'ifai-chat-store',
  'ifai-todowrite-store',
];

const MIGRATION_KEY_NAME = 'ifai-session-migration';

// ─── 状态类型 ────────────────────────────────────────────

interface MigrationState {
  version: number;
  migratedAt: number;
  keys: string[];
}

// ─── 迁移逻辑 ────────────────────────────────────────────

const pm = PersistenceManager.getInstance();

/**
 * 获取当前迁移状态。
 * 返回 null 表示从未执行过迁移。
 */
export async function getMigrationState(): Promise<MigrationState | null> {
  const raw = await pm.getItem(MIGRATION_KEY_NAME);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 检查是否需要迁移（存在 localStorage 数据且尚未迁移）。
 */
export async function needsMigration(): Promise<boolean> {
  const state = await getMigrationState();
  if (state) return false; // 已迁移

  // 检查 localStorage 中是否存在待迁移 key
  for (const key of MIGRATION_KEYS) {
    const lsVal = localStorage.getItem(key);
    if (lsVal) return true;
  }
  return false;
}

/**
 * 从 localStorage 迁移数据到 IndexedDB。
 *
 * 流程：
 * 1. 读取 localStorage 中待迁移 key 的数据
 * 2. 通过 PersistenceManager 写入 IndexedDB
 * 3. 清除 localStorage 中的原始数据
 * 4. 记录迁移状态
 */
export async function migrateFromLocalStorage(): Promise<{
  success: boolean;
  migratedKeys: string[];
  errors: string[];
}> {
  const migratedKeys: string[] = [];
  const errors: string[] = [];

  for (const key of MIGRATION_KEYS) {
    try {
      const lsVal = localStorage.getItem(key);
      if (lsVal === null) {
        // 该 key 不在 localStorage 中，跳过
        continue;
      }

      // 通过 PersistenceManager 写入 IndexedDB
      await pm.setItem(key, lsVal);

      // 成功后清除 localStorage
      localStorage.removeItem(key);

      migratedKeys.push(key);
    } catch (e) {
      errors.push(`Failed to migrate ${key}: ${e}`);
    }
  }

  // 记录迁移状态
  if (migratedKeys.length > 0) {
    const state: MigrationState = {
      version: 1,
      migratedAt: Date.now(),
      keys: migratedKeys,
    };
    await pm.setItem(MIGRATION_KEY_NAME, JSON.stringify(state));
  }

  return {
    success: errors.length === 0,
    migratedKeys,
    errors,
  };
}

/**
 * 回滚迁移：将 IndexedDB 数据写回 localStorage。
 * 用于诊断/调试场景。
 */
export async function rollbackToLocalStorage(): Promise<{
  success: boolean;
  rolledBackKeys: string[];
  errors: string[];
}> {
  const rolledBackKeys: string[] = [];
  const errors: string[] = [];

  for (const key of MIGRATION_KEYS) {
    try {
      const idbVal = await pm.getItem(key);
      if (idbVal === null) continue;

      localStorage.setItem(key, idbVal);
      await pm.removeItem(key);
      rolledBackKeys.push(key);
    } catch (e) {
      errors.push(`Failed to rollback ${key}: ${e}`);
    }
  }

  // 清除迁移状态
  if (rolledBackKeys.length > 0) {
    await pm.removeItem(MIGRATION_KEY_NAME);
  }

  return {
    success: errors.length === 0,
    rolledBackKeys,
    errors,
  };
}

/**
 * 清除迁移状态标记（不删除数据，仅重置标记使下次启动重新迁移）。
 */
export async function resetMigrationFlag(): Promise<void> {
  await pm.removeItem(MIGRATION_KEY_NAME);
}
