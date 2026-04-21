/**
 * Cache Statistics Display Panel
 *
 * Shows real-time cache hit rates and performance metrics.
 * Useful for testing and monitoring optimization effectiveness.
 */

import React, { useEffect, useState } from 'react';
import { X, BarChart3, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cacheStats } from '../../utils/cache';
import { perfMonitor } from '../../utils/performanceMonitor';

interface CacheStatsPanelProps {
  onClose: () => void;
}

export const CacheStatsPanel: React.FC<CacheStatsPanelProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    hits: 0,
    misses: 0,
    hitRate: 0,
    evictions: 0,
    size: 0,
  });

  const [perfStats, setPerfStats] = useState<Record<string, {
    count: number;
    avg: number;
    min: number;
    max: number;
  }>>({});

  // Update stats every second
  useEffect(() => {
    const interval = setInterval(() => {
      setStats({
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        hitRate: cacheStats.hitRate * 100,
        evictions: cacheStats.evictions,
        size: cacheStats.hitRate > 0 ? cacheStats.hits + cacheStats.misses : 0,
      });

      // Get performance stats for key operations
      const operations = ['readDirectory', 'expandDirectory', 'gitStatusUpdate', 'refreshTree'];
      const newPerfStats: Record<string, { count: number; avg: number; min: number; max: number }> = {};

      for (const op of operations) {
        const stats = perfMonitor.getStatistics(op);
        if (stats.count > 0) {
          newPerfStats[op] = {
            count: stats.count,
            avg: stats.avg,
            min: stats.min,
            max: stats.max,
          };
        }
      }

      setPerfStats(newPerfStats);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const hitRateColor =
    stats.hitRate >= 80
      ? 'theme-text-success'
      : stats.hitRate >= 50
        ? 'theme-text-warning'
        : 'theme-text-danger';

  const operationLabelMap: Record<string, string> = {
    readDirectory: t('cacheStatsPanel.operations.readDirectory'),
    expandDirectory: t('cacheStatsPanel.operations.expandDirectory'),
    gitStatusUpdate: t('cacheStatsPanel.operations.gitStatusUpdate'),
    refreshTree: t('cacheStatsPanel.operations.refreshTree'),
  };

  return (
    <div className="theme-panel-elevated theme-border theme-shadow fixed bottom-4 right-4 z-50 w-96 rounded-lg border">
      {/* Header */}
      <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="theme-text-accent" />
          <h3 className="theme-text text-sm font-semibold">{t('cacheStatsPanel.title')}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="theme-button-ghost rounded p-1"
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
        {/* Cache Statistics */}
        <div>
          <h4 className="theme-text-subtle mb-2 flex items-center gap-2 text-xs font-medium">
            <Activity size={14} />
            {t('cacheStatsPanel.cacheStats')}
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="theme-panel-muted rounded p-2">
              <div className="theme-text-subtle text-xs">{t('cacheStatsPanel.hitRate')}</div>
              <div className={`text-lg font-semibold ${hitRateColor}`}>
                {stats.hitRate.toFixed(1)}%
              </div>
            </div>
            <div className="theme-panel-muted rounded p-2">
              <div className="theme-text-subtle text-xs">{t('cacheStatsPanel.cacheSize')}</div>
              <div className="theme-text-info text-lg font-semibold">
                {stats.size}
              </div>
            </div>
            <div className="theme-panel-muted rounded p-2">
              <div className="theme-text-subtle text-xs">{t('cacheStatsPanel.hits')}</div>
              <div className="theme-text-success text-lg font-semibold">
                {stats.hits}
              </div>
            </div>
            <div className="theme-panel-muted rounded p-2">
              <div className="theme-text-subtle text-xs">{t('cacheStatsPanel.misses')}</div>
              <div className="theme-text-danger text-lg font-semibold">
                {stats.misses}
              </div>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        {Object.keys(perfStats).length > 0 && (
          <div>
            <h4 className="theme-text-subtle mb-2 text-xs font-medium">
              {t('cacheStatsPanel.performanceMetrics')}
            </h4>
            <div className="space-y-2">
              {Object.entries(perfStats).map(([op, data]) => (
                <div key={op} className="theme-panel-muted rounded p-2 text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="theme-text">{operationLabelMap[op] || op}</span>
                    <span className="theme-text-subtle">
                      {t('cacheStatsPanel.count', { count: data.count })}
                    </span>
                  </div>
                  <div className="theme-text-muted grid grid-cols-3 gap-2">
                    <div>
                      <span className="theme-text-subtle">{t('cacheStatsPanel.average')}:</span> {data.avg.toFixed(1)} ms
                    </div>
                    <div>
                      <span className="theme-text-subtle">{t('cacheStatsPanel.min')}:</span> {data.min.toFixed(1)} ms
                    </div>
                    <div>
                      <span className="theme-text-subtle">{t('cacheStatsPanel.max')}:</span> {data.max.toFixed(1)} ms
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="theme-surface-accent rounded p-3 text-xs">
          <strong className="theme-text">{t('cacheStatsPanel.instructionsTitle')}:</strong>
          <ul className="mt-1 space-y-1 ml-4 list-disc">
            <li className="theme-text-muted">{t('cacheStatsPanel.instructions.expandCollapse')}</li>
            <li className="theme-text-muted">{t('cacheStatsPanel.instructions.repeatAccess')}</li>
            <li className="theme-text-muted">{t('cacheStatsPanel.instructions.observeLatency')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

/**
 * Hook to show/hide cache stats panel
 */
export function useCacheStatsPanel() {
  const [showPanel, setShowPanel] = React.useState(false);

  const togglePanel = () => setShowPanel(prev => !prev);

  return {
    showPanel,
    togglePanel,
    CacheStatsPanel: showPanel ? CacheStatsPanel : () => null,
  };
}
