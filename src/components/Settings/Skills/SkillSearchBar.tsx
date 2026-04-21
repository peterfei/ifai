/**
 * 技能搜索和筛选组件
 * Phase 7: 完整 UI 重构
 */

import React, { useState } from 'react';
import { Search, Filter, X, ChevronDown, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Skill } from './types';

interface SkillSearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  availableTags: string[];
  stateFilter: 'all' | 'active' | 'installed' | 'inactive' | 'error';
  onStateFilterChange: (filter: 'all' | 'active' | 'installed' | 'inactive' | 'error') => void;
  sortBy: 'name' | 'version' | 'status' | 'author';
  onSortChange: (sort: 'name' | 'version' | 'status' | 'author') => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: () => void;
  resultCount: number;
  totalCount: number;
  className?: string;
}

export const SkillSearchBar: React.FC<SkillSearchBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedTags,
  onTagsChange,
  availableTags,
  stateFilter,
  onStateFilterChange,
  sortBy,
  onSortChange,
  sortOrder,
  onSortOrderChange,
  resultCount,
  totalCount,
  className,
}) => {
  const [showFilter, setShowFilter] = useState(false);
  const [showTags, setShowTags] = useState(false);

  const stateOptions = [
    { value: 'all', label: '全部状态' },
    { value: 'active', label: '已激活' },
    { value: 'installed', label: '已安装' },
    { value: 'inactive', label: '未激活' },
    { value: 'error', label: '错误' },
  ];

  const sortOptions = [
    { value: 'name', label: '名称' },
    { value: 'version', label: '版本' },
    { value: 'status', label: '状态' },
    { value: 'author', label: '作者' },
  ];

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const clearFilters = () => {
    onSearchChange('');
    onTagsChange([]);
    onStateFilterChange('all');
  };

  const hasActiveFilters = searchQuery || selectedTags.length > 0 || stateFilter !== 'all';

  return (
    <div className={cn('space-y-3', className)}>
      {/* 主搜索栏 */}
      <div className="flex items-center gap-3">
        {/* 搜索输入框 */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索技能名称、ID 或描述..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* 筛选按钮 */}
        <button
          onClick={() => setShowFilter(!showFilter)}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all',
            showFilter || hasActiveFilters
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
          )}
        >
          <Filter size={18} />
          <span>筛选</span>
          {hasActiveFilters && (
            <span className="w-2 h-2 bg-blue-400 rounded-full" />
          )}
        </button>

        {/* 结果计数 */}
        <div className="text-sm text-gray-500">
          {resultCount} / {totalCount} 个技能
        </div>
      </div>

      {/* 展开的筛选面板 */}
      {showFilter && (
        <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg space-y-4">
          {/* 状态筛选 */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-400">状态:</span>
            <div className="flex gap-2">
              {stateOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => onStateFilterChange(option.value as any)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm transition-all',
                    stateFilter === option.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 排序选项 */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-400">排序:</span>
            <div className="flex gap-2">
              {sortOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => onSortChange(option.value as any)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm transition-all',
                    sortBy === option.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  )}
                >
                  {option.label}
                </button>
              ))}
              <button
                onClick={onSortOrderChange}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm transition-all',
                  'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                {sortOrder === 'asc' ? '↑ 升序' : '↓ 降序'}
              </button>
            </div>
          </div>

          {/* 标签筛选 */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-400">标签:</span>
            <div className="flex flex-wrap gap-2">
              {availableTags.slice(0, 5).map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all',
                    selectedTags.includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  )}
                >
                  <Tag size={14} />
                  {tag}
                  {selectedTags.includes(tag) && (
                    <X size={14} className="ml-1" />
                  )}
                </button>
              ))}
              {availableTags.length > 5 && (
                <button
                  onClick={() => setShowTags(!showTags)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-400 hover:bg-gray-700"
                >
                  <ChevronDown size={14} />
                  {showTags ? '收起' : `+${availableTags.length - 5} 个`}
                </button>
              )}
            </div>
          </div>

          {/* 清除筛选 */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              清除所有筛选
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== 标签云组件 ====================

interface TagCloudProps {
  tags: string[];
  selectedTags: string[];
  onTagClick: (tag: string) => void;
  maxTags?: number;
  className?: string;
}

export const TagCloud: React.FC<TagCloudProps> = ({
  tags,
  selectedTags,
  onTagClick,
  maxTags = 20,
  className,
}) => {
  const sortedTags = tags
    .map(tag => ({
      tag,
      count: Math.random(), // TODO: 从 store 获取实际计数
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxTags);

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {sortedTags.map(({ tag, count }) => (
        <button
          key={tag}
          onClick={() => onTagClick(tag)}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm transition-all',
            'hover:scale-105 active:scale-95',
            selectedTags.includes(tag)
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          )}
        >
          <span className="font-medium">{tag}</span>
          <span className="ml-1.5 text-xs opacity-60">({count})</span>
        </button>
      ))}
    </div>
  );
};
