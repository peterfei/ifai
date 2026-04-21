/**
 * 技能详情面板
 * Phase 7: 完整 UI 重构
 */

import React, { useState } from 'react';
import {
  Code,
  FileText,
  GitBranch,
  Package,
  User,
  Calendar,
  ExternalLink,
  Download,
  Upload,
  Trash2,
  Edit,
  Check,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SkillStateIndicator } from './SkillStateIndicator';
import { useSkillStore } from '@/stores/skillStore.enhanced';
import type { Skill } from './types';

interface SkillDetailPanelProps {
  skill: Skill;
  className?: string;
}

export const SkillDetailPanel: React.FC<SkillDetailPanelProps> = ({ skill, className }) => {
  const { activateSkill, deactivateSkill, installSkill, uninstallSkill } = useSkillStore();
  const [showSource, setShowSource] = useState(false);
  const [showDependencies, setShowDependencies] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);

  const handleToggleActive = async () => {
    if (skill.state.type === 'Active') {
      await deactivateSkill(skill.id);
    } else {
      await activateSkill(skill.id);
    }
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await installSkill(skill.id);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async () => {
    await uninstallSkill(skill.id);
  };

  const canInstall = skill.state.type === 'NotInstalled';
  const canUninstall = skill.state.type === 'Installed' || skill.state.type === 'Active' || skill.state.type === 'Inactive';
  const canActivate = skill.state.type === 'Installed' || skill.state.type === 'Inactive';
  const canDeactivate = skill.state.type === 'Active';

  return (
    <div className={cn('bg-gray-900 rounded-lg border border-gray-700 overflow-hidden', className)}>
      {/* 头部 */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-xl font-bold text-white">{skill.name}</h2>
              <span className="px-2 py-1 rounded bg-gray-800 text-xs font-mono text-gray-400 border border-gray-700">
                v{skill.version}
              </span>
              <SkillStateIndicator state={skill.state} size="md" showLabel />
            </div>
            <p className="text-gray-400">{skill.description}</p>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            {canInstall && (
              <button
                onClick={handleInstall}
                disabled={isInstalling}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
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
                    安装
                  </>
                )}
              </button>
            )}

            {canUninstall && (
              <button
                onClick={handleUninstall}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 transition-all"
              >
                <Trash2 size={16} />
                卸载
              </button>
            )}

            {(canActivate || canDeactivate) && (
              <button
                onClick={handleToggleActive}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  canActivate
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                )}
              >
                {canActivate ? (
                  <>
                    <Check size={16} />
                    激活
                  </>
                ) : (
                  <>
                    <X size={16} />
                    停用
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => setShowSource(!showSource)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                showSource
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700'
              )}
            >
              <Code size={16} />
              源码
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="p-6 space-y-6">
        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400">基本信息</h3>
            <div className="space-y-3">
              <DetailItem icon={Package} label="技能 ID" value={skill.id} />
              <DetailItem icon={User} label="作者" value={skill.author || '未知'} />
              <DetailItem icon={Calendar} label="版本" value={skill.version} />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400">系统提示词</h3>
            <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                {skill.system_prompt}
              </p>
            </div>
          </div>
        </div>

        {/* 依赖关系 */}
        {skill.dependencies.length > 0 && (
          <div>
            <button
              onClick={() => setShowDependencies(!showDependencies)}
              className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors mb-3"
            >
              <GitBranch size={16} />
              依赖关系 ({skill.dependencies.length})
              {showDependencies ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
            {showDependencies && (
              <div className="space-y-2">
                {skill.dependencies.map(depId => (
                  <div
                    key={depId}
                    className="flex items-center justify-between p-3 bg-gray-950 rounded-lg border border-gray-800"
                  >
                    <div className="flex items-center gap-2">
                      <Package size={16} className="text-gray-500" />
                      <span className="text-sm text-gray-300">{depId}</span>
                    </div>
                    <button
                      onClick={() => {
                        /* TODO: 跳转到依赖技能 */
                      }}
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      查看
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 标签 */}
        {skill.tags.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3">标签</h3>
            <div className="flex flex-wrap gap-2">
              {skill.tags.map(tag => (
                <span
                  key={tag}
                  className="px-3 py-1.5 rounded-full bg-gray-800 text-sm text-gray-300 border border-gray-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 兼容性 */}
        {skill.compatibility && (
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3">兼容性</h3>
            <div className="p-3 bg-gray-950 rounded-lg border border-gray-800">
              <code className="text-sm text-blue-400">{skill.compatibility}</code>
            </div>
          </div>
        )}

        {/* 源码显示 */}
        {showSource && (
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3">技能源文件</h3>
            <div className="space-y-3">
              <SourceFileLink path={`.ifai/skills/${skill.id}/skill.json`} type="JSON" />
              <SourceFileLink path={`.ifai/skills/${skill.id}/skill.md`} type="Markdown" />
              <SourceFileLink path={`.ifai/skills/${skill.id}/skill.yaml`} type="YAML" />
            </div>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="p-4 border-t border-gray-800 bg-gray-950 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>创建于 2024-01-01</span>
          <span>•</span>
          <span>最后更新 2024-01-01</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors" title="编辑">
            <Edit size={18} className="text-gray-400" />
          </button>
          <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors" title="导出">
            <Upload size={18} className="text-gray-400" />
          </button>
          <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors" title="打开位置">
            <ExternalLink size={18} className="text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== 详细信息项 ====================

interface DetailItemProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}

const DetailItem: React.FC<DetailItemProps> = ({ icon: Icon, label, value }) => {
  return (
    <div className="flex items-center gap-3">
      <Icon size={16} className="text-gray-500" />
      <div className="flex-1">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-sm text-gray-300">{value}</div>
      </div>
    </div>
  );
};

// ==================== 源文件链接 ====================

interface SourceFileLinkProps {
  path: string;
  type: string;
}

const SourceFileLink: React.FC<SourceFileLinkProps> = ({ path, type }) => {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-950 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-gray-500" />
        <span className="text-sm text-gray-300">{path}</span>
        <span className="px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-500">{type}</span>
      </div>
      <button
        onClick={() => {
          /* TODO: 打开文件 */
        }}
        className="text-blue-400 hover:text-blue-300 text-sm"
      >
        打开
      </button>
    </div>
  );
};
