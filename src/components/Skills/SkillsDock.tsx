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
} from 'lucide-react';
import { useSkillStore } from '@/stores/skillStore.enhanced';
import { cn } from '@/lib/utils';
import type { Skill } from '../Settings/Skills/types';

export const SkillsDock: React.FC = () => {
  const {
    availableSkills,
    activeSkillIds,
    isLoading,
    fetchSkills,
    getFilteredSkills,
    toggleActive,
    createSkill,
    setSearchQuery,
    setSelectedTags,
  } = useSkillStore();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQueryLocal] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);

  // 新技能表单
  const [newSkill, setNewSkill] = useState({
    id: '',
    name: '',
    description: '',
    version: '1.0.0',
    tags: [] as string[],
    system_prompt: '',
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
  const handleToggleActive = (e: React.MouseEvent, skillId: string) => {
    e.stopPropagation();
    toggleActive(skillId);
  };

  // 查看详情
  const handleViewDetails = (skill: Skill) => {
    setSelectedSkill(skill);
  };

  // 创建新技能
  const handleCreateSkill = async () => {
    if (!newSkill.id || !newSkill.name || !newSkill.system_prompt) {
      alert('请填写所有必填字段');
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
      });
      await fetchSkills();
    } catch (error) {
      alert(`创建失败: ${error}`);
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
          title="打开技能列表"
        >
          <Puzzle size={16} />
          <span className="text-sm font-medium">技能 ({availableSkills.length})</span>
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
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 基本信息 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-400">ID</h4>
              <span className="text-xs text-gray-300 font-mono">{selectedSkill.id}</span>
            </div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-400">版本</h4>
              <span className="text-xs text-gray-300">v{selectedSkill.version}</span>
            </div>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-400">状态</h4>
              <span className={cn(
                'text-xs font-medium',
                activeSkillIds.includes(selectedSkill.id) ? 'text-green-400' : 'text-gray-500'
              )}>
                {activeSkillIds.includes(selectedSkill.id) ? '已激活' : '未激活'}
              </span>
            </div>
          </div>

          {/* 描述 */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">描述</h4>
            <p className="text-xs text-gray-300 leading-relaxed">{selectedSkill.description}</p>
          </div>

          {/* 标签 */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">标签</h4>
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
                  停用
                </>
              ) : (
                <>
                  <Zap size={14} />
                  激活
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 创建技能表单
  if (showCreateForm) {
    return (
      <div className="fixed bottom-4 left-4 z-50 w-96 max-h-[80vh] flex flex-col bg-[#252526] border border-gray-700 rounded-lg shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-[#1e1e1e] rounded-t-lg">
          <div className="flex items-center gap-2">
            <Plus size={18} className="text-green-400" />
            <h3 className="text-sm font-bold text-white">创建新技能</h3>
          </div>
          <button
            onClick={() => setShowCreateForm(false)}
            className="p-1 rounded hover:bg-gray-700 text-gray-400"
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>

        {/* 表单 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ID */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">ID *</label>
            <input
              type="text"
              value={newSkill.id}
              onChange={(e) => setNewSkill({ ...newSkill, id: e.target.value })}
              placeholder="例如: my-skill"
              className="w-full px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* 名称 */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">名称 *</label>
            <input
              type="text"
              value={newSkill.name}
              onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
              placeholder="例如: 我的技能"
              className="w-full px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">描述</label>
            <textarea
              value={newSkill.description}
              onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
              placeholder="技能的简短描述"
              rows={2}
              className="w-full px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* 版本 */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">版本</label>
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
            <label className="block text-xs font-medium text-gray-400 mb-2">标签</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="输入标签后按回车"
                className="flex-1 px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleAddTag}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-sm"
              >
                添加
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
            <label className="block text-xs font-medium text-gray-400 mb-1">System Prompt *</label>
            <textarea
              value={newSkill.system_prompt}
              onChange={(e) => setNewSkill({ ...newSkill, system_prompt: e.target.value })}
              placeholder="定义AI角色的详细提示词..."
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
              保存
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-sm font-medium transition-all"
            >
              取消
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
          <h3 className="text-sm font-bold text-white">技能中心</h3>
          <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-xs font-bold">
            {filteredSkills.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCreateForm(true)}
            className="p-1 rounded hover:bg-gray-700 text-gray-400"
            title="创建新技能"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => fetchSkills()}
            disabled={isLoading}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded hover:bg-gray-700 text-gray-400"
            title="关闭"
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
            placeholder="搜索技能..."
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
              全部
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
            <span className="text-sm">加载中...</span>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <Puzzle size={32} className="mb-2 opacity-50" />
            <span className="text-sm">未找到技能</span>
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
                          激活
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">{skill.description}</p>
                  </div>
                  <button
                    onClick={(e) => handleToggleActive(e, skill.id)}
                    className={cn(
                      'p-1.5 rounded transition-all opacity-0 group-hover:opacity-100',
                      isActive
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    )}
                    title={isActive ? '停用' : '激活'}
                  >
                    {isActive ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
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
