/**
 * SkillDetailPanel — 技能详情侧面板
 *
 * 从右侧滑入（340px，300ms 动画），显示完整技能详情。
 * System Prompt 区域可折叠。
 */

import React, { useState } from 'react';

// ==================== 类型定义 ====================

interface DetailSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  systemPrompt?: string;
  tags?: string[];
  rating?: number;
  downloads?: number;
  thumbnail?: string;
  isInstalled?: boolean;
  isInstalling?: boolean;
}

export interface SkillDetailPanelProps {
  skill: DetailSkill | null;
  onClose: () => void;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
}

// ==================== 工具函数 ====================

function formatDownloads(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ==================== 主组件 ====================

export function SkillDetailPanel({
  skill,
  onClose,
  onInstall,
  onUninstall,
}: SkillDetailPanelProps) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [confirmingUninstall, setConfirmingUninstall] = useState(false);

  if (!skill) return null;

  return (
    <div
      className="absolute right-0 top-0 bottom-0 flex flex-col animate-slide-in"
      style={{
        width: 340,
        background: '#1E1E1E',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        zIndex: 10,
      }}
    >
      {/* 顶部：缩略图 + 名称 + 版本 */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5 py-4 border-b border-white/[0.04]">
        {skill.thumbnail ? (
          <img
            src={skill.thumbnail}
            alt={skill.name}
            className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-brand-500/30 flex items-center justify-center flex-shrink-0 text-2xl">
            🧩
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white/90 truncate">
            {skill.name}
          </h3>
          <p className="text-[11px] text-white/40 mt-0.5">
            v{skill.version}
          </p>
        </div>
      </div>

      {/* 内容区：滚动 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* 描述 */}
        <div>
          <h4 className="text-[11px] font-medium text-white/50 mb-1">描述</h4>
          <p className="text-[12px] text-white/70 leading-relaxed">
            {skill.description}
          </p>
        </div>

        {/* 标签 */}
        {skill.tags && skill.tags.length > 0 && (
          <div>
            <h4 className="text-[11px] font-medium text-white/50 mb-1">标签</h4>
            <div className="flex flex-wrap gap-1.5">
              {skill.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-md bg-white/[0.04] text-[10px] text-white/40"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 评分 + 下载量 */}
        {(skill.rating || skill.downloads) && (
          <div className="flex items-center gap-4">
            {skill.rating && (
              <span className="text-[11px] text-amber-400/60">
                ⭐ {skill.rating}
              </span>
            )}
            {skill.downloads && (
              <span className="text-[11px] text-white/40">
                {formatDownloads(skill.downloads)} 下载
              </span>
            )}
          </div>
        )}

        {/* System Prompt 可折叠 */}
        {skill.systemPrompt && (
          <div>
            <button
              onClick={() => setPromptOpen(!promptOpen)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-white/50 hover:text-white/70 transition-colors"
            >
              <span
                className="transition-transform duration-200"
                style={{
                  transform: promptOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                }}
              >
                ▶
              </span>
              System Prompt
            </button>
            {promptOpen && (
              <pre className="mt-2 p-3 rounded-lg bg-black/30 text-[11px] text-white/60 leading-relaxed whitespace-pre-wrap font-mono">
                {skill.systemPrompt}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* 底部固定操作栏 */}
      <div className="flex-shrink-0 flex items-center gap-2 px-5 py-3 border-t border-white/[0.04]">
        {skill.isInstalling ? (
          <div className="flex-1 px-4 py-2 rounded-lg bg-brand-500 flex items-center justify-center">
            <svg
              className="animate-spin"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
        ) : skill.isInstalled ? (
          <>
            <div className="flex-1 px-4 py-2 rounded-lg bg-white/[0.06] text-[11px] font-medium text-white/50 border border-white/[0.06] text-center cursor-default">
              已安装 ✓
            </div>
            <button
              onClick={() => setConfirmingUninstall(true)}
              className="px-4 py-2 rounded-lg bg-white/[0.04] text-[11px] font-medium text-red-400/70 hover:text-red-400 hover:bg-white/[0.08] transition-colors"
            >
              卸载
            </button>
            {confirmingUninstall && (
              <button
                onClick={() => {
                  onUninstall(skill.id);
                  setConfirmingUninstall(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-red-400/20 text-[10px] font-medium text-red-400 hover:bg-red-400/30 transition-colors"
              >
                确认卸载
              </button>
            )}
            {confirmingUninstall && (
              <button
                onClick={() => setConfirmingUninstall(false)}
                className="text-[10px] text-white/40 hover:text-white/60 transition-colors whitespace-nowrap"
              >
                取消
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => onInstall(skill.id)}
            className="flex-1 px-4 py-2 rounded-lg bg-brand-500 text-[11px] font-medium text-white hover:bg-brand-600 transition-colors"
          >
            安装
          </button>
        )}
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-white/30 hover:text-white/60 transition-all"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
