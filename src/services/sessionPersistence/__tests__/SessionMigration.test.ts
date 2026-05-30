/**
 * SessionMigration 测试
 *
 * 验证 localStorage → IndexedDB 迁移、回滚和状态检查。
 *
 * @version 1.0.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  migrateFromLocalStorage,
  rollbackToLocalStorage,
  needsMigration,
  getMigrationState,
  resetMigrationFlag,
} from '../SessionMigration';
import * as idb from 'idb-keyval';

describe('SessionMigration', () => {

  beforeEach(() => {
    // 清理 localStorage
    localStorage.removeItem('ifai-chat-store');
    localStorage.removeItem('ifai-todowrite-store');
    // 清理 idb-keyval
  });

  afterEach(async () => {
    localStorage.removeItem('ifai-chat-store');
    localStorage.removeItem('ifai-todowrite-store');
    await idb.del('ifai-chat-store');
    await idb.del('ifai-todowrite-store');
    await idb.del('ifai-session-migration');
  });

  // ─── SM-1: needsMigration ───

  it('SM-1: needsMigration returns true when localStorage has data', async () => {
    localStorage.setItem('ifai-chat-store', JSON.stringify({ messages: [] }));
    expect(await needsMigration()).toBe(true);
  });

  it('SM-1b: needsMigration returns false when no localStorage data', async () => {
    expect(await needsMigration()).toBe(false);
  });

  it('SM-1c: needsMigration returns false after migration', async () => {
    localStorage.setItem('ifai-chat-store', JSON.stringify({ messages: ['hello'] }));
    await migrateFromLocalStorage();
    expect(await needsMigration()).toBe(false);
  });

  // ─── SM-2: migrateFromLocalStorage ───

  it('SM-2: migrateFromLocalStorage copies data from localStorage to IndexedDB', async () => {
    const chatData = { messages: [{ id: 'm1', content: 'hello' }], currentThreadId: 't1' };
    const todoData = { tasks: [{ id: 't1', title: 'test' }] };

    localStorage.setItem('ifai-chat-store', JSON.stringify(chatData));
    localStorage.setItem('ifai-todowrite-store', JSON.stringify(todoData));

    const result = await migrateFromLocalStorage();

    expect(result.success).toBe(true);
    expect(result.migratedKeys).toContain('ifai-chat-store');
    expect(result.migratedKeys).toContain('ifai-todowrite-store');

    // Data should be in IndexedDB (via idb-keyval)
    const storedChat = JSON.parse(await idb.get<string>('ifai-chat-store') || '{}');
    expect(storedChat.messages[0].content).toBe('hello');
    expect(storedChat.currentThreadId).toBe('t1');

    const storedTodo = JSON.parse(await idb.get<string>('ifai-todowrite-store') || '{}');
    expect(storedTodo.tasks[0].title).toBe('test');

    // localStorage should be cleared
    expect(localStorage.getItem('ifai-chat-store')).toBeNull();
    expect(localStorage.getItem('ifai-todowrite-store')).toBeNull();
  });

  it('SM-2b: migrateFromLocalStorage records migration state', async () => {
    localStorage.setItem('ifai-chat-store', JSON.stringify({ messages: [] }));
    await migrateFromLocalStorage();

    const state = await getMigrationState();
    expect(state).not.toBeNull();
    expect(state!.version).toBe(1);
    expect(state!.keys).toContain('ifai-chat-store');
    expect(state!.migratedAt).toBeGreaterThan(0);
  });

  it('SM-2c: migrateFromLocalStorage skips keys not in localStorage', async () => {
    localStorage.setItem('ifai-chat-store', JSON.stringify({ messages: [] }));
    // Do NOT set ifai-todowrite-store

    const result = await migrateFromLocalStorage();
    expect(result.migratedKeys).toEqual(['ifai-chat-store']);
  });

  // ─── SM-3: rollbackToLocalStorage ───

  it('SM-3: rollbackToLocalStorage restores data to localStorage', async () => {
    // First migrate
    localStorage.setItem('ifai-chat-store', JSON.stringify({ messages: ['hi'] }));
    await migrateFromLocalStorage();
    expect(localStorage.getItem('ifai-chat-store')).toBeNull();

    // Then rollback
    const result = await rollbackToLocalStorage();
    expect(result.success).toBe(true);
    expect(result.rolledBackKeys).toContain('ifai-chat-store');

    // Data should be back in localStorage
    const restored = JSON.parse(localStorage.getItem('ifai-chat-store') || '{}');
    expect(restored.messages[0]).toBe('hi');

    // IndexedDB should be cleared
    const idbVal = await idb.get('ifai-chat-store');
    expect(idbVal).toBeUndefined();
  });

  it('SM-3b: rollbackToLocalStorage clears migration flag', async () => {
    localStorage.setItem('ifai-chat-store', JSON.stringify({ messages: [] }));
    await migrateFromLocalStorage();
    expect(await getMigrationState()).not.toBeNull();

    await rollbackToLocalStorage();
    expect(await getMigrationState()).toBeNull();
  });

  // ─── SM-4: resetMigrationFlag ───

  it('SM-4: resetMigrationFlag clears migration state without deleting data', async () => {
    localStorage.setItem('ifai-chat-store', JSON.stringify({ messages: ['keep'] }));
    await migrateFromLocalStorage();
    expect(await getMigrationState()).not.toBeNull();

    // Data should be in IndexedDB
    const storedChat = JSON.parse(await idb.get<string>('ifai-chat-store') || '{}');
    expect(storedChat.messages[0]).toBe('keep');

    await resetMigrationFlag();
    expect(await getMigrationState()).toBeNull();

    // Data should still be in IndexedDB
    const afterReset = JSON.parse(await idb.get<string>('ifai-chat-store') || '{}');
    expect(afterReset.messages[0]).toBe('keep');
  });
});
