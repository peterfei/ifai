import React, { useState, useRef, useEffect } from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import './LayoutSwitcher.css';

/**
 * 布局切换器组件
 * 允许用户在默认布局和自定义布局之间切换
 */
export const LayoutSwitcher: React.FC = () => {
  const { layoutMode, setLayoutMode } = useLayoutStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 键盘导航支持
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(!isOpen);
    } else if (isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      // 简单的键盘导航 - 在实际应用中可以扩展
      const modes: Array<'default' | 'custom'> = ['default', 'custom'];
      const currentIndex = modes.indexOf(layoutMode);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (currentIndex + direction + modes.length) % modes.length;
      setLayoutMode(modes[nextIndex]);
      setIsOpen(false);
    }
  };

  const selectLayout = (mode: 'default' | 'custom') => {
    setLayoutMode(mode);
    setIsOpen(false);
  };

  const getLayoutLabel = (mode: 'default' | 'custom') => {
    return mode === 'default' ? '默认布局' : '自定义布局';
  };

  const getLayoutEnglishLabel = (mode: 'default' | 'custom') => {
    return mode === 'default' ? 'Default' : 'Custom';
  };

  return (
    <div
      ref={containerRef}
      className="layout-switcher-container"
      data-testid="layout-switcher"
    >
      <button
        data-testid="layout-button"
        data-current-layout={layoutMode}
        className="layout-button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        title={layoutMode === 'default' ? '切换到自定义布局' : '切换到默认布局'}
        aria-label="切换布局"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="layout-icon"
        >
          {layoutMode === 'default' ? (
            // 默认布局图标（右侧聊天）
            <>
              <rect x="1" y="1" width="10" height="14" rx="1" fill="currentColor" opacity="0.3"/>
              <rect x="12" y="1" width="3" height="14" rx="1" fill="currentColor"/>
            </>
          ) : (
            // 自定义布局图标（左侧聊天）
            <>
              <rect x="1" y="1" width="3" height="14" rx="1" fill="currentColor"/>
              <rect x="5" y="1" width="10" height="14" rx="1" fill="currentColor" opacity="0.3"/>
            </>
          )}
        </svg>
      </button>

      {isOpen && (
        <div
          className="layout-menu"
          data-testid="layout-menu"
          role="menu"
          aria-label="布局选择菜单"
        >
          <div
            className={`layout-menu-item ${layoutMode === 'default' ? 'active' : ''}`}
            data-testid="layout-default"
            data-selected={layoutMode === 'default' ? 'true' : 'false'}
            role="menuitem"
            tabIndex={layoutMode === 'default' ? -1 : 0}
            aria-selected={layoutMode === 'default'}
            onClick={() => selectLayout('default')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="layout-icon">
              <rect x="1" y="1" width="10" height="14" rx="1" fill="currentColor" opacity="0.3"/>
              <rect x="12" y="1" width="3" height="14" rx="1" fill="currentColor"/>
            </svg>
            <span className="layout-label">
              {getLayoutLabel('default')}
              <span className="layout-english-label">{getLayoutEnglishLabel('default')}</span>
            </span>
            {layoutMode === 'default' && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="check-icon">
                <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
            )}
          </div>

          <div
            className={`layout-menu-item ${layoutMode === 'custom' ? 'active' : ''}`}
            data-testid="layout-custom"
            data-selected={layoutMode === 'custom' ? 'true' : 'false'}
            role="menuitem"
            tabIndex={layoutMode === 'custom' ? -1 : 0}
            aria-selected={layoutMode === 'custom'}
            onClick={() => selectLayout('custom')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="layout-icon">
              <rect x="1" y="1" width="3" height="14" rx="1" fill="currentColor"/>
              <rect x="5" y="1" width="10" height="14" rx="1" fill="currentColor" opacity="0.3"/>
            </svg>
            <span className="layout-label">
              {getLayoutLabel('custom')}
              <span className="layout-english-label">{getLayoutEnglishLabel('custom')}</span>
            </span>
            {layoutMode === 'custom' && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="check-icon">
                <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
