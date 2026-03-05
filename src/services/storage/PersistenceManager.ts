import * as idb from 'idb-keyval';
import { StateStorage } from 'zustand/middleware';

/**
 * 🏆 PIVO 3.0 Persistence Management SDK
 * 提供统一的异步存储接口，支持根据 Key 前缀自动路由物理后端。
 * 兼容 Zustand 的 StateStorage 接口。
 */

export interface IStorageAdapter {
    getItem<T>(key: string): Promise<T | null>;
    setItem<T>(key: string, value: T): Promise<void>;
    removeItem(key: string): Promise<void>;
}

/**
 * LocalStorage 适配器 (同步转异步)
 */
class LocalStorageAdapter implements IStorageAdapter {
    async getItem<T>(key: string): Promise<T | null> {
        const val = localStorage.getItem(key);
        if (val === null) return null;
        try {
            return JSON.parse(val) as T;
        } catch {
            return val as any;
        }
    }

    async setItem<T>(key: string, value: T): Promise<void> {
        localStorage.setItem(key, JSON.stringify(value));
    }

    async removeItem(key: string): Promise<void> {
        localStorage.removeItem(key);
    }
}

/**
 * IndexedDB 适配器 (基于 idb-keyval)
 */
class IndexedDBAdapter implements IStorageAdapter {
    async getItem<T>(key: string): Promise<T | null> {
        const val = await idb.get<string>(key);
        if (!val) return null;
        try {
            return JSON.parse(val) as T;
        } catch {
            return val as any;
        }
    }

    async setItem<T>(key: string, value: T): Promise<void> {
        await idb.set(key, JSON.stringify(value));
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
     */
    async getItem(name: string): Promise<string | null> {
        return this.getAdapter(name).getItem<string>(name);
    }

    async setItem(name: string, value: string): Promise<void> {
        return this.getAdapter(name).setItem<string>(name, value);
    }

    async removeItem(name: string): Promise<void> {
        return this.getAdapter(name).removeItem(name);
    }

    /**
     * 获取物理后端。
     * 规则：ifai-history, ifai-file-cache, ifai-symbol-index 路由到 IndexedDB。
     * 其他（配置类）路由到 LocalStorage。
     */
    private getAdapter(key: string): IStorageAdapter {
        const bigDataPrefixes = [
            'ifai-history', 
            'ifai-file-cache', 
            'ifai-symbol-index', 
            'pivo-task-trees',
            'chat-history', // 兼容旧版前缀
            'ifai-chat-history'
        ];
        if (bigDataPrefixes.some(p => key.startsWith(p))) {
            return this.ldb;
        }
        return this.ls;
    }
}
