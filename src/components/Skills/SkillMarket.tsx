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
  Clock,
  Users,
  Check,
  ChevronLeft,
  Eye,
  BookOpen,
  Code,
  Award,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { builtinSkills, skillsByCategory, featuredSkills } from './builtinSkills';
import { useSkillStore } from '@/stores/skillStore.enhanced';
import { useFileStore } from '@/stores/fileStore';
import { invoke } from '@tauri-apps/api/core';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<BuiltinSkill | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
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
    { id: 'featured', name: '精选', icon: Award, color: 'text-yellow-400' },
    { id: 'development', name: '开发', icon: Code, color: 'text-blue-400' },
    { id: 'testing', name: '测试', icon: Package, color: 'text-green-400' },
    { id: 'documentation', name: '文档', icon: BookOpen, color: 'text-purple-400' },
    { id: 'pivo', name: 'PIVO', icon: Users, color: 'text-orange-400' },
  ];

  // 安装技能
  const handleInstall = async (skill: BuiltinSkill) => {
    if (!rootPath) {
      alert('请先打开一个项目');
      return;
    }

    setInstalling(skill.id);
    try {
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

      alert(`✅ "${skill.displayName}" 安装成功！`);
    } catch (error: any) {
      alert(`❌ 安装失败: ${error.message || error}`);
    } finally {
      setInstalling(null);
    }
  };

  // 技能详情视图
  if (selectedSkill) {
    const isInstalled = installedSkills.has(selectedSkill.id);
    return (
      <div className="fixed bottom-4 left-4 z-50 w-[480px] max-h-[75vh] flex flex-col bg-[#252526] border border-gray-700 rounded-lg shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 bg-[#1e1e1e] rounded-t-lg">
          <button
            onClick={() => setSelectedSkill(null)}
            className="p-1 rounded hover:bg-gray-700 text-gray-400"
            title="返回"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Puzzle size={20} className="text-blue-400 flex-shrink-0" />
            <h3 className="text-sm font-bold text-white truncate">{selectedSkill.displayName}</h3>
          </div>
          <button
            onClick={() => setSelectedSkill(null)}
            className="p-1 rounded hover:bg-gray-700 text-gray-400"
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容 */}
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
          <div className="flex items-center gap-2 px-3 py-2 bg-[#1e1e1e] rounded">
            <Users size={14} className="text-gray-500" />
            <span className="text-xs text-gray-400">作者: {selectedSkill.author}</span>
          </div>

          {/* 标签 */}
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

          {/* 依赖 */}
          {selectedSkill.dependencies.length > 0 && (
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

          {/* 要求 */}
          {selectedSkill.requirements && (
            <div>
              <h4 className="text-xs font-medium text-gray-400 mb-2">使用要求</h4>
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
            <h4 className="text-xs font-medium text-gray-400 mb-2">使用场景</h4>
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
            <h4 className="text-xs font-medium text-gray-400 mb-2">System Prompt 预览</h4>
            <div className="bg-[#1e1e1e] rounded p-3 max-h-40 overflow-y-auto">
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                {selectedSkill.systemPrompt.substring(0, 500)}
                {selectedSkill.systemPrompt.length > 500 && '...'}
              </pre>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              完整内容将在安装后可用
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
                已安装
              </button>
            ) : (
              <button
                onClick={() => handleInstall(selectedSkill)}
                disabled={installing !== null}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {installing === selectedSkill.id ? (
                  <>
                    <Clock size={16} className="animate-spin" />
                    安装中...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    安装到项目
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 技能市场主视图
  return (
    <div className="fixed bottom-4 left-4 z-50 w-[420px] max-h-[75vh] flex flex-col bg-[#252526] border border-gray-700 rounded-lg shadow-2xl">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[#1e1e1e] rounded-t-lg">
        <div className="flex items-center gap-2">
          <Puzzle size={20} className="text-purple-400" />
          <div>
            <h3 className="text-sm font-bold text-white">技能市场</h3>
            <p className="text-xs text-gray-500">{builtinSkills.length} 个技能</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-700 text-gray-400"
          title="关闭"
        >
          <X size={18} />
        </button>
      </div>

      {/* 搜索 */}
      <div className="p-3 border-b border-gray-700">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索技能..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* 分类 */}
      <div className="px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap text-xs font-medium transition-all',
              !selectedCategory
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            )}
          >
            <Award size={12} />
            全部
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap text-xs font-medium transition-all',
                selectedCategory === cat.id
                  ? 'bg-purple-600 text-white'
                  : `bg-gray-800 text-gray-400 hover:bg-gray-700 ${cat.color}`
              )}
            >
              <cat.icon size={12} />
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* 技能列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <Search size={32} className="mb-2 opacity-50" />
            <p className="text-sm">未找到匹配的技能</p>
          </div>
        ) : (
          filteredSkills.map((skill) => {
            const isInstalled = installedSkills.has(skill.id);
            return (
              <div
                key={skill.id}
                className={cn(
                  'p-3 rounded-lg border transition-all cursor-pointer group',
                  'bg-[#1e1e1e] hover:bg-[#2a2a2a]',
                  skill.featured && 'border-purple-500/30',
                  !skill.featured && 'border-gray-800'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* 图标 */}
                  <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                    skill.featured ? 'bg-purple-600/20' : 'bg-gray-800'
                  )}>
                    <Puzzle size={18} className={cn(
                      skill.featured ? 'text-purple-400' : 'text-gray-500'
                    )} />
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-white truncate">
                        {skill.displayName}
                      </h4>
                      {skill.featured && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-yellow-600/20 text-yellow-400 text-xs font-medium">
                          <Star size={8} />
                          精选
                        </span>
                      )}
                      {isInstalled && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-600/20 text-green-400 text-xs">
                          <Check size={8} />
                          已安装
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                      {skill.description}
                    </p>

                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Star size={10} className="text-yellow-400" />
                        {skill.rating}
                      </span>
                      <span className="flex items-center gap-1">
                        <Download size={10} />
                        {skill.downloads > 1000
                          ? `${(skill.downloads / 1000).toFixed(1)}k`
                          : skill.downloads}
                      </span>
                      <span>{skill.size}</span>
                    </div>

                    {/* 标签 */}
                    <div className="flex items-center gap-1.5 mt-2">
                      {skill.tags.slice(0, 3).map(tag => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                      {skill.tags.length > 3 && (
                        <span className="text-xs text-gray-600">
                          +{skill.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => setSelectedSkill(skill)}
                      className={cn(
                        'p-1.5 rounded transition-all opacity-0 group-hover:opacity-100',
                        'bg-blue-600 hover:bg-blue-700 text-white'
                      )}
                      title="查看详情"
                    >
                      <Eye size={14} />
                    </button>
                    {isInstalled ? (
                      <div
                        className="p-1.5 rounded bg-green-600/20 text-green-400 text-center"
                        title="已安装"
                      >
                        <Check size={14} />
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInstall(skill);
                        }}
                        disabled={installing !== null}
                        className={cn(
                          'p-1.5 rounded transition-all opacity-0 group-hover:opacity-100',
                          'bg-green-600 hover:bg-green-700 text-white',
                          'disabled:opacity-50'
                        )}
                        title="安装"
                      >
                        <Download size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
