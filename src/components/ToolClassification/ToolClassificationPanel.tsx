/**
 * 工具分类主面板组件
 *
 * 集成所有工具分类功能的完整UI面板
 */

import React, { useState, useRef, useEffect } from 'react';
import { useToolClassificationStore } from '@/stores/toolClassificationStore';
import { useClassificationStats } from '@/stores/toolClassificationStore';
import ToolIndicator from './ToolIndicator';
import ClassificationHistory from './ClassificationHistory';
import ClassificationBadge from './ClassificationBadge';
import { toolClassificationService } from '@/services/toolClassificationService';
import type { ToolCategory, ClassificationLayer } from '@/types/toolClassification';
import {
  TOOL_CATEGORY_DISPLAY_INFO,
  LAYER_DISPLAY_INFO,
} from '@/types/toolClassification';

/**
 * 统计卡片组件
 */
interface StatCardProps {
  /** 标题 */
  title: string;
  /** 数值 */
  value: number | string;
  /** 描述 */
  description?: string;
  /** 图标 */
  icon?: string;
  /** 颜色 */
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  description,
  icon,
  color = '#3b82f6',
}) => (
  <div className="theme-panel-muted theme-border rounded-lg border p-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="theme-text-muted text-sm">{title}</p>
        <p className="text-2xl font-bold mt-1" style={{ color }}>
          {value}
        </p>
        {description && (
          <p className="theme-text-subtle mt-1 text-xs">{description}</p>
        )}
      </div>
      {icon && (
        <span className="text-3xl opacity-50" role="img">
          {icon}
        </span>
      )}
    </div>
  </div>
);

/**
 * 工具分类面板标签
 */
type TabType = 'classify' | 'history' | 'stats';

/**
 * 主面板组件
 */
interface ToolClassificationPanelProps {
  /** 自定义类名 */
  className?: string;
  /** 默认标签 */
  defaultTab?: TabType;
}

