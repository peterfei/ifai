/**
 * CategoryPills — 分类导航 Pill 芯片
 *
 * 圆角 pill 形状的分类选择器，支持横向溢出隐藏。
 * 选中/未选中样式通过 PILL_STYLES 查表。
 */

import React from 'react';

// ==================== 类型定义 ====================

export interface CategoryPillsProps {
  categories: string[];
  selected: string;
  totalCount: number;
  onSelect: (category: string) => void;
}

// ==================== PILL_STYLES 查表 ====================

const PILL_STYLES = {
  selected: {
    className:
      'text-white/70 font-medium border border-solid',
    borderColor: 'rgba(0,122,204,0.25)',
  },
  unselected: {
    className:
      'text-white/40 border border-solid border-transparent hover:border-white/[0.06]',
  },
} as const;

// ==================== 主组件 ====================

export function CategoryPills({
  categories,
  selected,
  totalCount,
  onSelect,
}: CategoryPillsProps) {
  return (
    <div className="flex-shrink-0 flex items-center gap-1.5 px-6 py-3 border-b border-white/[0.04] overflow-hidden">
      {categories.map((cat) => {
        const isActive = cat === selected;
        const style = isActive ? PILL_STYLES.selected : PILL_STYLES.unselected;
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] transition-all duration-200 ${style.className}`}
            style={
              isActive
                ? { borderColor: 'rgba(0,122,204,0.25)' }
                : undefined
            }
          >
            {cat}
          </button>
        );
      })}
      <div className="ml-auto flex items-center gap-1.5 text-[10px] text-white/25">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/50" />
        <span>{totalCount} 个技能</span>
      </div>
    </div>
  );
}
