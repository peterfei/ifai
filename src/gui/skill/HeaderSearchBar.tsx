/**
 * HeaderSearchBar — 头部集成搜索栏
 *
 * 集成在 Modal Header 中，含 🔍 图标、输入框、⌘K 快捷键提示。
 * 300ms 防抖搜索。
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// ==================== 类型定义 ====================

export interface HeaderSearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

// ==================== 主组件 ====================

export function HeaderSearchBar({
  onSearch,
  placeholder = '搜索技能...',
}: HeaderSearchBarProps) {
  const [value, setValue] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValue(v);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        onSearch(v);
      }, 300);
    },
    [onSearch]
  );

  // 清理 timer
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg border border-white/[0.06] px-3 py-1.5 w-40 lg:w-56 focus-within:border-brand-500/30 transition-all">
      <span className="text-xs text-white/25">🔍</span>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="flex-1 bg-transparent border-none outline-none text-xs text-white/70 placeholder-white/25"
      />
      <span className="text-[10px] text-white/15">⌘K</span>
    </div>
  );
}
