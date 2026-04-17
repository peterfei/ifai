/**
 * Cache Statistics Display Panel
 *
 * Shows real-time cache hit rates and performance metrics.
 * Useful for testing and monitoring optimization effectiveness.
 */

import React, { useEffect, useState } from 'react';
import { X, BarChart3, Activity } from 'lucide-react';
import { cacheStats } from '../../utils/cache';
import { perfMonitor } from '../../utils/performanceMonitor';

interface CacheStatsPanelProps {
  onClose: () => void;
}

export const CacheStatsPanel: React.FC<CacheStatsPanelProps> = ({ onClose }) => {
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

  const hitRateColor = stats.hitRate >= 80 ? 'text-green-500' : stats.hitRate >= 50 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="theme-panel-elevated theme-border theme-shadow fixed bottom-4 right-4 z-50 w-96 rounded-lg border">
      {/* Header */}
      <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-blue-400" />
          <h3 className="theme-text text-sm font-semibold">性能监控</h3>
        </div>
        <button
          onClick={onClose}
          className="theme-button-ghost rounded p-1"
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
            缓存统计
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="theme-panel-muted rounded p-2">
              <div className="theme-text-subtle text-xs">命中率</div>
              <div className={`text-lg font-semibold ${hitRateColor}`}>
                {stats.hitRate.toFixed(1)}%
              </div>
            </div>
            <div className="theme-panel-muted rounded p-2">
              <div className="theme-text-subtle text-xs">缓存大小</div>
              <div className="text-lg font-semibold text-blue-400">
                {stats.size}
              </div>
            </div>
            <div className="theme-panel-muted rounded p-2">
              <div className="theme-text-subtle text-xs">命中次数</div>
              <div className="text-lg font-semibold text-green-400">
                {stats.hits}
              </div>
            </div>
            <div className="theme-panel-muted rounded p-2">
              <div className="theme-text-subtle text-xs">未命中</div>
              <div className="text-lg font-semibold text-red-400">
                {stats.misses}
              </div>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        {Object.keys(perfStats).length > 0 && (
          <div>
            <h4 className="theme-text-subtle mb-2 text-xs font-medium">性能指标</h4>
            <div className="space-y-2">
              {Object.entries(perfStats).map(([op, data]) => (
                <div key={op} className="theme-panel-muted rounded p-2 text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="theme-text">{op}</span>
                    <span className="theme-text-subtle">{data.count} 次</span>
                  </div>
                  <div className="theme-text-muted grid grid-cols-3 gap-2">
                    <div>
                      <span className="theme-text-subtle">平均:</span> {data.avg.toFixed(1)}ms
                    </div>
                    <div>
                      <span className="theme-text-subtle">最小:</span> {data.min.toFixed(1)}ms
                    </div>
                    <div>
                      <span className="theme-text-subtle">最大:</span> {data.max.toFixed(1)}ms
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-900/20 border border-blue-800/50 p-3 rounded text-xs text-blue-300">
          <strong>测试方法:</strong>
          <ul className="mt-1 space-y-1 ml-4 list-disc">
            <li>展开/收起目录观察缓存命中率</li>
            <li>重复访问同一目录查看速度提升</li>
            <li>观察不同操作的耗时变化</li>
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
