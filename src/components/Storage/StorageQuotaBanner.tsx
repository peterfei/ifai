import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
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
        <div className="theme-panel-elevated theme-border theme-shadow animate-in slide-in-from-top z-50 flex items-center justify-between border px-4 py-2 text-xs duration-300">
            <div className="flex items-center gap-3">
                <div className="rounded-full bg-amber-500/12 p-1.5">
                    <AlertTriangle size={14} className="animate-pulse text-amber-500" />
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="theme-text font-medium">
                        物理存储空间即将占满 (已用 {usage.percentage.toFixed(1)}%)。
                    </span>
                    <span className="theme-text-subtle">
                        请及时迁移历史记录或清理缓存，以防数据丢失。
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <button 
                    onClick={() => setIsDismissed(true)}
                    className="theme-button-ghost rounded-md p-1.5 hover:text-amber-600"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
