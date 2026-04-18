/**
 * 工具分类监控组件
 *
 * 显示实时分类统计、性能指标和错误日志
 */

import React, { useState, useEffect } from 'react';
import { Activity, Clock, TrendingUp, AlertCircle, X, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToolClassificationStore, useClassificationStats } from '@/stores/toolClassificationStore';
import ClassificationHistory from './ClassificationHistory';

interface ErrorLog {
  id: string;
  timestamp: number;
  input: string;
  error: string;
  layer?: string;
}

interface StatsCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  color: string;
  trend?: number; // 正数=上升，负数=下降
}

const STAT_COLORS = {
  totalCalls: 'var(--info-color)',
  accuracy: 'var(--success-color)',
  latency: 'var(--warning-color)',
  errors: 'var(--danger-color)',
} as const;

const LAYER_DOT_COLORS = {
  layer1: 'var(--success-color)',
  layer2: 'var(--info-color)',
  layer3: 'var(--accent-color)',
} as const;

const StatsCard: React.FC<StatsCardProps> = ({ title, value, unit, icon, color, trend }) => (
  <div className="theme-panel-muted theme-border rounded-lg border p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="theme-text-subtle text-xs">{title}</span>
      <div style={{ color }} className="opacity-80">
        {icon}
      </div>
    </div>
    <div className="flex items-baseline gap-2">
      <span className="theme-text text-2xl font-bold">{value}</span>
      {unit && <span className="theme-text-subtle text-xs">{unit}</span>}
      {trend !== undefined && (
        <span className={`text-xs ${trend >= 0 ? 'theme-text-success' : 'theme-text-danger'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
        </span>
      )}
    </div>
  </div>
);

export const ToolClassificationMonitor: React.FC = () => {
  const { t } = useTranslation();
  const stats = useClassificationStats();
  const history = useToolClassificationStore(state => state.history);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 从历史记录中提取错误（置信度低于50%的视为潜在错误）
  useEffect(() => {
    const errors = history
      .filter(item => item.result.confidence < 0.5)
      .map(item => ({
        id: item.id,
        timestamp: item.timestamp,
        input: item.input,
        error: t('toolClassificationMonitor.lowConfidence', {
          confidence: (item.result.confidence * 100).toFixed(0),
        }),
        layer: item.result.layer,
      }));
    setErrorLogs(errors);
  }, [history, t]);

  // 计算平均延迟
  const avgLatency = history.length > 0
    ? history.reduce((sum, item) => sum + item.latencyMs, 0) / history.length
    : 0;

  // 计算准确率（这里简化为高置信度比例）
  const accuracy = history.length > 0
    ? (history.filter(item => item.result.confidence >= 0.8).length / history.length) * 100
    : 0;

  // 按层级统计
  const layerStats = {
    layer1: history.filter(item => item.result.layer === 'layer1').length,
    layer2: history.filter(item => item.result.layer === 'layer2').length,
    layer3: history.filter(item => item.result.layer === 'layer3').length,
  };

  // 刷新数据
  const handleRefresh = async () => {
    setIsRefreshing(true);
    // 模拟刷新
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsRefreshing(false);
  };

  return (
    <div className="theme-panel flex flex-col gap-4 rounded-lg p-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="theme-text-info w-5 h-5" />
          <h3 className="theme-text text-lg font-semibold">{t('toolClassificationMonitor.title')}</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="theme-button-ghost rounded-lg p-2 transition-colors"
          title={t('toolClassificationMonitor.refresh')}
        >
          <RefreshCw className={`theme-text-subtle w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatsCard
          title={t('toolClassificationMonitor.totalCalls')}
          value={stats.totalCount}
          icon={<Activity className="w-4 h-4" />}
          color={STAT_COLORS.totalCalls}
        />
        <StatsCard
          title={t('toolClassificationMonitor.averageAccuracy')}
          value={accuracy.toFixed(1)}
          unit="%"
          icon={<TrendingUp className="w-4 h-4" />}
          color={STAT_COLORS.accuracy}
        />
        <StatsCard
          title={t('toolClassificationMonitor.averageLatency')}
          value={avgLatency.toFixed(1)}
          unit="ms"
          icon={<Clock className="w-4 h-4" />}
          color={STAT_COLORS.latency}
        />
        <StatsCard
          title={t('toolClassificationMonitor.errorCount')}
          value={errorLogs.length}
          icon={<AlertCircle className="w-4 h-4" />}
          color={STAT_COLORS.errors}
        />
      </div>

      {/* 层级分布 */}
      <div className="theme-panel-muted theme-border rounded-lg border p-4">
        <h4 className="theme-text-muted mb-3 text-sm font-medium">{t('toolClassificationMonitor.layerDistribution')}</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: LAYER_DOT_COLORS.layer1 }} />
              <span className="theme-text-subtle text-xs">{t('toolClassificationHistory.layers.layer1')}</span>
            </div>
            <div className="theme-text text-xl font-bold">{layerStats.layer1}</div>
            <div className="theme-text-subtle text-xs">
              {stats.totalCount > 0 ? ((layerStats.layer1 / stats.totalCount) * 100).toFixed(1) : 0}%
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: LAYER_DOT_COLORS.layer2 }} />
              <span className="theme-text-subtle text-xs">{t('toolClassificationHistory.layers.layer2')}</span>
            </div>
            <div className="theme-text text-xl font-bold">{layerStats.layer2}</div>
            <div className="theme-text-subtle text-xs">
              {stats.totalCount > 0 ? ((layerStats.layer2 / stats.totalCount) * 100).toFixed(1) : 0}%
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: LAYER_DOT_COLORS.layer3 }} />
              <span className="theme-text-subtle text-xs">{t('toolClassificationHistory.layers.layer3')}</span>
            </div>
            <div className="theme-text text-xl font-bold">{layerStats.layer3}</div>
            <div className="theme-text-subtle text-xs">
              {stats.totalCount > 0 ? ((layerStats.layer3 / stats.totalCount) * 100).toFixed(1) : 0}%
            </div>
          </div>
        </div>
      </div>

      {/* 历史记录 */}
      <div className="theme-panel-muted theme-border rounded-lg border p-4">
        <h4 className="theme-text-muted mb-3 text-sm font-medium">{t('toolClassificationMonitor.recentHistory')}</h4>
        <ClassificationHistory maxItems={5} />
      </div>

      {/* 错误日志 */}
      <div className="theme-panel-muted theme-border rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="theme-text-muted flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="theme-text-danger w-4 h-4" />
            {t('toolClassificationMonitor.errorLog', { count: errorLogs.length })}
          </h4>
          {errorLogs.length > 0 && (
            <button
              onClick={() => setShowErrors(!showErrors)}
              className="theme-button-ghost theme-text-accent rounded px-2 py-0.5 text-xs"
            >
              {showErrors ? t('toolClassificationMonitor.collapse') : t('toolClassificationMonitor.expand')}
            </button>
          )}
        </div>

        {errorLogs.length === 0 ? (
          <p className="theme-text-subtle py-4 text-center text-xs">{t('toolClassificationMonitor.noErrors')}</p>
        ) : showErrors ? (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {errorLogs.map((log) => (
              <div
                key={log.id}
                className="theme-code-surface theme-border rounded border p-2 text-xs"
              >
                <div className="flex items-start justify-between mb-1">
                  <code className="theme-text-muted flex-1 truncate">{log.input}</code>
                  <span className="theme-text-danger ml-2">{log.error}</span>
                </div>
                <div className="theme-text-subtle flex items-center gap-2">
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  {log.layer && <span>• {log.layer}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="theme-text-subtle py-4 text-center text-xs">
            {t('toolClassificationMonitor.expandHint')}
          </p>
        )}
      </div>
    </div>
  );
};

export default ToolClassificationMonitor;
