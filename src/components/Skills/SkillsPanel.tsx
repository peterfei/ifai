/**
 * 技能面板 - 侧边栏技能管理界面
 *
 * @deprecated 新技能市场使用 SkillMarketModal 全屏弹窗，
 *             此面板保留仅用于向后兼容，后续版本将移除。
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Puzzle, Star, Tag, Check, Loader2, Search, Filter, X, ChevronLeft, Eye, Download, Trash2, BookOpen, Users, Award, Clock, ShoppingCart } from 'lucide-react';
import { useSkillStore } from '@/stores/skillStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useFileStore } from '@/stores/fileStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { invoke } from '@tauri-apps/api/core';
import type { Skill } from '../Settings/Skills/types';

export const SkillsPanel: React.FC = () => {
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState('');

  const {
    availableSkills,
    activeSkillIds,
    isLoading,
    activateSkill,
    deactivateSkill,
    installSkill,
    uninstallSkill,
    fetchSkills,
    setSearchQuery,
    setSelectedTags,
    setStateFilter,
    ui,
  } = useSkillStore();

  const { setSkillsPanelOpen, setSkillMarketOpen } = useLayoutStore();
  const rootPath = useFileStore(state => state.rootPath);

  // 初始化时加载技能
  useEffect(() => {
    if (!isInitialized && rootPath) {
      fetchSkills();
      setIsInitialized(true);
    }
  }, [rootPath, isInitialized, fetchSkills]);

  // 过滤技能
  const filteredSkills = useMemo(() => {
    let skills = [...availableSkills];

    // 搜索过滤
    if (ui.searchQuery) {
      const query = ui.searchQuery.toLowerCase();
      skills = skills.filter(skill =>
        skill.name.toLowerCase().includes(query) ||
        skill.id.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query)
      );
    }

    // 标签过滤
    if (ui.selectedTags.length > 0) {
      skills = skills.filter(skill =>
        ui.selectedTags.some(tag => skill.tags.includes(tag))
      );
    }

    // 状态过滤
    if (ui.stateFilter !== 'all') {
      skills = skills.filter(skill => {
        switch (ui.stateFilter) {
          case 'active':
            return skill.state.type === 'Active';
          case 'installed':
            return skill.state.type === 'Installed' || skill.state.type === 'Active';
          case 'inactive':
            return skill.state.type === 'Inactive' || skill.state.type === 'NotInstalled';
          case 'error':
            return skill.state.type === 'Error';
          default:
            return true;
        }
      });
    }

    return skills;
  }, [availableSkills, ui]);

  // 获取状态样式
  const getStatusStyle = (skill: Skill) => {
    const isActive = activeSkillIds.includes(skill.id);
    if (isActive) {
      return {
        bgColor: 'bg-blue-600/10',
        borderColor: 'border-blue-500/30',
        iconColor: 'text-blue-400',
        statusText: '已激活',
      };
    }
    return {
      bgColor: 'bg-gray-800/30',
      borderColor: 'border-gray-700/50',
      iconColor: 'text-gray-500',
      statusText: '未激活',
    };
  };

  // 处理技能激活/停用
  const handleToggleSkill = async (skillId: string, skillName: string) => {
    const isActive = activeSkillIds.includes(skillId);
    setActivating(skillId);
    try {
      if (isActive) {
        toast.loading(`正在停用技能: ${skillName}...`, { id: `skill-${skillId}` });
        await deactivateSkill(skillId);
        toast.success(`技能 "${skillName}" 已停用`, { id: `skill-${skillId}` });
      } else {
        toast.loading(`正在激活技能: ${skillName}...`, { id: `skill-${skillId}` });
        await activateSkill(skillId);
        toast.success(`技能 "${skillName}" 已激活`, { id: `skill-${skillId}` });
      }
    } catch (error) {
      toast.error(`操作失败: ${error instanceof Error ? error.message : '未知错误'}`, {
        id: `skill-${skillId}`,
      });
    } finally {
      setActivating(null);
    }
  };

  // 处理技能卸载
  const handleUninstall = async (skill: Skill) => {
    if (!rootPath) {
      toast.error('请先打开一个项目');
      return;
    }

    const confirmed = confirm(`确定要卸载 "${skill.name}" 技能吗？`);
    if (!confirmed) return;

    setUninstalling(skill.id);
    try {
      toast.loading(`正在卸载技能: ${skill.name}...`, { id: `uninstall-${skill.id}` });
      await invoke('uninstall_skill', {
        projectRoot: rootPath,
        skillId: skill.id,
      });
      await fetchSkills();
      toast.success(`技能 "${skill.name}" 已卸载`, { id: `uninstall-${skill.id}` });
      setSelectedSkill(null);
    } catch (error: any) {
      toast.error(`卸载失败: ${error.message || error}`, { id: `uninstall-${skill.id}` });
    } finally {
      setUninstalling(null);
    }
  };

  // 使用分栏布局，类似 PromptManager
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* 左侧：技能列表 */}
      <div className="flex flex-col h-full bg-gray-900 w-72 flex-shrink-0">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-900/40 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Puzzle size={16} className="text-purple-400" />
            <span className="text-gray-400 text-[10px] font-bold uppercase tracking-[0.1em]">
              技能
            </span>
            <span className="text-gray-600 text-[10px]">
              ({activeSkillIds.length}/{availableSkills.length})
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* 技能市场按钮 */}
            <button
              onClick={() => setSkillMarketOpen(true)}
              className={cn(
                'p-1 rounded transition-colors',
                'text-purple-400 hover:text-purple-300 hover:bg-gray-800'
              )}
              title="技能市场"
            >
              <ShoppingCart size={14} />
            </button>
            {/* 搜索按钮 */}
            <button
              onClick={() => {
                setShowSearch(!showSearch);
                setShowFilter(false);
              }}
              className={cn(
                'p-1 rounded transition-colors',
                showSearch ? 'text-blue-400 bg-gray-800' : 'text-gray-500 hover:text-white hover:bg-gray-800'
              )}
              title="搜索技能"
            >
              <Search size={14} />
            </button>
            {/* 筛选按钮 */}
            <button
              onClick={() => {
                setShowFilter(!showFilter);
                setShowSearch(false);
              }}
              className={cn(
                'p-1 rounded transition-colors',
                showFilter ? 'text-blue-400 bg-gray-800' : 'text-gray-500 hover:text-white hover:bg-gray-800'
              )}
              title="筛选技能"
            >
              <Filter size={14} />
            </button>
          </div>
        </div>

        {/* 搜索框 */}
        {showSearch && (
          <div className="px-4 py-2 border-b border-gray-700 bg-gray-900/20">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={localSearchQuery}
                onChange={(e) => {
                  setLocalSearchQuery(e.target.value);
                  setSearchQuery(e.target.value);
                }}
                placeholder="搜索技能..."
                className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
              />
              {localSearchQuery && (
                <button
                  onClick={() => {
                    setLocalSearchQuery('');
                    setSearchQuery('');
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-700 text-gray-400"
                  title="清空搜索"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 筛选选项 */}
        {showFilter && (
          <div className="px-4 py-2 border-b border-gray-700 bg-gray-900/20">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400">状态：</span>
              <button
                onClick={() => setStateFilter('all')}
                className={cn(
                  'px-2 py-1 rounded text-xs transition-colors',
                  ui.stateFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                全部
              </button>
              <button
                onClick={() => setStateFilter('active')}
                className={cn(
                  'px-2 py-1 rounded text-xs transition-colors',
                  ui.stateFilter === 'active'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                已激活
              </button>
              <button
                onClick={() => setStateFilter('installed')}
                className={cn(
                  'px-2 py-1 rounded text-xs transition-colors',
                  ui.stateFilter === 'installed'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                已安装
              </button>
              <button
                onClick={() => setStateFilter('inactive')}
                className={cn(
                  'px-2 py-1 rounded text-xs transition-colors',
                  ui.stateFilter === 'inactive'
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                未激活
              </button>
            </div>
          </div>
        )}

        {/* 技能列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading && availableSkills.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 size={24} className="animate-spin mr-2" />
              <span className="text-sm">加载技能中...</span>
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <Puzzle size={32} className="mb-2 opacity-50" />
              <p className="text-sm">未找到匹配的技能</p>
            </div>
          ) : (
            filteredSkills.map((skill) => {
              const status = getStatusStyle(skill);
              const isActive = activeSkillIds.includes(skill.id);

              return (
                <div
                  key={skill.id}
                  className={cn(
                    'p-3 rounded-lg border transition-all cursor-pointer group',
                    status.bgColor,
                    status.borderColor,
                    selectedSkill?.id === skill.id && 'ring-2 ring-purple-500',
                    'hover:border-gray-600'
                  )}
                  onClick={() => setSelectedSkill(skill)}
                >
                  <div className="flex items-start gap-3">
                    {/* 图标 */}
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                        isActive ? 'bg-purple-600/20' : 'bg-gray-800'
                      )}
                    >
                      <Puzzle size={16} className={status.iconColor} />
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-white truncate">
                          {skill.name}
                        </h4>
                        {isActive && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400 text-[10px]">
                            <Check size={8} />
                            激活
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                        {skill.description}
                      </p>

                      {/* 标签 */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {skill.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-800/50 text-gray-500 text-[10px]"
                          >
                            <Tag size={8} />
                            {tag}
                          </span>
                        ))}
                        {skill.tags.length > 3 && (
                          <span className="text-[10px] text-gray-600">
                            +{skill.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 版本 */}
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] text-gray-600">
                        v{skill.version}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部统计 */}
        <div className="px-4 py-2 border-t border-gray-700 bg-gray-900/40">
          <div className="flex items-center justify-between text-[10px] text-gray-500">
            <div className="flex items-center gap-3">
              <span>
                激活: {activeSkillIds.length}
              </span>
              <span>
                总计: {availableSkills.length}
              </span>
              {(ui.searchQuery || ui.selectedTags.length > 0 || ui.stateFilter !== 'all') && (
                <span className="text-blue-400">
                  显示: {filteredSkills.length}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：技能详情面板 */}
      {selectedSkill ? (
        <div className="flex-1 flex flex-col h-full bg-gray-900 border-l border-gray-700">
          {/* 详情头部 */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 bg-gray-900/40 backdrop-blur-md">
            <button
              onClick={() => setSelectedSkill(null)}
              className="p-1 rounded hover:bg-gray-800 text-gray-400"
              title="关闭"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Puzzle size={16} className="text-purple-400 flex-shrink-0" />
              <h3 className="text-sm font-bold text-white truncate">{selectedSkill.name}</h3>
            </div>
          </div>

          {/* 详情内容 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 基本信息 */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{selectedSkill.id}</span>
                  <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-xs">
                    v{selectedSkill.version}
                  </span>
                  {activeSkillIds.includes(selectedSkill.id) && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400 text-xs">
                      <Check size={8} />
                      已激活
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{selectedSkill.description}</p>
                {selectedSkill.author && (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Users size={12} />
                    <span>作者: {selectedSkill.author}</span>
                  </div>
                )}
              </div>
            </div>

            {/* System Prompt */}
            {selectedSkill.system_prompt && (
              <div>
                <h4 className="text-xs font-medium text-gray-400 mb-2">System Prompt</h4>
                <div className="bg-gray-800 rounded p-3 max-h-40 overflow-y-auto">
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                    {selectedSkill.system_prompt.substring(0, 500)}
                    {selectedSkill.system_prompt.length > 500 && '...'}
                  </pre>
                </div>
              </div>
            )}

            {/* 标签 */}
            {selectedSkill.tags.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-400 mb-2">标签</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSkill.tags.map(tag => (
                    <span
                      key={tag}
                      className="px-2 py-1 rounded-full bg-blue-600/20 text-blue-400 text-xs flex items-center gap-1"
                    >
                      <Tag size={10} />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 依赖 */}
            {selectedSkill.dependencies && selectedSkill.dependencies.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-400 mb-2">依赖</h4>
                <div className="flex flex-wrap gap-1">
                  {selectedSkill.dependencies.map(dep => (
                    <span
                      key={dep}
                      className="px-2 py-1 rounded bg-gray-800 text-gray-400 text-xs font-mono"
                    >
                      {dep}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleToggleSkill(selectedSkill.id, selectedSkill.name)}
                disabled={activating !== null}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all',
                  activeSkillIds.includes(selectedSkill.id)
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {activating === selectedSkill.id ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    处理中...
                  </>
                ) : activeSkillIds.includes(selectedSkill.id) ? (
                  <>
                    <X size={16} />
                    停用技能
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    激活技能
                  </>
                )}
              </button>

              {activeSkillIds.includes(selectedSkill.id) && (
                <button
                  onClick={() => handleUninstall(selectedSkill)}
                  disabled={uninstalling !== null}
                  className={cn(
                    'flex items-center justify-center gap-2 px-3 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-all',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                  title="卸载技能"
                >
                  {uninstalling === selectedSkill.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

