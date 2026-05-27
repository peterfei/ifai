/**
 * RecommendCard — 推荐区技能卡片
 *
 * 稍大水平布局，用于"为你推荐"区域。
 * 标签徽章通过 BADGE_BY_TYPE 查表。
 */

import React from 'react';

// ==================== 类型定义 ====================

export interface RecommendSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  rating: number;
  downloads: number;
  thumbnail?: string;
  badge: 'recommended' | 'popular' | null;
  isInstalled: boolean;
}

export interface RecommendCardProps {
  skill: RecommendSkill;
  onSelect: (id: string) => void;
  onInstall: (id: string) => void;
}

// ==================== BADGE_BY_TYPE 查表 ====================

const BADGE_BY_TYPE = {
  recommended: {
    label: '推荐',
    className:
      'text-[9px] text-brand-300 bg-brand-500/20 px-1 rounded font-medium',
  },
  popular: {
    label: '热门',
    className: 'text-[9px] text-emerald-400 bg-emerald-500/12 px-1 rounded',
  },
} as const;

// ==================== 工具函数 ====================

function formatDownloads(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ==================== 主组件 ====================

export function RecommendCard({ skill, onSelect, onInstall }: RecommendCardProps) {
  const handleInstall = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInstall(skill.id);
  };

  const btnClassName = skill.isInstalled
    ? 'flex-shrink-0 px-3 py-1 rounded-lg bg-white/[0.06] text-[10px] font-medium text-white/50 border border-white/[0.06] cursor-default'
    : 'flex-shrink-0 px-3 py-1 rounded-lg bg-brand-500 text-[10px] font-medium text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25 hover:shadow-brand-500/35';

  return (
    <div
      onClick={() => onSelect(skill.id)}
      className="flex items-center gap-3 flex-1 rounded-xl p-3 cursor-pointer transition-all duration-200"
      style={{
        border: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      {/* 缩略图 */}
      {skill.thumbnail ? (
        <img
          src={skill.thumbnail}
          alt={skill.name}
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-brand-500/30 flex items-center justify-center flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </div>
      )}

      {/* 信息区 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-white/80 truncate">
            {skill.name}
          </span>
          {skill.badge && (
            <span className={BADGE_BY_TYPE[skill.badge].className}>
              {BADGE_BY_TYPE[skill.badge].label}
            </span>
          )}
        </div>
        <p className="text-[10px] text-white/40 mt-0.5 truncate">
          {skill.description}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[9px] text-white/25">v{skill.version}</span>
          <span className="text-[9px] text-amber-400/60">⭐ {skill.rating}</span>
          <span className="text-[9px] text-white/25">
            {formatDownloads(skill.downloads)}
          </span>
        </div>
      </div>

      {/* 按钮 */}
      <button
        onClick={handleInstall}
        className={btnClassName}
        disabled={skill.isInstalled}
      >
        {skill.isInstalled ? '已安装' : '安装'}
      </button>
    </div>
  );
}
