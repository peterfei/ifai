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
        
        // 🏆 PIVO 3.0: 增强型 JSON 解析保护
        try {
            // 如果已经是 JSON 字符串，尝试解析
            if (val.startsWith('{') || val.startsWith('[') || val.startsWith('"')) {
                return JSON.parse(val) as T;
            }
            return val as any;
        } catch (e) {
            console.warn(`[LocalStorageAdapter] ⚠️ Failed to parse JSON for key: ${key}. Returning raw value.`);
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
        try {
            await this.getAdapter(name).setItem<string>(name, value);
        } catch (e: any) {
            if (e.name === 'QuotaExceededError' || e.message?.includes('quota')) {
                console.warn(`[PersistenceManager] 🚨 Storage quota exceeded for ${name}. Triggering emergency cleanup...`);
                await this.emergencyCleanup();
                // 重试一次
                try {
                    await this.getAdapter(name).setItem<string>(name, value);
                } catch (retryError) {
                    console.error('[PersistenceManager] ❌ Retry failed after cleanup:', retryError);
                    throw retryError;
                }
            } else {
                throw e;
            }
        }
    }

    /**
     * 紧急清理逻辑：删除过期的文件缓存等非核心数据
     */
    private async emergencyCleanup(): Promise<void> {
        console.log('[PersistenceManager] 🧹 Executing emergency cleanup of file-cache...');
        const keysToRemove: string[] = [];
        
        // 清理 LocalStorage 中的缓存
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('ifai-file-cache')) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(k => localStorage.removeItem(k));
        console.log(`[PersistenceManager] ✓ Removed ${keysToRemove.length} cached items from LocalStorage.`);
        
        // 以后可以扩展到清理 IndexedDB 中的过期分片
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
