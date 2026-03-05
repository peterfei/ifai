/**
 * 🏆 PIVO 3.0 Storage Quota Sentinel
 * 负责实时监控 LocalStorage 和 IndexedDB 的物理占用情况。
 */
export class QuotaSentinel {
    private static LS_LIMIT = 5 * 1024 * 1024; // 5MB 物理限制

    /**
     * 计算 LocalStorage 的当前占用
     */
    static getLocalStorageUsage(): { bytes: number; percentage: number } {
        let total = 0;
        for (const key in localStorage) {
            if (!localStorage.hasOwnProperty(key)) continue;
            // Key 和 Value 都是 UTF-16，每个字符占 2 字节
            total += (key.length + localStorage[key].length) * 2;
        }
        
        return {
            bytes: total,
            percentage: (total / this.LS_LIMIT) * 100
        };
    }

    /**
     * 获取浏览器存储估算 (IndexedDB + Cache)
     */
    static async getStorageEstimate(): Promise<{ usage: number; quota: number }> {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage || 0,
                quota: estimate.quota || 0
            };
        }
        return { usage: 0, quota: 0 };
    }

    /**
     * 判定是否接近存储极限
     */
    static isNearLimit(usage: number, limit: number, threshold: number = 0.8): boolean {
        if (limit === 0) return false;
        return (usage / limit) >= threshold;
    }

    /**
     * 格式化字节大小
     */
    static formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
