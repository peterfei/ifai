/**
 * 技能列表坞 - 显示在左下角
 * 功能：激活/停用、查看详情、搜索筛选、创建新技能
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Puzzle,
  X,
  RefreshCw,
  Search,
  Plus,
  Check,
  Zap,
  Eye,
  EyeOff,
  Tag,
  Save,
  XCircle,
  ShoppingBag,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useSkillStore } from '@/stores/skillStore.enhanced';
import { cn } from '@/lib/utils';
import type { Skill } from '../Settings/Skills/types';
import { SkillMarket } from './SkillMarket';
import { toast } from 'sonner';
import { useFileStore } from '@/stores/fileStore';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';

export const SkillsDock: React.FC = () => {
  const { t } = useTranslation();

  const {
    availableSkills,
    activeSkillIds,
    isLoading,
    fetchSkills,
    getFilteredSkills,
    activateSkill,
    deactivateSkill,
    createSkill,
    setSearchQuery,
    setSelectedTags,
  } = useSkillStore();

  const rootPath = useFileStore(state => state.rootPath);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [searchQuery, setSearchQueryLocal] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [activatingSkillId, setActivatingSkillId] = useState<string | null>(null);
  const [uninstallingSkillId, setUninstallingSkillId] = useState<string | null>(null);

  // 新技能表单
  const [newSkill, setNewSkill] = useState({
    id: '',
    name: '',
    description: '',
    version: '1.0.0',
    tags: [] as string[],
    system_prompt: '',
    dependencies: [] as string[],
  });

  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (availableSkills.length === 0) {
      fetchSkills();
    }
  }, []);

  // 获取所有唯一标签
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    availableSkills.forEach(skill => {
      skill.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }, [availableSkills]);

  // 过滤技能
  const filteredSkills = useMemo(() => {
    let skills = availableSkills;

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      skills = skills.filter(skill =>
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.id.toLowerCase().includes(query)
      );
    }

    // 标签过滤
    if (selectedTagFilter) {
      skills = skills.filter(skill => skill.tags.includes(selectedTagFilter));
    }

    return skills;
  }, [availableSkills, searchQuery, selectedTagFilter]);

  // 处理激活/停用
  const handleToggleActive = async (e: React.MouseEvent, skillId: string) => {
    e.stopPropagation();

    const isActive = activeSkillIds.includes(skillId);
    const skill = availableSkills.find(s => s.id === skillId);

    if (!skill) return;

    // 设置加载状态
    setActivatingSkillId(skillId);

    try {
      if (isActive) {
        // 停用技能
        toast.loading(t('skillsDock.toast.deactivating', { name: skill.name }), { id: `skill-${skillId}` });
        await deactivateSkill(skillId);
        toast.success(t('skillsDock.toast.deactivated', { name: skill.name }), { id: `skill-${skillId}` });
      } else {
        // 激活技能
        toast.loading(t('skillsDock.toast.activating', { name: skill.name }), { id: `skill-${skillId}` });
        await activateSkill(skillId);
        toast.success(t('skillsDock.toast.activated', { name: skill.name }), { id: `skill-${skillId}` });
      }
    } catch (error) {
      toast.error(t('skillsDock.toast.actionFailed', { error }), { id: `skill-${skillId}` });
    } finally {
      setActivatingSkillId(null);
    }
  };

  // 处理卸载技能
  const handleUninstall = async (e: React.MouseEvent, skillId: string) => {
    e.stopPropagation();

    const skill = availableSkills.find(s => s.id === skillId);
    if (!skill) return;

    if (!rootPath) {
      toast.error(t('skillsDock.toast.openProjectFirst'));
      return;
    }

    // 确认对话框
    const confirmed = confirm(t('skillsDock.toast.confirmUninstall', { name: skill.name }));
    if (!confirmed) return;

    // 如果技能是激活状态，先停用
    if (activeSkillIds.includes(skillId)) {
      await deactivateSkill(skillId);
    }

    setUninstallingSkillId(skillId);

    try {
      toast.loading(t('skillsDock.toast.uninstalling', { name: skill.name }), { id: `uninstall-${skillId}` });
      await invoke('uninstall_skill', {
        projectRoot: rootPath,
        skillId: skillId,
      });

      // 刷新技能列表
      await fetchSkills();

      toast.success(t('skillsDock.toast.uninstalled', { name: skill.name }), { id: `uninstall-${skillId}` });
    } catch (error) {
      toast.error(t('skillsDock.toast.uninstallFailed', { error }), { id: `uninstall-${skillId}` });
    } finally {
      setUninstallingSkillId(null);
    }
  };

  // 查看详情
  const handleViewDetails = (skill: Skill) => {
    setSelectedSkill(skill);
  };

  // 创建新技能
  const handleCreateSkill = async () => {
    if (!newSkill.id || !newSkill.name || !newSkill.system_prompt) {
      alert(t('skillsDock.toast.fillRequiredFields'));
      return;
    }

    try {
      await createSkill(newSkill);
      setShowCreateForm(false);
      setNewSkill({
        id: '',
        name: '',
        description: '',
        version: '1.0.0',
        tags: [],
        system_prompt: '',
        dependencies: [],
      });
      await fetchSkills();
    } catch (error) {
      alert(t('skillsDock.toast.createFailed', { error }));
    }
  };

  // 添加标签
  const handleAddTag = () => {
    if (tagInput && !newSkill.tags.includes(tagInput)) {
      setNewSkill({ ...newSkill, tags: [...newSkill.tags, tagInput] });
      setTagInput('');
    }
  };

  // 移除标签
  const handleRemoveTag = (tag: string) => {
    setNewSkill({ ...newSkill, tags: newSkill.tags.filter(t => t !== tag) });
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg transition-all',
            'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600',
            'hover:border-blue-500'
          )}
          title={t('skillsDock.openButtonTitle')}
        >
          <Puzzle size={16} />
          <span className="text-sm font-medium">{t('skillsDock.skillsLabel')} ({availableSkills.length})</span>
        </button>
      </div>
    );
  }

  // 技能详情面板
  if (selectedSkill) {
    return (
      <div className="fixed bottom-4 left-4 z-50 w-96 max-h-[70vh] flex flex-col bg-[#252526] border border-gray-700 rounded-lg shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[#1e1e1e] rounded-t-lg">
          <div className="flex items-center gap-2">
            <Puzzle size={18} className="text-blue-400" />
            <h3 className="text-sm font-bold text-white truncate">{selectedSkill.name}</h3>
          </div>
          <button
            onClick={() => setSelectedSkill(null)}
            className="p-1 rounded hover:bg-gray-700 text-gray-400"
            title={t('skillsDock.closeButtonTitle')}
          >
            <X size={14} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 基本信息 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-400">{t('skillsDock.idLabel')}</h4>
              <span className="text-xs text-gray-300 font-mono">{selectedSkill.id}</span>
            </div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-400">{t('skillsDock.versionLabel')}</h4>
              <span className="text-xs text-gray-300">v{selectedSkill.version}</span>
            </div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-400">{t('skillsDock.statusLabel')}</h4>
              <span className={cn(
                'text-xs font-medium',
                activeSkillIds.includes(selectedSkill.id) ? 'text-green-400' : 'text-gray-500'
              )}>
                {activeSkillIds.includes(selectedSkill.id) ? t('skillsDock.activated') : t('skillsDock.notActivated')}
              </span>
            </div>
          </div>

          {/* 描述 */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">{t('skillsDock.descriptionLabel')}</h4>
            <p className="text-xs text-gray-300 leading-relaxed">{selectedSkill.description}</p>
          </div>

          {/* 标签 */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">{t('skillsDock.tagsLabel')}</h4>
            <div className="flex flex-wrap gap-1">
              {selectedSkill.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-1 rounded bg-gray-800 text-gray-400 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">System Prompt</h4>
            <div className="bg-[#1e1e1e] rounded p-3 max-h-40 overflow-y-auto">
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                {selectedSkill.system_prompt}
              </pre>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={(e) => {
                handleToggleActive(e, selectedSkill.id);
                setSelectedSkill(null);
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-sm font-medium transition-all',
                activeSkillIds.includes(selectedSkill.id)
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              )}
            >
              {activeSkillIds.includes(selectedSkill.id) ? (
                <>
                  <XCircle size={14} />
                  {t('skillsDock.deactivateButton')}
                </>
              ) : (
                <>
                  <Zap size={14} />
                  {t('skillsDock.activateButton')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 技能市场
  if (showMarketplace) {
    return <SkillMarket onClose={() => setShowMarketplace(false)} />;
  }

  // 创建技能表单
  if (showCreateForm) {
    return (
      <div className="fixed bottom-4 left-4 z-50 w-96 max-h-[80vh] flex flex-col bg-[#252526] border border-gray-700 rounded-lg shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[#1e1e1e] rounded-t-lg">
          <div className="flex items-center gap-2">
            <Plus size={18} className="text-green-400" />
            <h3 className="text-sm font-bold text-white">{t('skillsDock.createNewSkillTitle')}</h3>
          </div>
          <button
            onClick={() => setShowCreateForm(false)}
            className="p-1 rounded hover:bg-gray-700 text-gray-400"
            title={t('skillsDock.closeButtonTitle')}
          >
            <X size={14} />
          </button>
        </div>

        {/* 表单 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ID */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">{t('skillsDock.idFieldLabel')}</label>
            <input
              type="text"
              value={newSkill.id}
              onChange={(e) => setNewSkill({ ...newSkill, id: e.target.value })}
              placeholder={t('skillsDock.idFieldPlaceholder')}
              className="w-full px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* 名称 */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">{t('skillsDock.nameLabel')}</label>
            <input
              type="text"
              value={newSkill.name}
              onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
              placeholder={t('skillsDock.namePlaceholder')}
              className="w-full px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">{t('skillsDock.descriptionLabel')}</label>
            <textarea
              value={newSkill.description}
              onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
              placeholder={t('skillsDock.descriptionPlaceholder')}
              rows={2}
              className="w-full px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* 版本 */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">{t('skillsDock.versionFieldLabel')}</label>
            <input
              type="text"
              value={newSkill.version}
              onChange={(e) => setNewSkill({ ...newSkill, version: e.target.value })}
              placeholder="1.0.0"
              className="w-full px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* 标签 */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">{t('skillsDock.tagsLabel')}</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder={t('skillsDock.tagPlaceholder')}
                className="flex-1 px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleAddTag}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-sm"
              >
                {t('skillsDock.addButton')}
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {newSkill.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-1 rounded bg-gray-800 text-gray-400 text-xs flex items-center gap-1"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-red-400"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">{t('skillsDock.systemPromptLabel')}</label>
            <textarea
              value={newSkill.system_prompt}
              onChange={(e) => setNewSkill({ ...newSkill, system_prompt: e.target.value })}
              placeholder={t('skillsDock.systemPromptPlaceholder')}
              rows={6}
              className="w-full px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500 resize-none font-mono"
            />
          </div>

          {/* 按钮 */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCreateSkill}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-white text-sm font-medium transition-all"
            >
              <Save size={14} />
              {t('skillsDock.saveButton')}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-sm font-medium transition-all"
            >
              {t('skillsDock.cancelButton')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 主列表
  return (
    <div className="fixed bottom-4 left-4 z-50 w-96 max-h-[70vh] flex flex-col bg-[#252526] border border-gray-700 rounded-lg shadow-2xl">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[#1e1e1e] rounded-t-lg">
        <div className="flex items-center gap-2">
          <Puzzle size={18} className="text-blue-400" />
          <h3 className="text-sm font-bold text-white">{t('skillsDock.skillsCenterTitle')}</h3>
          <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-xs font-bold">
            {filteredSkills.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowMarketplace(true)}
            className="p-1 rounded hover:bg-gray-700 text-purple-400"
            title={t('skillsDock.skillMarketTitle')}
          >
            <ShoppingBag size={14} />
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="p-1 rounded hover:bg-gray-700 text-gray-400"
            title={t('skillsDock.createSkillTooltip')}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => fetchSkills()}
            disabled={isLoading}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 disabled:opacity-50"
            title={t('skillsDock.refreshTooltip')}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded hover:bg-gray-700 text-gray-400"
            title={t('skillsDock.closeButtonTitle')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="p-3 border-b border-gray-700 space-y-2">
        {/* 搜索框 */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQueryLocal(e.target.value)}
            placeholder={t('skillsDock.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* 标签筛选 */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedTagFilter(null)}
              className={cn(
                'px-2 py-1 rounded whitespace-nowrap text-xs transition-all',
                !selectedTagFilter
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              )}
            >
              {t('skillsDock.allFilter')}
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTagFilter(tag)}
                className={cn(
                  'px-2 py-1 rounded whitespace-nowrap text-xs transition-all flex items-center gap-1',
                  selectedTagFilter === tag
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                <Tag size={10} />
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading && availableSkills.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <RefreshCw size={20} className="animate-spin mr-2" />
            <span className="text-sm">{t('skillsDock.loadingText')}</span>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <Puzzle size={32} className="mb-2 opacity-50" />
            <span className="text-sm">{t('skillsDock.noSkillsFound')}</span>
          </div>
        ) : (
          filteredSkills.map((skill) => {
            const isActive = activeSkillIds.includes(skill.id);
            return (
              <div
                key={skill.id}
                className="p-3 rounded bg-[#1e1e1e] hover:bg-[#2a2a2a] border transition-all cursor-pointer group"
                style={{ borderColor: isActive ? 'rgb(37, 99, 235)' : 'rgb(55, 65, 81)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="flex-1 min-w-0"
                    onClick={() => handleViewDetails(skill)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-white truncate">{skill.name}</h4>
                      {isActive && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-600/20 text-green-400 text-xs">
                          <Zap size={10} />
                          {t('skillsDock.activated')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">{skill.description}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleUninstall(e, skill.id)}
                      disabled={uninstallingSkillId === skill.id || activatingSkillId === skill.id}
                      className={cn(
                        'p-1.5 rounded transition-all opacity-0 group-hover:opacity-100',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'bg-gray-600 hover:bg-gray-700 text-white'
                      )}
                      title={t('skillsDock.uninstallSkillTooltip')}
                    >
                      {uninstallingSkillId === skill.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                    </button>
                    <button
                      onClick={(e) => handleToggleActive(e, skill.id)}
                      disabled={activatingSkillId === skill.id || uninstallingSkillId === skill.id}
                      className={cn(
                        'p-1.5 rounded transition-all opacity-0 group-hover:opacity-100',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        isActive
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      )}
                      title={isActive ? t('skillsDock.deactivateTooltip') : t('skillsDock.activateTooltip')}
                    >
                      {activatingSkillId === skill.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : isActive ? (
                        <EyeOff size={12} />
                      ) : (
                        <Eye size={12} />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex gap-1">
                    {skill.tags.slice(0, 3).map(tag => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                    {skill.tags.length > 3 && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-600 text-xs">
                        +{skill.tags.length - 3}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">v{skill.version}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
