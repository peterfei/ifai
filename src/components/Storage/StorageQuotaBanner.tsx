import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QuotaSentinel } from '../../services/storage/QuotaSentinel';

/**
 * 🏆 PIVO 3.0 Storage Quota Banner
 * 当物理存储（LocalStorage）占用过高时显示警告。
 */
export const StorageQuotaBanner: React.FC = () => {
    const { t } = useTranslation();
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
                <div className="theme-surface-warning rounded-full p-1.5">
                    <AlertTriangle size={14} className="theme-text-warning animate-pulse" />
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="theme-text font-medium">
                        {t('storageQuotaBanner.title', { percentage: usage.percentage.toFixed(1) })}
                    </span>
                    <span className="theme-text-subtle">
                        {t('storageQuotaBanner.description')}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <button 
                    type="button"
                    onClick={() => setIsDismissed(true)}
                    className="theme-button-ghost theme-text-warning rounded-md p-1.5"
                    aria-label={t('storageQuotaBanner.dismiss')}
                    title={t('storageQuotaBanner.dismiss')}
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