export const ToolClassificationPanel: React.FC<ToolClassificationPanelProps> = ({
  className = '',
  defaultTab = 'classify',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);
  const [input, setInput] = useState('');
  const [benchmarkResults, setBenchmarkResults] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    classify,
    batchClassify,
    clearHistory,
    currentResult,
    isClassifying,
    error,
  } = useToolClassificationStore();

  const stats = useClassificationStats();

  // 聚焦输入框
  useEffect(() => {
    if (activeTab === 'classify' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeTab]);

  // 处理分类
  const handleClassify = async () => {
    if (!input.trim()) return;
    try {
      await classify(input.trim());
    } catch (err) {
      console.error('分类失败:', err);
    }
  };

  // 处理批量测试
  const handleBenchmark = async () => {
    const testInputs = [
      '读取文件',
      '生成函数',
      'git status',
      '查找代码',
      '什么是闭包',
      '分析性能',
      '创建组件',
      'npm install',
    ];

    try {
      const results = await batchClassify(testInputs);
      setBenchmarkResults({
        total: testInputs.length,
        results,
      });
    } catch (err) {
      console.error('批量测试失败:', err);
    }
  };

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* 标签切换 */}
      <div className="theme-border flex border-b">
        <button
          onClick={() => setActiveTab('classify')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'classify'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'theme-text-muted hover:text-[var(--text-primary)]'
          }`}
        >
          🔍 分类测试
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'theme-text-muted hover:text-[var(--text-primary)]'
          }`}
        >
          📜 历史记录
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'stats'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'theme-text-muted hover:text-[var(--text-primary)]'
          }`}
        >
          📊 统计信息
        </button>
      </div>

      {/* 分类测试标签 */}
      {activeTab === 'classify' && (
        <div className="flex flex-col gap-4">
          {/* 输入框 */}
          <div className="flex flex-col gap-2">
            <label className="theme-text-muted text-sm font-medium">
              输入要分类的文本
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleClassify();
                  }
                }}
                placeholder="例如：读取文件、生成函数、git status..."
                className="theme-input-surface theme-border theme-text flex-1 rounded-lg border px-3 py-2 placeholder:opacity-70 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <button
                onClick={handleClassify}
                disabled={isClassifying || !input.trim()}
                className="theme-button-primary rounded-lg px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isClassifying ? '分析中...' : '分类'}
              </button>
            </div>

            {/* 实时指示器 */}
            <ToolIndicator input={input} enabled debounceMs={800} />
          </div>

          {/* 当前结果 */}
          {currentResult && (
            <div className="theme-panel-muted theme-border rounded-lg border p-4">
              <h3 className="theme-text-muted mb-2 text-sm font-medium">
                分类结果
              </h3>
              <ClassificationBadge result={currentResult} showConfidence showLayer />
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* 批量测试按钮 */}
          <div className="flex gap-2">
            <button
              onClick={handleBenchmark}
              className="theme-button-success rounded-lg px-4 py-2 font-medium transition-colors"
            >
              运行批量测试
            </button>
            {stats.totalCount > 0 && (
              <button
                onClick={clearHistory}
                className="theme-button-secondary rounded-lg px-4 py-2 font-medium transition-colors"
              >
                清空历史
              </button>
            )}
          </div>

          {/* 批量测试结果 */}
          {benchmarkResults && (
            <div className="theme-panel-muted theme-border rounded-lg border p-4">
              <h3 className="theme-text-muted mb-2 text-sm font-medium">
                批量测试结果
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {benchmarkResults.results.map((result: any, index: number) => (
                  <div
                    key={index}
                    className="theme-code-surface theme-border rounded border p-2 text-xs"
                  >
                    <ClassificationBadge result={result} compact />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 历史记录标签 */}
      {activeTab === 'history' && (
        <ClassificationHistory
          maxItems={50}
          onItemClick={(item) => {
            setInput(item.input);
            setActiveTab('classify');
          }}
        />
      )}

      {/* 统计信息标签 */}
      {activeTab === 'stats' && (
        <div className="flex flex-col gap-4">
          {/* 总体统计 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="总分类数"
              value={stats.totalCount}
              icon="📊"
              color="#3b82f6"
            />
            <StatCard
              title="平均置信度"
              value={`${(stats.averageConfidence * 100).toFixed(1)}%`}
              description={stats.averageConfidence >= 0.8 ? '高准确率' : '需优化'}
              icon="🎯"
              color={stats.averageConfidence >= 0.8 ? '#22c55e' : '#f59e0b'}
            />
            <StatCard
              title="最近分类"
              value={stats.totalCount > 0 ? '刚刚' : '-'}
              description="最新一次分类时间"
              icon="⏱️"
              color="#8b5cf6"
            />
          </div>

          {/* 按类别统计 */}
          <div>
            <h3 className="theme-text-muted mb-2 text-sm font-medium">
              按类别统计
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(stats.byCategory).map(([category, count]) => {
                const info = TOOL_CATEGORY_DISPLAY_INFO[category as ToolCategory];
                return (
                  <div
                    key={category}
                    className="theme-panel-muted theme-border rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span role="img">{info.icon}</span>
                      <span className="text-sm">{info.label}</span>
                    </div>
                    <p className="text-2xl font-bold mt-1" style={{ color: info.color }}>
                      {count}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 按层级统计 */}
          <div>
            <h3 className="theme-text-muted mb-2 text-sm font-medium">
              按层级统计
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(stats.byLayer).map(([layer, count]) => {
                const info = LAYER_DISPLAY_INFO[layer as ClassificationLayer];
                return (
                  <div
                    key={layer}
                    className="theme-panel-muted theme-border rounded-lg border p-3"
                  >
                    <div className="theme-text-muted text-xs">
                      {info.label}
                    </div>
                    <p className="text-2xl font-bold mt-1" style={{ color: info.color }}>
                      {count}
                    </p>
                    <p className="theme-text-subtle mt-1 text-xs">{info.targetLatency}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolClassificationPanel;
