/**
 * 工具分类监控组件
 *
 * 显示实时分类统计、性能指标和错误日志
 */

import React, { useState, useEffect } from 'react';
import { Activity, Clock, TrendingUp, AlertCircle, X, RefreshCw } from 'lucide-react';
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

const StatsCard: React.FC<StatsCardProps> = ({ title, value, unit, icon, color, trend }) => (
  <div className="bg-[#2d2d2d] border border-gray-700 rounded-lg p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs text-gray-400">{title}</span>
      <div style={{ color }} className="opacity-80">
        {icon}
      </div>
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-bold text-white">{value}</span>
      {unit && <span className="text-xs text-gray-500">{unit}</span>}
      {trend !== undefined && (
        <span className={`text-xs ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
        </span>
      )}
    </div>
  </div>
);

export const ToolClassificationMonitor: React.FC = () => {
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
        error: `低置信度 (${(item.result.confidence * 100).toFixed(0)}%)`,
        layer: item.result.layer,
      }));
    setErrorLogs(errors);
  }, [history]);

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
    <div className="flex flex-col gap-4 p-4 bg-[#1e1e1e] rounded-lg">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">工具分类监控</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          title="刷新数据"
        >
          <RefreshCw className={`w-4 h-4 text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatsCard
          title="总调用次数"
          value={stats.totalCount}
          icon={<Activity className="w-4 h-4" />}
          color="#3b82f6"
        />
        <StatsCard
          title="平均准确率"
          value={accuracy.toFixed(1)}
          unit="%"
          icon={<TrendingUp className="w-4 h-4" />}
          color="#10b981"
        />
        <StatsCard
          title="平均延迟"
          value={avgLatency.toFixed(1)}
          unit="ms"
          icon={<Clock className="w-4 h-4" />}
          color="#f59e0b"
        />
        <StatsCard
          title="错误数量"
          value={errorLogs.length}
          icon={<AlertCircle className="w-4 h-4" />}
          color="#ef4444"
        />
      </div>

      {/* 层级分布 */}
      <div className="bg-[#2d2d2d] border border-gray-700 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-300 mb-3">层级分布</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-xs text-gray-400">Layer 1 (精确匹配)</span>
            </div>
            <div className="text-xl font-bold text-white">{layerStats.layer1}</div>
            <div className="text-xs text-gray-500">
              {stats.totalCount > 0 ? ((layerStats.layer1 / stats.totalCount) * 100).toFixed(1) : 0}%
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-xs text-gray-400">Layer 2 (规则分类)</span>
            </div>
            <div className="text-xl font-bold text-white">{layerStats.layer2}</div>
            <div className="text-xs text-gray-500">
              {stats.totalCount > 0 ? ((layerStats.layer2 / stats.totalCount) * 100).toFixed(1) : 0}%
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-xs text-gray-400">Layer 3 (LLM分类)</span>
            </div>
            <div className="text-xl font-bold text-white">{layerStats.layer3}</div>
            <div className="text-xs text-gray-500">
              {stats.totalCount > 0 ? ((layerStats.layer3 / stats.totalCount) * 100).toFixed(1) : 0}%
            </div>
          </div>
        </div>
      </div>

      {/* 历史记录 */}
      <div className="bg-[#2d2d2d] border border-gray-700 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-300 mb-3">最近分类记录</h4>
        <ClassificationHistory maxItems={5} />
      </div>

      {/* 错误日志 */}
      <div className="bg-[#2d2d2d] border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            错误日志 ({errorLogs.length})
          </h4>
          {errorLogs.length > 0 && (
            <button
              onClick={() => setShowErrors(!showErrors)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {showErrors ? '收起' : '展开'}
            </button>
          )}
        </div>

        {errorLogs.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">暂无错误记录</p>
        ) : showErrors ? (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {errorLogs.map((log) => (
              <div
                key={log.id}
                className="bg-[#1e1e1e] border border-gray-700 rounded p-2 text-xs"
              >
                <div className="flex items-start justify-between mb-1">
                  <code className="text-gray-300 flex-1 truncate">{log.input}</code>
                  <span className="text-red-400 ml-2">{log.error}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500">
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  {log.layer && <span>• {log.layer}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 text-center py-4">
            点击"展开"查看错误详情
          </p>
        )}
      </div>
    </div>
  );
};

export default ToolClassificationMonitor;
