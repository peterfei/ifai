import React, { useEffect, useState } from 'react';
import { AlertTriangle, Database, X } from 'lucide-react';
import { QuotaSentinel } from '../../services/storage/QuotaSentinel';

/**
 * 🏆 PIVO 3.0 Storage Quota Banner
 * 当物理存储（LocalStorage）占用过高时显示警告。
 */
export const StorageQuotaBanner: React.FC = () => {
    const [usage, setUsage] = useState<{ bytes: number; percentage: number } | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        const checkQuota = () => {
            const currentUsage = QuotaSentinel.getLocalStorageUsage();
            setUsage(currentUsage);
            // 超过 80% 且未被手动关闭时显示
            if (currentUsage.percentage > 80 && !isDismissed) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        };

        checkQuota();
        // 每 30 秒检查一次，或在存储密集操作后触发
        const interval = setInterval(checkQuota, 30000);
        return () => clearInterval(interval);
    }, [isDismissed]);

    if (!isVisible || !usage) return null;

    return (
        <div className="bg-amber-600 text-white px-4 py-2 flex items-center justify-between text-xs font-medium animate-in slide-in-from-top duration-300 z-50">
            <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="animate-pulse" />
                <span>
                    物理存储空间即将占满 (已用 {usage.percentage.toFixed(1)}%)。
                    请及时迁移历史记录或清理缓存，以防数据丢失。
                </span>
            </div>
            <div className="flex items-center gap-3">
                <button 
                    onClick={() => setIsDismissed(true)}
                    className="p-1 hover:bg-white/10 rounded-md transition-colors"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
