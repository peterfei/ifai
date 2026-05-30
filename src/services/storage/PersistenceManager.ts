import * as idb from 'idb-keyval';
import { StateStorage } from 'zustand/middleware';

/**
 * 🏆 PIVO 3.0 Persistence Management SDK
 * 提供统一的异步存储接口，支持根据 Key 前缀自动路由物理后端。
 * 兼容 Zustand 的 StateStorage 接口。
 */

export interface IStorageAdapter {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
}

/**
 * LocalStorage 适配器 (同步转异步)
 * 核心：保持原始字符串存取，由上层（如 Zustand）决定如何序列化。
 */
class LocalStorageAdapter implements IStorageAdapter {
    async getItem(key: string): Promise<string | null> {
        return localStorage.getItem(key);
    }

    async setItem(key: string, value: string): Promise<void> {
        localStorage.setItem(key, value);
    }

    async removeItem(key: string): Promise<void> {
        localStorage.removeItem(key);
    }
}

/**
 * IndexedDB 适配器 (基于 idb-keyval)
 * 核心：保持原始字符串存取。
 */
class IndexedDBAdapter implements IStorageAdapter {
    async getItem(key: string): Promise<string | null> {
        const val = await idb.get<string>(key);
        return val || null;
    }

    async setItem(key: string, value: string): Promise<void> {
        await idb.set(key, value);
    }

    async removeItem(key: string): Promise<void> {
        await idb.del(key);
    }
}

export class PersistenceManager implements StateStorage {
    private static instance: PersistenceManager;
    private ldb = new IndexedDBAdapter();
    private ls = new LocalStorageAdapter();

    private constructor() {}

    static getInstance(): PersistenceManager {
        if (!this.instance) {
            this.instance = new PersistenceManager();
        }
        return this.instance;
    }

    /**
     * 🏆 Zustand StateStorage 兼容接口
     * 返回 RAW 字符串，防止双重解析 Bug。
     */
    async getItem(name: string): Promise<string | null> {
        return this.getAdapter(name).getItem(name);
    }

    async setItem(name: string, value: string): Promise<void> {
        try {
            await this.getAdapter(name).setItem(name, value);
        } catch (e: any) {
            // 物理自愈：如果写入失败且看起来是配额问题，执行紧急清理
            if (e.name === 'QuotaExceededError' || e.message?.includes('quota')) {
                console.warn(`[PersistenceManager] 🚨 Storage quota exceeded for ${name}. Triggering emergency cleanup...`);
                await this.emergencyCleanup();
                try {
                    await this.getAdapter(name).setItem(name, value);
                } catch (retryError) {
                    console.error('[PersistenceManager] ❌ Retry failed after cleanup:', retryError);
                }
            } else {
                throw e;
            }
        }
    }

    async removeItem(name: string): Promise<void> {
        return this.getAdapter(name).removeItem(name);
    }

    /**
     * 获取物理后端。
     * 规则：数据密集型 Key 路由到 IndexedDB，配置类路由到 LocalStorage。
     */
    private getAdapter(key: string): IStorageAdapter {
        const bigDataPrefixes = [
            'ifai-history',
            'ifai-file-cache',
            'ifai-symbol-index',
            'pivo-task-trees',
            'chat-history',
            'ifai-chat-history',
            'chat-storage',             // 🚀 核心聊天存储 → IndexedDB
            'ifai-thread-storage',       // 🚀 线程元数据 → IndexedDB
            'file-storage',
            'ifai-chat-store',           // 🚀 Phase 2: useChatStore persist → IndexedDB
            'ifai-todowrite-store',      // 🚀 Phase 2: todoWriteStore persist → IndexedDB
        ];
        if (bigDataPrefixes.some(p => key.startsWith(p))) {
            return this.ldb;
        }
        return this.ls;
    }

    /**
     * 紧急清理逻辑：删除过期的文件缓存等非核心数据
     */
    private async emergencyCleanup(): Promise<void> {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('ifai-file-cache')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    }
}
