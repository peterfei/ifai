/**
 * 分类历史记录组件
 *
 * 显示工具分类的历史记录，支持筛选和删除
 */

import React, { useState, useMemo } from 'react';
import { useHistoryItems, useClassificationStats, useToolClassificationStore } from '@/stores/toolClassificationStore';
import ClassificationBadge from './ClassificationBadge';
import type { ToolCategory, ClassificationLayer, ClassificationHistoryItem } from '@/types/toolClassification';
import { getToolCategoryDisplayInfo, getLayerDisplayInfo } from '@/types/toolClassification';

/**
 * 历史记录项组件
 */
interface HistoryItemProps {
  /** 历史记录项 */
  item: ClassificationHistoryItem;
  /** 删除回调 */
  onDelete?: (id: string) => void;
  /** 点击回调 */
  onClick?: (item: ClassificationHistoryItem) => void;
}

const HistoryItem: React.FC<HistoryItemProps> = ({ item, onDelete, onClick }) => {
  const categoryInfo = getToolCategoryDisplayInfo(item.result.category);
  const layerInfo = getLayerDisplayInfo(item.result.layer);
  const timeAgo = getTimeAgo(item.timestamp);

  return (
    <div
      className="group p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
      onClick={() => onClick?.(item)}
    >
      {/* 输入文本 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {item.input}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {timeAgo} · {item.latencyMs.toFixed(1)}ms
          </p>
        </div>

        {/* 删除按钮 */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
            title="删除"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 分类结果 */}
      <div className="mt-2 flex items-center gap-2">
        <ClassificationBadge result={item.result} compact showConfidence={false} />
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: layerInfo.color }}
          title={layerInfo.label}
        />
      </div>
    </div>
  );
};

/**
 * 获取相对时间
 */
function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return `${seconds}秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  return `${Math.floor(seconds / 86400)}天前`;
}

/**
 * 历史记录组件
 */
interface ClassificationHistoryProps {
  /** 最大显示数量 */
  maxItems?: number;
  /** 自定义类名 */
  className?: string;
  /** 点击项目回调 */
  onItemClick?: (item: HistoryItemProps['item']) => void;
}

export const ClassificationHistory: React.FC<ClassificationHistoryProps> = ({
  maxItems = 20,
  className = '',
  onItemClick,
}) => {
  const history = useHistoryItems();
  const { removeHistoryItem, clearHistory } = useToolClassificationStore();
  const stats = useClassificationStats();

  // 筛选状态
  const [categoryFilter, setCategoryFilter] = useState<ToolCategory | 'all'>('all');
  const [layerFilter, setLayerFilter] = useState<ClassificationLayer | 'all'>('all');

  // 过滤后的历史记录
  const filteredHistory = useMemo(() => {
    let filtered = history.slice(0, maxItems);

    if (categoryFilter !== 'all') {
      filtered = filtered.filter((item) => item.result.category === categoryFilter);
    }

    if (layerFilter !== 'all') {
      filtered = filtered.filter((item) => item.result.layer === layerFilter);
    }

    return filtered;
  }, [history, maxItems, categoryFilter, layerFilter]);

  if (history.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-gray-500 dark:text-gray-400">暂无分类历史</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* 统计信息和筛选器 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          共 <span className="font-semibold">{stats.totalCount}</span> 条记录
        </div>

        <div className="flex gap-2">
          {/* 类别筛选 */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ToolCategory | 'all')}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-transparent dark:text-gray-200"
          >
            <option value="all">所有类别</option>
            <option value="file_operations">文件操作</option>
            <option value="code_generation">代码生成</option>
            <option value="code_analysis">代码分析</option>
            <option value="terminal_commands">终端命令</option>
            <option value="ai_chat">AI 对话</option>
            <option value="search_operations">搜索操作</option>
            <option value="no_tool_needed">无需工具</option>
          </select>

          {/* 层级筛选 */}
          <select
            value={layerFilter}
            onChange={(e) => setLayerFilter(e.target.value as ClassificationLayer | 'all')}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-transparent dark:text-gray-200"
          >
            <option value="all">所有层级</option>
            <option value="layer1">Layer 1 (精确匹配)</option>
            <option value="layer2">Layer 2 (规则分类)</option>
            <option value="layer3">Layer 3 (LLM 分类)</option>
          </select>
        </div>
      </div>

      {/* 历史记录列表 */}
      <div className="flex flex-col gap-2">
        {filteredHistory.map((item) => (
          <HistoryItem
            key={item.id}
            item={item}
            onDelete={removeHistoryItem}
            onClick={onItemClick}
          />
        ))}
      </div>

      {/* 清空按钮 */}
      {history.length > 0 && (
        <button
          onClick={() => {
            if (confirm('确定要清空所有历史记录吗？')) {
              clearHistory();
            }
          }}
          className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
        >
          清空历史
        </button>
      )}
    </div>
  );
};

/**
 * 紧凑模式历史记录（仅显示最近几条）
 */
export const CompactHistory: React.FC<{ maxItems?: 4 | 8 | 12; className?: string }> = ({
  maxItems = 4,
  className = '',
}) => {
  const history = useHistoryItems();

  if (history.length === 0) return null;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {history.slice(0, maxItems).map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <ClassificationBadge result={item.result} compact showConfidence={false} />
          <span className="text-gray-500 truncate">{item.input}</span>
        </div>
      ))}
    </div>
  );
};

export default ClassificationHistory;
