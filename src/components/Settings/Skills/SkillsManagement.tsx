/**
 * 技能管理界面 - 完整版
 * Phase 7: 完整 UI 重构
 */

import React, { useEffect, useState } from 'react';
import {
  RefreshCw,
  Puzzle,
  Plus,
  Grid3X3,
  List,
  Settings,
  Download,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSkillStore } from '@/stores/skillStore.enhanced';
import { SkillStateIndicator, StateStatsCard, StateTransitionDiagram } from './SkillStateIndicator';
import { SkillSearchBar, TagCloud } from './SkillSearchBar';
import { SkillDetailPanel } from './SkillDetailPanel';
import type { Skill } from './types';

interface SkillsManagementProps {
  className?: string;
}

export const SkillsManagement: React.FC<SkillsManagementProps> = ({ className }) => {
  const {
    availableSkills,
    activeSkillIds,
    isLoading,
    isRefreshing,
    error,
    ui,
    stats,
    fetchSkills,
    refreshSkills,
    setSelectedSkill,
    setSearchQuery,
    setSelectedTags,
    setStateFilter,
    setSortBy,
    setViewMode,
    toggleDetails,
    openEditor,
    openInstaller,
    getFilteredSkills,
  } = useSkillStore();

  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [filteredSkills, setFilteredSkills] = useState<Skill[]>([]);

  useEffect(() => {
    if (availableSkills.length === 0) {
      fetchSkills();
    }
  }, []);

  // 🔥 FIX: 当availableSkills或ui变化时，重新计算filteredSkills
  useEffect(() => {
    const result = getFilteredSkills();
    setFilteredSkills(result);
  }, [availableSkills, ui, getFilteredSkills]);

  const allTags = Array.from(new Set(availableSkills.flatMap(s => s.tags)));

  const toggleBatchSelection = (id: string) => {
    const newSet = new Set(selectedForBatch);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedForBatch(newSet);
    setShowBatchActions(newSet.size > 0);
  };

  const selectAll = () => {
    setSelectedForBatch(new Set(filteredSkills.map(s => s.id)));
    setShowBatchActions(true);
  };

  const clearSelection = () => {
    setSelectedForBatch(new Set());
    setShowBatchActions(false);
  };

  return (
    <>
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Puzzle size={24} className="text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-white">技能中心</h1>
            <p className="text-xs text-gray-500">管理 AI 技能插件</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 刷新按钮 */}
          <button
            onClick={() => refreshSkills()}
            disabled={isRefreshing}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
              'bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700',
              'disabled:opacity-50'
            )}
          >
            <RefreshCw size={18} className={cn(isRefreshing && 'animate-spin')} />
            <span>刷新</span>
          </button>

          {/* 视图切换 */}
          <div className="flex items-center bg-gray-900 rounded-lg border border-gray-700">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-2 rounded-l-lg transition-all',
                ui.viewMode === 'grid'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              )}
            >
              <Grid3X3 size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 rounded-r-lg transition-all',
                ui.viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              )}
            >
              <List size={18} />
            </button>
          </div>

          {/* 设置按钮 */}
          <button className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 transition-colors">
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="px-6 py-4">
          <StateStatsCard stats={stats} />
        </div>
      )}

      {/* 搜索和筛选 */}
      <div className="px-6 pb-4">
        <SkillSearchBar
          searchQuery={ui.searchQuery}
          onSearchChange={setSearchQuery}
          selectedTags={ui.selectedTags}
          onTagsChange={setSelectedTags}
          availableTags={allTags}
          stateFilter={ui.stateFilter}
          onStateFilterChange={setStateFilter}
          sortBy={ui.sortBy}
          onSortChange={setSortBy}
          sortOrder={ui.sortOrder}
          onSortOrderChange={() => {
            /* TODO: 实现排序切换 */
          }}
          resultCount={filteredSkills.length}
          totalCount={availableSkills.length}
        />
      </div>

      {/* 标签云 */}
      {ui.searchQuery === '' && ui.selectedTags.length === 0 && (
        <div className="px-6 pb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-400">热门标签</h3>
          </div>
          <TagCloud
            tags={allTags}
            selectedTags={ui.selectedTags}
            onTagClick={(tag) => {
              const newTags = ui.selectedTags.includes(tag)
                ? ui.selectedTags.filter(t => t !== tag)
                : [...ui.selectedTags, tag];
              setSelectedTags(newTags);
            }}
          />
        </div>
      )}

      {/* 批量操作栏 */}
      {showBatchActions && (
        <div className="mx-6 mb-4 p-4 bg-blue-900/20 border border-blue-500/50 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedForBatch.size === filteredSkills.length}
              onChange={(e) => e.target.checked ? selectAll() : clearSelection()}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-blue-400">
              已选择 {selectedForBatch.size} 个技能
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-all">
              <Check size={16} />
              批量激活
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm transition-all">
              <X size={16} />
              取消选择
            </button>
          </div>
        </div>
      )}

      {/* 技能列表 */}
      <div className="flex-1 overflow-y-auto px-6">
        {isLoading && availableSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw size={32} className="animate-spin text-gray-600 mb-4" />
            <p className="text-gray-500">正在加载技能...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle size={48} className="text-red-500 mb-4" />
            <p className="text-red-400 mb-2">加载失败</p>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <button
              onClick={() => fetchSkills()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
            >
              重试
            </button>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-gray-700 rounded-lg bg-[#1e1e1e]">
            <Puzzle size={48} className="text-gray-600 mb-4" />
            <p className="text-gray-400 mb-2">未找到技能</p>
            <p className="text-xs text-gray-500 mb-6 text-center">
              {ui.searchQuery || ui.selectedTags.length > 0 || ui.stateFilter !== 'all'
                ? '尝试调整筛选条件'
                : '安装内置示例技能来快速开始'}
            </p>
            {ui.searchQuery === '' && ui.selectedTags.length === 0 && ui.stateFilter === 'all' && (
              <button
                onClick={openInstaller}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-all"
              >
                <Download size={18} />
                安装示例技能
              </button>
            )}
          </div>
        ) : (
          <div
            className={cn(
              'grid gap-4',
              ui.viewMode === 'grid'
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                : 'grid-cols-1'
            )}
          >
            {filteredSkills.map(skill => (
              <SkillCard
                key={skill.id}
                skill={skill}
                isActive={activeSkillIds.includes(skill.id)}
                isSelected={selectedForBatch.has(skill.id)}
                onClick={() => setSelectedSkill(skill.id)}
                onToggle={() => {
                  /* Toggle handled in store */
                }}
                onBatchToggle={() => toggleBatchSelection(skill.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 技能详情面板 */}
      {ui.selectedSkill && (
        <div className="border-t border-gray-800">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-white">技能详情</h2>
              <button
                onClick={() => setSelectedSkill(null)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            {(() => {
              const selectedSkillData = availableSkills.find(s => s.id === ui.selectedSkill);
              return selectedSkillData ? (
                <SkillDetailPanel skill={selectedSkillData} />
              ) : null;
            })()}
          </div>
        </div>
      )}
    </>
  );
};

// ==================== 技能卡片组件 ====================

interface SkillCardProps {
  skill: Skill;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
  onToggle: () => void;
  onBatchToggle: () => void;
}

const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  isActive,
  isSelected,
  onClick,
  onToggle,
  onBatchToggle,
}) => {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className={cn(
        'relative p-4 rounded-lg border transition-all cursor-pointer group',
        isActive
          ? 'bg-[#2a2d2e] border-blue-500/50 shadow-lg shadow-blue-500/5'
          : 'bg-[#1e1e1e] border-gray-700 hover:border-gray-600',
        isSelected && 'ring-2 ring-blue-500'
      )}
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* 批量选择复选框 */}
      <div
        className="absolute left-2 top-2 z-10"
        onClick={(e) => {
          e.stopPropagation();
          onBatchToggle();
        }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          className="w-4 h-4 rounded"
        />
      </div>

      {/* 技能图标 */}
      <div
        className={cn(
          'w-12 h-12 rounded-lg flex items-center justify-center mb-3 ml-6',
          isActive ? 'bg-blue-500/20' : 'bg-gray-800'
        )}
      >
        <Puzzle
          size={24}
          className={isActive ? 'text-blue-400' : 'text-gray-500'}
        />
      </div>

      {/* 技能信息 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-white truncate">{skill.name}</h3>
          <span className="px-2 py-0.5 rounded bg-gray-800 text-[10px] font-mono text-gray-400 uppercase border border-gray-700">
            v{skill.version}
          </span>
        </div>

        <p className="text-sm text-gray-400 line-clamp-2 min-h-[2.5rem]">
          {skill.description}
        </p>

        <div className="flex items-center justify-between">
          <SkillStateIndicator state={skill.state} size="sm" />

          {/* 操作按钮 */}
          <div
            className={cn(
              'flex items-center gap-2 transition-all',
              showActions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
              )}
            >
              {isActive ? '已激活' : '激活'}
            </button>
          </div>
        </div>

        {/* 标签 */}
        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {skill.tags.slice(0, 3).map(tag => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded bg-gray-800 text-[10px] text-gray-400"
              >
                {tag}
              </span>
            ))}
            {skill.tags.length > 3 && (
              <span className="px-2 py-0.5 rounded bg-gray-800 text-[10px] text-gray-500">
                +{skill.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
