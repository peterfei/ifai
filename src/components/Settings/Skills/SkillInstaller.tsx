/**
 * 技能安装器
 * Phase 7: 完整 UI 重构
 */

import React, { useState } from 'react';
import {
  X,
  Download,
  Search,
  Globe,
  FolderOpen,
  Check,
  AlertCircle,
  Star,
  Users,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarketplaceSkill } from './types';

interface SkillInstallerProps {
  onClose: () => void;
  onInstall: (id: string, version?: string) => Promise<void>;
  className?: string;
}

export const SkillInstaller: React.FC<SkillInstallerProps> = ({
  onClose,
  onInstall,
  className,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [installing, setInstalling] = useState<Set<string>>(new Set());

  // 模拟市场技能数据
  const mockMarketplaceSkills: MarketplaceSkill[] = [
    {
      id: 'code-reviewer',
      name: '代码审查专家',
      description: '专业的代码审查技能，能够分析代码质量、发现潜在问题和提供改进建议',
      version: '2.1.0',
      author: 'IfAI Team',
      downloads: 12500,
      rating: 4.8,
      tags: ['development', 'code-review', 'quality'],
      source: 'official',
    },
    {
      id: 'test-generator',
      name: '测试用例生成器',
      description: '自动生成单元测试和集成测试，支持多种测试框架和编程语言',
      version: '1.5.0',
      author: 'IfAI Community',
      downloads: 8900,
      rating: 4.6,
      tags: ['testing', 'development', 'automation'],
      source: 'community',
    },
    {
      id: 'doc-writer',
      name: '文档生成助手',
      description: '从代码自动生成 API 文档、使用手册和技术文档',
      version: '1.2.0',
      author: 'IfAI Team',
      downloads: 6700,
      rating: 4.7,
      tags: ['documentation', 'development', 'writing'],
      source: 'official',
    },
    {
      id: 'performance-optimizer',
      name: '性能优化顾问',
      description: '分析代码性能瓶颈，提供优化建议和最佳实践',
      version: '1.0.0',
      author: 'IfAI Community',
      downloads: 5400,
      rating: 4.5,
      tags: ['performance', 'optimization', 'development'],
      source: 'community',
    },
    {
      id: 'security-scanner',
      name: '安全扫描器',
      description: '检测代码中的安全漏洞和潜在风险，提供修复建议',
      version: '1.3.0',
      author: 'IfAI Team',
      downloads: 9800,
      rating: 4.9,
      tags: ['security', 'development', 'scan'],
      source: 'official',
    },
  ];

  const categories = [
    { value: 'all', label: '全部', icon: Package },
    { value: 'official', label: '官方', icon: Star },
    { value: 'community', label: '社区', icon: Users },
  ];

  const filteredSkills = mockMarketplaceSkills.filter(skill => {
    const matchesSearch = skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        skill.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' ||
                             skill.source === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleInstall = async (skillId: string) => {
    setInstalling(prev => new Set(prev).add(skillId));
    try {
      await onInstall(skillId);
    } finally {
      setInstalling(prev => {
        const newSet = new Set(prev);
        newSet.delete(skillId);
        return newSet;
      });
    }
  };

  return (
    <div className={cn('fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4', className)}>
      <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Download size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">技能市场</h2>
              <p className="text-sm text-gray-500 mt-1">浏览和安装社区技能</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* 搜索和分类 */}
        <div className="p-6 border-b border-gray-800 space-y-4">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索技能..."
              className="w-full pl-10 pr-4 py-3 bg-gray-950 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* 分类标签 */}
          <div className="flex items-center gap-2">
            {categories.map(category => {
              const Icon = category.icon;
              return (
                <button
                  key={category.value}
                  onClick={() => setSelectedCategory(category.value)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    selectedCategory === category.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  )}
                >
                  <Icon size={16} />
                  {category.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 技能列表 */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle size={48} className="text-gray-600 mb-4" />
              <p className="text-gray-400">未找到匹配的技能</p>
              <p className="text-xs text-gray-500 mt-2">尝试调整搜索关键词</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSkills.map(skill => (
                <MarketplaceSkillCard
                  key={skill.id}
                  skill={skill}
                  isInstalling={installing.has(skill.id)}
                  onInstall={() => handleInstall(skill.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 底部链接 */}
        <div className="p-4 border-t border-gray-800 bg-gray-950 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <button className="flex items-center gap-2 hover:text-white transition-colors">
              <Globe size={16} />
              浏览全部技能库
            </button>
            <button className="flex items-center gap-2 hover:text-white transition-colors">
              <FolderOpen size={16} />
              从本地文件安装
            </button>
          </div>
          <div className="text-xs text-gray-600">
            共 {filteredSkills.length} 个技能可用
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== 市场技能卡片 ====================

interface MarketplaceSkillCardProps {
  skill: MarketplaceSkill;
  isInstalling: boolean;
  onInstall: () => void;
}

const MarketplaceSkillCard: React.FC<MarketplaceSkillCardProps> = ({
  skill,
  isInstalling,
  onInstall,
}) => {
  return (
    <div className="bg-gray-950 rounded-lg border border-gray-800 hover:border-gray-700 transition-all overflow-hidden">
      {/* 头部 */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-bold text-white">{skill.name}</h3>
              {skill.source === 'official' && (
                <span className="px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 text-xs font-medium border border-blue-500/50">
                  官方
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400 line-clamp-2">{skill.description}</p>
          </div>
          <div className="flex items-center gap-1">
            <Star size={16} className="text-yellow-500 fill-yellow-500" />
            <span className="text-sm font-medium text-white">{skill.rating}</span>
          </div>
        </div>

        {/* 元信息 */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>版本 {skill.version}</span>
          <span>•</span>
          <span>{skill.author}</span>
          <span>•</span>
          <span>{(skill.downloads / 1000).toFixed(1)}k 下载</span>
        </div>
      </div>

      {/* 标签 */}
      <div className="px-4 py-3 flex flex-wrap gap-1.5">
        {skill.tags.map(tag => (
          <span
            key={tag}
            className="px-2 py-1 rounded bg-gray-800 text-xs text-gray-400 border border-gray-700"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="p-4 border-t border-gray-800">
        <button
          onClick={onInstall}
          disabled={isInstalling}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
            'bg-blue-600 hover:bg-blue-700 text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isInstalling ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              安装中...
            </>
          ) : (
            <>
              <Download size={16} />
              安装技能
            </>
          )}
        </button>
      </div>
    </div>
  );
};
