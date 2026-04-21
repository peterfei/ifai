/**
 * 工具分类主面板组件
 *
 * 集成所有工具分类功能的完整UI面板
 */

import React, { useState, useRef, useEffect } from 'react';
import { BarChart3, Clock3, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { ToolCategoryIcon } from './ToolCategoryIcon';

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
  icon?: React.ReactNode;
  /** 颜色 */
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  description,
  icon,
  color = 'var(--accent-color)',
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
        <span className="theme-text-subtle text-3xl opacity-60">
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
  const { t } = useTranslation();
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
  const getCategoryLabel = (category: ToolCategory) => {
    const keyMap: Record<ToolCategory, string> = {
      file_operations: 'toolClassificationHistory.categories.fileOperations',
      code_generation: 'toolClassificationHistory.categories.codeGeneration',
      code_analysis: 'toolClassificationHistory.categories.codeAnalysis',
      terminal_commands: 'toolClassificationHistory.categories.terminalCommands',
      ai_chat: 'toolClassificationHistory.categories.aiChat',
      search_operations: 'toolClassificationHistory.categories.searchOperations',
      no_tool_needed: 'toolClassificationHistory.categories.noToolNeeded',
    };
    return t(keyMap[category] as any);
  };
  const getLayerLabel = (layer: ClassificationLayer) => t(`toolClassificationHistory.layers.${layer}` as any);

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
              ? 'border-b-2 border-[var(--accent-color)] text-[var(--accent-color)]'
              : 'theme-text-muted hover:text-[var(--text-primary)]'
          }`}
        >
          {t('toolClassificationPanel.tabs.classify')}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'border-b-2 border-[var(--accent-color)] text-[var(--accent-color)]'
              : 'theme-text-muted hover:text-[var(--text-primary)]'
          }`}
        >
          {t('toolClassificationPanel.tabs.history')}
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'stats'
              ? 'border-b-2 border-[var(--accent-color)] text-[var(--accent-color)]'
              : 'theme-text-muted hover:text-[var(--text-primary)]'
          }`}
        >
          {t('toolClassificationPanel.tabs.stats')}
        </button>
      </div>

      {/* 分类测试标签 */}
      {activeTab === 'classify' && (
        <div className="flex flex-col gap-4">
          {/* 输入框 */}
          <div className="flex flex-col gap-2">
            <label className="theme-text-muted text-sm font-medium">
              {t('toolClassificationPanel.inputLabel')}
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
                placeholder={t('toolClassificationPanel.inputPlaceholder')}
                className="theme-input-surface theme-border theme-text theme-focus-accent flex-1 rounded-lg border px-3 py-2 placeholder:opacity-70"
              />
              <button
                onClick={handleClassify}
                disabled={isClassifying || !input.trim()}
                className="theme-button-primary rounded-lg px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isClassifying ? t('toolClassificationPanel.classifying') : t('toolClassificationPanel.classify')}
              </button>
            </div>

            {/* 实时指示器 */}
            <ToolIndicator input={input} enabled debounceMs={800} />
          </div>

          {/* 当前结果 */}
          {currentResult && (
            <div className="theme-panel-muted theme-border rounded-lg border p-4">
              <h3 className="theme-text-muted mb-2 text-sm font-medium">
                {t('toolClassificationPanel.result')}
              </h3>
              <ClassificationBadge result={currentResult} showConfidence showLayer />
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="theme-surface-danger rounded-lg p-3">
              <p className="theme-text-danger text-sm">{error}</p>
            </div>
          )}

          {/* 批量测试按钮 */}
          <div className="flex gap-2">
            <button
              onClick={handleBenchmark}
              className="theme-button-primary rounded-lg px-4 py-2 font-medium transition-colors"
            >
              {t('toolClassificationPanel.runBenchmark')}
            </button>
            {stats.totalCount > 0 && (
              <button
                onClick={clearHistory}
                className="theme-button-secondary rounded-lg px-4 py-2 font-medium transition-colors"
              >
                {t('toolClassificationPanel.clearHistory')}
              </button>
            )}
          </div>

          {/* 批量测试结果 */}
          {benchmarkResults && (
            <div className="theme-panel-muted theme-border rounded-lg border p-4">
              <h3 className="theme-text-muted mb-2 text-sm font-medium">
                {t('toolClassificationPanel.benchmarkResults')}
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
              title={t('toolClassificationPanel.totalClassifications')}
              value={stats.totalCount}
              icon={<BarChart3 className="h-7 w-7" />}
              color="var(--accent-color)"
            />
            <StatCard
              title={t('toolClassificationPanel.averageConfidence')}
              value={`${(stats.averageConfidence * 100).toFixed(1)}%`}
              description={stats.averageConfidence >= 0.8 ? t('toolClassificationPanel.highAccuracy') : t('toolClassificationPanel.needsTuning')}
              icon={<Target className="h-7 w-7" />}
              color={stats.averageConfidence >= 0.8 ? 'var(--success-color)' : 'var(--warning-color)'}
            />
            <StatCard
              title={t('toolClassificationPanel.latestClassification')}
              value={stats.totalCount > 0 ? t('toolClassificationPanel.justNow') : '-'}
              description={t('toolClassificationPanel.latestClassificationDesc')}
              icon={<Clock3 className="h-7 w-7" />}
              color="var(--accent-color)"
            />
          </div>

          {/* 按类别统计 */}
          <div>
            <h3 className="theme-text-muted mb-2 text-sm font-medium">
              {t('toolClassificationPanel.byCategory')}
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
                      <ToolCategoryIcon icon={info.icon} className="h-4 w-4" />
                      <span className="theme-text text-sm">{getCategoryLabel(category as ToolCategory)}</span>
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
              {t('toolClassificationPanel.byLayer')}
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
                      {getLayerLabel(layer as ClassificationLayer)}
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
