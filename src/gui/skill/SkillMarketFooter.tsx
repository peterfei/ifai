/**
 * SkillMarketFooter — 底部状态栏
 *
 * 显示安装统计、更新时间和快捷链接。
 */

import React from 'react';

// ==================== 类型定义 ====================

export interface SkillMarketFooterProps {
  installedCount: number;
  lastUpdated: string;
}

// ==================== 主组件 ====================

export function SkillMarketFooter({
  installedCount,
  lastUpdated,
}: SkillMarketFooterProps) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between px-6 py-2.5 border-t border-white/[0.04] text-[10px] text-white/25">
      <div className="flex items-center gap-3">
        <span>已安装 {installedCount} 个技能</span>
        <span className="w-px h-3 bg-white/[0.05]" />
        <span>上次更新: {lastUpdated}</span>
      </div>
    </div>
  );
}
