/**
 * 技能市场 - 浏览和安装技能
 */

import React, { useState, useMemo } from 'react';
import {
  Puzzle,
  X,
  Search,
  Download,
  Star,
  Tag,
  ChevronLeft,
  Check,
  Award,
  BookOpen,
  Code,
  Users,
  Loader2,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { builtinSkills } from './builtinSkills';
import { useSkillStore } from '@/stores/skillStore.enhanced';
import { useFileStore } from '@/stores/fileStore';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface BuiltinSkill {
  id: string;
  name: string;
  displayName: string;
  description: string;
  longDescription: string;
  version: string;
  author: string;
  category: string;
  tags: string[];
  systemPrompt: string;
  dependencies: string[];
  size: string;
  downloads: number;
  rating: number;
  featured: boolean;
  examples: string[];
  requirements?: string[];
}

export const SkillMarket: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<BuiltinSkill | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [installedSkills, setInstalledSkills] = useState<Set<string>>(new Set());

  const { availableSkills } = useSkillStore();
  const rootPath = useFileStore(state => state.rootPath);

  // 更新已安装技能列表
  React.useEffect(() => {
    const installed = new Set(availableSkills.map(s => s.id));
    setInstalledSkills(installed);
  }, [availableSkills]);

  // 过滤技能
  const filteredSkills = useMemo(() => {
    let skills = builtinSkills;

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      skills = skills.filter(skill =>
        skill.displayName.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // 分类过滤
    if (selectedCategory) {
      skills = skills.filter(skill => skill.category === selectedCategory);
    }

    return skills;
  }, [searchQuery, selectedCategory]);

  // 分类标签
  const categories = [
    { id: 'featured', name: t('skillMarket.categories.featured'), icon: Award, color: 'text-yellow-400' },
    { id: 'development', name: t('skillMarket.categories.development'), icon: Code, color: 'text-blue-400' },
    { id: 'testing', name: t('skillMarket.categories.testing'), icon: BookOpen, color: 'text-green-400' },
    { id: 'documentation', name: t('skillMarket.categories.documentation'), icon: BookOpen, color: 'text-purple-400' },
    { id: 'pivo', name: 'PIVO', icon: Users, color: 'text-orange-400' },
  ];

  // 安装技能
  const handleInstall = async (skill: BuiltinSkill) => {
    if (!rootPath) {
      toast.error(t('skillMarket.openProjectFirst'));
      return;
    }

    setInstalling(skill.id);
    try {
      toast.loading(t('skillMarket.installingMessage', { name: skill.displayName }), { id: `install-${skill.id}` });
      await invoke('install_skill', {
        projectRoot: rootPath,
        skillId: skill.id,
        source: 'marketplace',
        skillData: skill,
      });
      setInstalledSkills(prev => new Set([...prev, skill.id]));

      // 刷新本地技能列表
      const { fetchSkills } = useSkillStore.getState();
      await fetchSkills();

      toast.success(`✅ "${skill.displayName}" ${t('skillMarket.installSuccess')}!`, { id: `install-${skill.id}` });
    } catch (error: any) {
      toast.error(`❌ ${t('skillMarket.installFailed', { error: error.message || error })}`, { id: `install-${skill.id}` });
    } finally {
      setInstalling(null);
    }
  };

  // 卸载技能
  const handleUninstall = async (skill: BuiltinSkill) => {
    if (!rootPath) {
      toast.error(t('skillMarket.openProjectFirst'));
      return;
    }

    // 确认对话框
    const confirmed = confirm(t('skillMarket.confirmUninstall', { name: skill.displayName }));
    if (!confirmed) return;

    setUninstalling(skill.id);
    try {
      toast.loading(t('skillMarket.uninstallingMessage', { name: skill.displayName }), { id: `uninstall-${skill.id}` });
      await invoke('uninstall_skill', {
        projectRoot: rootPath,
        skillId: skill.id,
      });

      // 更新已安装列表
      setInstalledSkills(prev => {
        const newSet = new Set(prev);
        newSet.delete(skill.id);
        return newSet;
      });

      // 刷新本地技能列表
      const { fetchSkills } = useSkillStore.getState();
      await fetchSkills();

      toast.success(`✅ "${skill.displayName}" ${t('skillMarket.uninstallSuccess')}`, { id: `uninstall-${skill.id}` });
    } catch (error: any) {
      toast.error(`❌ ${t('skillMarket.uninstallFailed', { error: error.message || error })}`, { id: `uninstall-${skill.id}` });
    } finally {
      setUninstalling(null);
    }
  };

  // 技能详情视图
  if (selectedSkill) {
    const isInstalled = installedSkills.has(selectedSkill.id);
    return (
      <div className="flex h-full w-full overflow-hidden">
        {/* 左侧：技能列表 */}
        <div className="flex flex-col h-full bg-gray-900 w-72 flex-shrink-0">
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-900/40 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <Puzzle size={16} className="text-purple-400" />
              <span className="text-gray-400 text-[10px] font-bold uppercase tracking-[0.1em]">
                {t('skillMarket.title')}
              </span>
              <span className="text-gray-600 text-[10px]">
                ({builtinSkills.length})
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-800 text-gray-400"
              title={t('skillMarket.close')}
            >
              <X size={14} />
            </button>
          </div>

          {/* 搜索 */}
          <div className="p-3 border-b border-gray-700">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('skillMarket.searchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* 分类 */}
          <div className="px-3 py-2 border-b border-gray-700">
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded whitespace-nowrap text-[10px] font-medium transition-all',
                  !selectedCategory
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                <Award size={10} />
                {t('skillMarket.all')}
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded whitespace-nowrap text-[10px] font-medium transition-all',
                    selectedCategory === cat.id
                      ? 'bg-purple-600 text-white'
                      : `bg-gray-800 text-gray-400 hover:bg-gray-700 ${cat.color}`
                  )}
                >
                  <cat.icon size={10} />
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* 技能列表 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {filteredSkills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <Search size={24} className="mb-2 opacity-50" />
                <p className="text-xs">{t('skillMarket.emptyTitle')}</p>
              </div>
            ) : (
              filteredSkills.map((skill) => {
                const isInstalled = installedSkills.has(skill.id);
                return (
                  <div
                    key={skill.id}
                    onClick={() => setSelectedSkill(skill)}
                    className={cn(
                      'p-2 rounded-lg border transition-all cursor-pointer group',
                      'bg-gray-800 hover:bg-gray-700',
                      skill.featured && 'border-purple-500/30',
                      !skill.featured && 'border-gray-700',
                      selectedSkill?.id === skill.id && 'ring-2 ring-purple-500'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                        skill.featured ? 'bg-purple-600/20' : 'bg-gray-700'
                      )}>
                        <Puzzle size={14} className={cn(
                          skill.featured ? 'text-purple-400' : 'text-gray-500'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <h4 className="text-xs font-medium text-white truncate">
                            {skill.displayName}
                          </h4>
                          {isInstalled && (
                            <Check size={8} className="text-green-400 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 line-clamp-2">
                          {skill.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 右侧：技能详情面板 */}
        <div className="flex-1 flex flex-col h-full bg-gray-900 border-l border-gray-700">
          {/* 详情头部 */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 bg-gray-900/40 backdrop-blur-md">
            <button
              onClick={() => setSelectedSkill(null)}
              className="p-1 rounded hover:bg-gray-800 text-gray-400"
              title={t('skillMarket.back')}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Puzzle size={16} className="text-blue-400 flex-shrink-0" />
              <h3 className="text-sm font-bold text-white truncate">{selectedSkill.displayName}</h3>
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
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{selectedSkill.longDescription}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Star size={12} className="text-yellow-400" />
                    {selectedSkill.rating}
                  </span>
                  <span className="flex items-center gap-1">
                    <Download size={12} />
                    {selectedSkill.downloads.toLocaleString()}
                  </span>
                  <span>{selectedSkill.size}</span>
                </div>
              </div>
            </div>

            {/* 作者 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded">
              <Users size={14} className="text-gray-500" />
              <span className="text-xs text-gray-400">{t('skillMarket.author', { author: selectedSkill.author })}</span>
            </div>

            {/* 标签 */}
            <div>
              <h4 className="text-xs font-medium text-gray-400 mb-2">{t('skillMarket.tags')}</h4>
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

            {/* 依赖 */}
            {selectedSkill.dependencies.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-400 mb-2">{t('skillMarket.dependencies')}</h4>
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

            {/* 要求 */}
            {selectedSkill.requirements && (
              <div>
                <h4 className="text-xs font-medium text-gray-400 mb-2">{t('skillMarket.requirements')}</h4>
                <ul className="space-y-1">
                  {selectedSkill.requirements.map(req => (
                    <li key={req} className="text-xs text-gray-400 flex items-start gap-2">
                      <span className="text-yellow-400 mt-0.5">•</span>
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 使用示例 */}
            <div>
              <h4 className="text-xs font-medium text-gray-400 mb-2">{t('skillMarket.examples')}</h4>
              <div className="space-y-1">
                {selectedSkill.examples.map((example, i) => (
                  <div key={i} className="text-xs text-gray-400 flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">{i + 1}.</span>
                    {example}
                  </div>
                ))}
              </div>
            </div>

            {/* System Prompt 预览 */}
            <div>
              <h4 className="text-xs font-medium text-gray-400 mb-2">{t('skillMarket.systemPromptPreview')}</h4>
              <div className="bg-gray-800 rounded p-3 max-h-40 overflow-y-auto">
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                  {selectedSkill.systemPrompt.substring(0, 500)}
                  {selectedSkill.systemPrompt.length > 500 && '...'}
                </pre>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {t('skillMarket.previewHint')}
              </p>
            </div>

            {/* 安装按钮 */}
            <div className="flex gap-2 pt-2">
              {isInstalled ? (
                <button
                  disabled
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600/20 text-green-400 rounded-lg text-sm font-medium cursor-not-allowed"
                >
                  <Check size={16} />
                  {t('skillMarket.installed')}
                </button>
              ) : (
                <button
                  onClick={() => handleInstall(selectedSkill)}
                  disabled={installing !== null || uninstalling !== null}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {installing === selectedSkill.id ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {t('skillMarket.installing')}
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      {t('skillMarket.installToProject')}
                    </>
                  )}
                </button>
              )}
              {isInstalled && (
                <button
                  onClick={() => handleUninstall(selectedSkill)}
                  disabled={installing !== null || uninstalling !== null}
                  className={cn(
                    'flex items-center justify-center gap-2 px-3 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-all',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                  title={t('skillMarket.uninstall')}
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
      </div>
    );
  }

  // 技能市场主视图
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* 左侧：技能列表 */}
      <div className="flex flex-col h-full bg-gray-900 w-72 flex-shrink-0">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-900/40 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Puzzle size={16} className="text-purple-400" />
            <span className="text-gray-400 text-[10px] font-bold uppercase tracking-[0.1em]">
              {t('skillMarket.title')}
            </span>
            <span className="text-gray-600 text-[10px]">
              ({builtinSkills.length})
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-800 text-gray-400"
            title={t('skillMarket.closeButton')}
          >
            <X size={14} />
          </button>
        </div>

        {/* 搜索 */}
        <div className="p-3 border-b border-gray-700">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('skillMarket.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* 分类 */}
        <div className="px-3 py-2 border-b border-gray-700">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded whitespace-nowrap text-[10px] font-medium transition-all',
                !selectedCategory
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              )}
            >
              <Award size={10} />
              {t('skillMarket.all')}
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded whitespace-nowrap text-[10px] font-medium transition-all',
                  selectedCategory === cat.id
                    ? 'bg-purple-600 text-white'
                    : `bg-gray-800 text-gray-400 hover:bg-gray-700 ${cat.color}`
                )}
              >
                <cat.icon size={10} />
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* 技能列表 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {filteredSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <Search size={24} className="mb-2 opacity-50" />
              <p className="text-xs">{t('skillMarket.emptyTitle')}</p>
            </div>
          ) : (
            filteredSkills.map((skill) => {
              const isInstalled = installedSkills.has(skill.id);
              return (
                <div
                  key={skill.id}
                  onClick={() => setSelectedSkill(skill)}
                  className={cn(
                    'p-2 rounded-lg border transition-all cursor-pointer group',
                    'bg-gray-800 hover:bg-gray-700',
                    skill.featured && 'border-purple-500/30',
                    !skill.featured && 'border-gray-700'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      skill.featured ? 'bg-purple-600/20' : 'bg-gray-700'
                    )}>
                      <Puzzle size={14} className={cn(
                        skill.featured ? 'text-purple-400' : 'text-gray-500'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        <h4 className="text-xs font-medium text-white truncate">
                          {skill.displayName}
                        </h4>
                        {skill.featured && (
                          <Award size={8} className="text-yellow-400 flex-shrink-0" />
                        )}
                        {isInstalled && (
                          <Check size={8} className="text-green-400 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 line-clamp-2">
                        {skill.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 右侧：欢迎信息 */}
      <div className="flex-1 flex flex-col h-full bg-gray-900 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <Puzzle size={64} className="text-purple-400 mx-auto mb-4 opacity-50" />
          <h2 className="text-2xl font-bold text-white mb-2">{t('skillMarket.welcomeTitle')}</h2>
          <p className="text-gray-400 mb-6">
            {t('skillMarket.welcomeDescription')}
          </p>
          <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Award size={16} className="text-yellow-400" />
              <span>{t('skillMarket.featuredCount', { count: builtinSkills.filter(s => s.featured).length })}</span>
            </div>
            <div className="flex items-center gap-2">
              <Download size={16} className="text-blue-400" />
              <span>{t('skillMarket.totalCount', { count: builtinSkills.length })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
