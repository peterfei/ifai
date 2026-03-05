import { PersistenceManager } from './PersistenceManager';

/**
 * 🏆 PIVO 3.0 Data Migration Engine
 * 负责将数据从 LocalStorage 平滑迁移至异步存储系统。
 */
export class DataMigrator {
    private static _migrationPromise: Promise<void> | null = null;
    private static BIG_DATA_PREFIXES = [
        'ifai-history',
        'ifai-file-cache',
        'ifai-symbol-index',
        'pivo-task-trees'
    ];

    /**
     * 获取迁移任务的 Promise
     */
    static get migrationPromise(): Promise<void> {
        if (!this._migrationPromise) {
            this._migrationPromise = this.migrate();
        }
        return this._migrationPromise;
    }

    /**
     * 执行迁移逻辑
     */
    private static async migrate(): Promise<void> {
        try {
            console.log('[DataMigrator] 🚀 Starting storage migration check...');
            const manager = PersistenceManager.getInstance();
            const keysToMigrate: string[] = [];

            // 1. 扫描 LocalStorage 寻找符合条件的 Key
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && this.BIG_DATA_PREFIXES.some(p => key.startsWith(p))) {
                    keysToMigrate.push(key);
                }
            }

            if (keysToMigrate.length === 0) {
                console.log('[DataMigrator] ✅ No legacy data found in LocalStorage.');
                return;
            }

            console.log(`[DataMigrator] 📦 Found ${keysToMigrate.length} keys to migrate.`);

            // 2. 物理搬家
            for (const key of keysToMigrate) {
                const rawValue = localStorage.getItem(key);
                if (rawValue) {
                    try {
                        const parsedValue = JSON.parse(rawValue);
                        // 写入 PersistenceManager (它会自动路由到 IndexedDB)
                        await manager.setItem(key, parsedValue);
                        // 物理删除旧 Key
                        localStorage.removeItem(key);
                        console.log(`[DataMigrator] ✓ Migrated and cleaned: ${key}`);
                    } catch (e) {
                        console.error(`[DataMigrator] ❌ Failed to migrate key ${key}:`, e);
                    }
                }
            }
        } catch (globalError) {
            console.error('[DataMigrator] 🚨 Global migration engine error:', globalError);
        } finally {
            console.log('[DataMigrator] 🏁 Migration phase finished.');
        }
    }
}
