/**
 * SortSelector — 排序选择器
 *
 * "全部技能"区域的排序切换，3 个选项：热门 | 最新 | 评分。
 */

import React from 'react';

// ==================== 类型定义 ====================

export type SortOption = 'popular' | 'newest' | 'rating';

export interface SortSelectorProps {
  sortBy: SortOption;
  onChange: (sort: SortOption) => void;
}

// ==================== SORT_OPTIONS 查表 ====================

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'popular', label: '热门' },
  { value: 'newest', label: '最新' },
  { value: 'rating', label: '评分' },
];

// ==================== 主组件 ====================

export function SortSelector({ sortBy, onChange }: SortSelectorProps) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-white/25">
      <span>排序:</span>
      {SORT_OPTIONS.map((opt, i) => (
        <React.Fragment key={opt.value}>
          {i > 0 && <span className="text-white/15">|</span>}
          <span
            onClick={() => onChange(opt.value)}
            className={`cursor-pointer transition-colors ${
              sortBy === opt.value
                ? 'text-white/40 hover:text-white/60'
                : 'text-white/25 hover:text-white/60'
            }`}
          >
            {opt.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
