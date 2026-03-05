import * as idb from 'idb-keyval';
import { StateStorage } from 'zustand/middleware';

/**
 * 🏆 PIVO 3.0 Persistence Management SDK
 */

export interface IStorageAdapter {
    getItem<T>(key: string): Promise<T | null>;
    setItem<T>(key: string, value: T): Promise<void>;
    removeItem(key: string): Promise<void>;
}

/**
 * LocalStorage 适配器
 * 核心：Zustand 传入的已经是序列化后的字符串，不需要二次 stringify。
 */
class LocalStorageAdapter implements IStorageAdapter {
    async getItem<T>(key: string): Promise<T | null> {
        const val = localStorage.getItem(key);
        if (val === null) return null;
        
        try {
            // 只有当看起来像 JSON 时才解析，否则直接返回（兼容性）
            if (val.startsWith('{') || val.startsWith('[') || val.startsWith('"')) {
                return JSON.parse(val) as T;
            }
            return val as any;
        } catch (e) {
            return val as any;
        }
    }

    async setItem<T>(key: string, value: T): Promise<void> {
        // 如果是字符串（Zustand 传入），直接存；否则 stringify
        const val = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, val);
    }

    async removeItem(key: string): Promise<void> {
        localStorage.removeItem(key);
    }
}

/**
 * IndexedDB 适配器
 */
class IndexedDBAdapter implements IStorageAdapter {
    async getItem<T>(key: string): Promise<T | null> {
        const val = await idb.get<any>(key);
        if (val === undefined || val === null) return null;
        
        // 🏆 PIVO 3.0: 拦截物理脏数据
        if (val === '[object Object]') {
            console.error(`[PersistenceManager] 🚨 Corrupted data detected for key: ${key}. Cleaning up...`);
            await idb.del(key);
            return null;
        }

        // idb-keyval 会自动处理非字符串对象
        if (typeof val === 'string') {
            try {
                if (val.startsWith('{') || val.startsWith('[') || val.startsWith('"')) {
                    return JSON.parse(val) as T;
                }
            } catch (e) {}
        }
        return val as T;
    }

    async setItem<T>(key: string, value: T): Promise<void> {
        // 🏆 PIVO 3.0: 避免双重编码
        // 如果 value 已经是 JSON 字符串，则直接存储，不需要再 stringify
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

    async getItem(name: string): Promise<string | null> {
        return this.getAdapter(name).getItem<string>(name);
    }

    async setItem(name: string, value: string): Promise<void> {
        try {
            await this.getAdapter(name).setItem<string>(name, value);
        } catch (e: any) {
            if (e.name === 'QuotaExceededError' || e.message?.includes('quota')) {
                console.warn(`[PersistenceManager] 🚨 Storage quota exceeded. Triggering cleanup...`);
                await this.emergencyCleanup();
                await this.getAdapter(name).setItem<string>(name, value);
            } else {
                throw e;
            }
        }
    }

    async removeItem(name: string): Promise<void> {
        return this.getAdapter(name).removeItem(name);
    }

    private getAdapter(key: string): IStorageAdapter {
        const bigDataPrefixes = ['ifai-history', 'ifai-file-cache', 'ifai-symbol-index', 'pivo-task-trees', 'chat-history'];
        if (bigDataPrefixes.some(p => key.startsWith(p))) {
            return this.ldb;
        }
        return this.ls;
    }

    private async emergencyCleanup(): Promise<void> {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('ifai-file-cache')) keysToRemove.push(key);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    }
}
