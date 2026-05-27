/**
 * CompactSkillCard — 紧凑型横向技能卡片
 *
 * 用于技能广场 Grid 中，水平 flex-row 布局。
 * 按钮样式通过 BTN_BY_STATE 查表，零条件分支。
 */

import React from 'react';

// ==================== 类型定义 ====================

export interface DisplaySkill {
  id: string;
  name: string;
  description: string;
  version: string;
  rating: number;
  downloads: number;
  emoji?: string;
  thumbnail?: string;
  coverColor?: string;
  isInstalled: boolean;
  isInstalling: boolean;
  [key: string]: unknown;
}

export interface CompactSkillCardProps {
  skill: DisplaySkill;
  onSelect: (id: string) => void;
  onInstall: (id: string) => void;
}

// ==================== BTN_BY_STATE 查表 ====================

const BTN_BY_STATE: Record<
  string,
  { label: string | null; className: string }
> = {
  NotInstalled: {
    label: '安装',
    className:
      'px-2.5 py-1 rounded-lg bg-brand-500 text-[10px] font-medium text-white hover:bg-brand-600 shadow-sm shadow-brand-500/15 hover:shadow-brand-500/25',
  },
  Installing: {
    label: null,
    className:
      'w-5 h-5 rounded-lg bg-brand-500 flex items-center justify-center',
  },
  Installed: {
    label: '已安装 ✓',
    className:
      'px-2.5 py-1 rounded-lg bg-white/[0.06] text-[10px] font-medium text-white/50 border border-white/[0.06] cursor-default',
  },
  Active: {
    label: '已安装 ✓',
    className:
      'px-2.5 py-1 rounded-lg bg-white/[0.06] text-[10px] font-medium text-white/50 border border-white/[0.06] cursor-default',
  },
  Inactive: {
    label: '已安装 ✓',
    className:
      'px-2.5 py-1 rounded-lg bg-white/[0.06] text-[10px] font-medium text-white/50 border border-white/[0.06] cursor-default',
  },
  Uninstalling: {
    label: '卸载中...',
    className:
      'px-2.5 py-1 rounded-lg bg-white/[0.04] text-[10px] text-white/30 cursor-wait',
  },
  Error: {
    label: '安装失败',
    className:
      'px-2.5 py-1 rounded-lg bg-red-400/20 text-[10px] text-red-400 cursor-pointer',
  },
};

// ==================== 子组件 ====================

/** 格式化下载量为简洁显示 */
function formatDownloads(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** 缩略图：有图显示 img，无图显示分类色 bg + lucide icon fallback */
function Thumbnail({
  thumbnail,
  name,
  coverColor,
}: {
  thumbnail?: string;
  name: string;
  coverColor?: string;
}) {
  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt={name}
        className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
      />
    );
  }

  return (
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ background: coverColor || '#6B7280' }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    </div>
  );
}

// ==================== 主组件 ====================

export function CompactSkillCard({
  skill,
  onSelect,
  onInstall,
}: CompactSkillCardProps) {
  const handleCardClick = () => {
    onSelect(skill.id);
  };

  const handleInstallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInstall(skill.id);
  };

  // 根据 isInstalling/isInstalled 决定按钮状态
  const stateKey = skill.isInstalling
    ? 'Installing'
    : skill.isInstalled
      ? 'Installed'
      : 'NotInstalled';
  const btnCfg = BTN_BY_STATE[stateKey];

  return (
    <div
      data-testid="skill-card"
      onClick={handleCardClick}
      className="flex items-center gap-3 rounded-xl p-2.5 cursor-pointer transition-all duration-200 ease-out group"
      style={{
        border: '1px solid rgba(255,255,255,0.035)',
        background: 'rgba(255,255,255,0.015)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.035)';
        e.currentTarget.style.background = 'rgba(255,255,255,0.015)';
      }}
    >
      {/* 左侧缩略图 */}
      <Thumbnail
        thumbnail={skill.thumbnail}
        name={skill.name}
        coverColor={skill.coverColor}
      />

      {/* 中间信息 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-white/75 truncate">
            {skill.name}
          </span>
          {skill.emoji && (
            <span className="text-[9px] text-white/25">{skill.emoji}</span>
          )}
        </div>
        <p className="text-[10px] text-white/40 truncate mt-0.5">
          {skill.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-amber-400/60">⭐ {skill.rating}</span>
          <span className="text-[9px] text-white/20">·</span>
          <span className="text-[9px] text-white/20">
            {formatDownloads(skill.downloads)}
          </span>
        </div>
      </div>

      {/* 右侧按钮 */}
      {btnCfg.label !== null ? (
        <button
          onClick={handleInstallClick}
          className={`flex-shrink-0 transition-colors ${btnCfg.className}`}
          disabled={stateKey === 'Installed'}
        >
          {btnCfg.label}
        </button>
      ) : (
        <div className={`flex-shrink-0 ${btnCfg.className}`}>
          <svg
            className="animate-spin"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      )}
    </div>
  );
}
