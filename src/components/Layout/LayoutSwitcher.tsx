import React, { useState, useRef, useEffect } from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import { useTranslation } from 'react-i18next';
import './LayoutSwitcher.css';

/**
 * 布局切换器组件 - 工业级UI设计
 *
 * 特性：
 * - 清晰的视觉标识
 * - 专业的图标设计
 * - 流畅的动画过渡
 * - 明确的状态反馈
 * - 优秀的可访问性
 */
export const LayoutSwitcher: React.FC = () => {
  const { t } = useTranslation();
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
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // 键盘导航
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(!isOpen);
    } else if (isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const modes: Array<'default' | 'custom'> = layoutMode === 'default' ? ['custom'] : ['default'];
      setLayoutMode(modes[0]);
      setIsOpen(false);
    }
  };

  const selectLayout = (mode: 'default' | 'custom') => {
    setLayoutMode(mode);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="layout-switcher"
      data-testid="layout-switcher"
    >
      {/* 触发按钮 */}
      <button
        data-testid="layout-button"
        data-current-layout={layoutMode}
        className={`layout-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-label={t('layout.switcher.toggleLayout')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          className="layout-icon"
        >
          {/* 外边框 */}
          <rect
            x="1"
            y="1"
            width="18"
            height="18"
            rx="2"
            className="layout-icon-border"
            strokeWidth="1.5"
          />
          {/* 内部布局 - 根据模式变化 */}
          {layoutMode === 'default' ? (
            <>
              {/* 默认布局：右侧聊天面板 */}
              <rect x="3" y="4" width="10" height="12" rx="1" fill="currentColor" opacity="0.2"/>
              <rect x="14" y="4" width="3" height="12" rx="0.5" fill="currentColor" className="layout-icon-active"/>
            </>
          ) : (
            <>
              {/* 自定义布局：左侧聊天面板 */}
              <rect x="3" y="4" width="3" height="12" rx="0.5" fill="currentColor" className="layout-icon-active"/>
              <rect x="7" y="4" width="10" height="12" rx="1" fill="currentColor" opacity="0.2"/>
            </>
          )}
        </svg>

        {/* 标签文字 */}
        <span className="layout-label">
          {layoutMode === 'default' ? t('layout.switcher.default') : t('layout.switcher.custom')}
        </span>

        {/* 下拉箭头 */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`dropdown-arrow ${isOpen ? 'open' : ''}`}
        >
          <path
            d="M2 4L6 8L10 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div
          className="layout-dropdown"
          data-testid="layout-menu"
          role="menu"
          aria-label={t('layout.switcher.selectLayout')}
        >
          {/* 菜单标题 */}
          <div className="layout-dropdown-header">
            <span className="layout-dropdown-title">{t('layout.switcher.layoutMode')}</span>
            <span className="layout-dropdown-subtitle">Layout Mode</span>
          </div>

          {/* 分隔线 */}
          <div className="layout-dropdown-divider"/>

          {/* 默认布局选项 */}
          <div
            className={`layout-option ${layoutMode === 'default' ? 'selected' : ''}`}
            data-testid="layout-default"
            data-selected={layoutMode === 'default' ? 'true' : 'false'}
            role="menuitem"
            tabIndex={layoutMode === 'default' ? -1 : 0}
            aria-selected={layoutMode === 'default'}
            onClick={() => selectLayout('default')}
          >
            <div className="layout-option-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="3" width="14" height="18" rx="2" fill="currentColor" opacity="0.15"/>
                <rect x="18" y="3" width="4" height="18" rx="1" fill="currentColor" className="layout-option-icon-accent"/>
              </svg>
            </div>
            <div className="layout-option-content">
              <span className="layout-option-title">{t('layout.switcher.defaultLayout')}</span>
              <span className="layout-option-description">{t('layout.switcher.defaultLayoutDesc')}</span>
            </div>
            {layoutMode === 'default' && (
              <div className="layout-option-check">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8L6.5 11.5L13 4.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* 自定义布局选项 */}
          <div
            className={`layout-option ${layoutMode === 'custom' ? 'selected' : ''}`}
            data-testid="layout-custom"
            data-selected={layoutMode === 'custom' ? 'true' : 'false'}
            role="menuitem"
            tabIndex={layoutMode === 'custom' ? -1 : 0}
            aria-selected={layoutMode === 'custom'}
            onClick={() => selectLayout('custom')}
          >
            <div className="layout-option-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="3" width="4" height="18" rx="1" fill="currentColor" className="layout-option-icon-accent"/>
                <rect x="7" y="3" width="14" height="18" rx="2" fill="currentColor" opacity="0.15"/>
              </svg>
            </div>
            <div className="layout-option-content">
              <span className="layout-option-title">{t('layout.switcher.customLayout')}</span>
              <span className="layout-option-description">{t('layout.switcher.customLayoutDesc')}</span>
            </div>
            {layoutMode === 'custom' && (
              <div className="layout-option-check">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8L6.5 11.5L13 4.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* 分隔线 */}
          <div className="layout-dropdown-divider"/>

          {/* 提示信息 */}
          <div className="layout-dropdown-footer">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="layout-dropdown-footer-icon">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M7 4V8M7 10V10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="layout-dropdown-footer-text">{t('layout.switcher.autoSave')}</span>
          </div>
        </div>
      )}
    </div>
  );
};
