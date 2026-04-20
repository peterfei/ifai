/**
 * 技能面板 - 侧边栏技能管理界面
 */

import React, { useMemo } from 'react';
import { Puzzle, Star, Tag, Check, Loader2, Search, Filter } from 'lucide-react';
import { useSkillStore } from '@/stores/skillStore.enhanced';
import { useLayoutStore } from '@/stores/layoutStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Skill } from '../Settings/Skills/types';

export const SkillsPanel: React.FC = () => {
  const {
    availableSkills,
    activeSkillIds,
    isLoading,
    activateSkill,
    deactivateSkill,
    setSearchQuery,
    setSelectedTags,
    setStateFilter,
    ui,
  } = useSkillStore();

  const { setSkillsPanelOpen } = useLayoutStore();

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

  // 处理技能切换
  const handleToggleSkill = async (skillId: string, skillName: string) => {
    const isActive = activeSkillIds.includes(skillId);
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
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
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
          {/* 搜索按钮 */}
          <button
            className={cn(
              'p-1 rounded transition-colors',
              'text-gray-500 hover:text-white hover:bg-gray-800'
            )}
            title="搜索技能"
          >
            <Search size={14} />
          </button>
          {/* 筛选按钮 */}
          <button
            className={cn(
              'p-1 rounded transition-colors',
              'text-gray-500 hover:text-white hover:bg-gray-800'
            )}
            title="筛选技能"
          >
            <Filter size={14} />
          </button>
        </div>
      </div>

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
                  'hover:border-gray-600'
                )}
                onClick={() => handleToggleSkill(skill.id, skill.name)}
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
                    {skill.author && (
                      <span className="text-[10px] text-gray-600">
                        {skill.author}
                      </span>
                    )}
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
          <span>
            激活: {activeSkillIds.length}
          </span>
          <span>
            总计: {availableSkills.length}
          </span>
        </div>
      </div>
    </div>
  );
};
