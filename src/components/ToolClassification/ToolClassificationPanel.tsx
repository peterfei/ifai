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
  <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold mt-1" style={{ color }}>
          {value}
        </p>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{description}</p>
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
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('classify')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'classify'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          🔍 分类测试
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          📜 历史记录
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'stats'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
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
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleClassify}
                disabled={isClassifying || !input.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {isClassifying ? '分析中...' : '分类'}
              </button>
            </div>

            {/* 实时指示器 */}
            <ToolIndicator input={input} enabled debounceMs={800} />
          </div>

          {/* 当前结果 */}
          {currentResult && (
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                分类结果
              </h3>
              <ClassificationBadge result={currentResult} showConfidence showLayer />
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* 批量测试按钮 */}
          <div className="flex gap-2">
            <button
              onClick={handleBenchmark}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
            >
              🧪 运行批量测试
            </button>
            {stats.totalCount > 0 && (
              <button
                onClick={clearHistory}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                🗑️ 清空历史
              </button>
            )}
          </div>

          {/* 批量测试结果 */}
          {benchmarkResults && (
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                批量测试结果
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {benchmarkResults.results.map((result: any, index: number) => (
                  <div
                    key={index}
                    className="p-2 rounded bg-white dark:bg-gray-900 text-xs"
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
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              按类别统计
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(stats.byCategory).map(([category, count]) => {
                const info = TOOL_CATEGORY_DISPLAY_INFO[category as ToolCategory];
                return (
                  <div
                    key={category}
                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-700"
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
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              按层级统计
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(stats.byLayer).map(([layer, count]) => {
                const info = LAYER_DISPLAY_INFO[layer as ClassificationLayer];
                return (
                  <div
                    key={layer}
                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {info.label}
                    </div>
                    <p className="text-2xl font-bold mt-1" style={{ color: info.color }}>
                      {count}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{info.targetLatency}</p>
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
