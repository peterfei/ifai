/**
 * v0.3.0: 帮助菜单组件
 *
 * 提供帮助入口，包括文档、快捷键、关于等
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Book, Keyboard, Info, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { AboutModal } from './AboutModal';
import { useHelpStore } from '../../stores/helpStore';
import { resetTutorialCommand } from '../Onboarding/OnboardingTour';
import { toast } from 'sonner';
import { open } from '@tauri-apps/plugin-shell';
import clsx from 'clsx';

interface HelpMenuProps {
  className?: string;
}

export const HelpMenu: React.FC<HelpMenuProps> = ({ className = '' }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerClass = clsx(
    'theme-button-ghost flex items-center rounded px-2 py-1 text-sm'
  );
  const itemClass = clsx(
    'theme-text-muted theme-hoverable flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition-colors'
  );

  // v0.3.0: 使用全局 store 管理弹窗状态
  const { isKeyboardShortcutsOpen, closeKeyboardShortcuts, isAboutOpen, closeAbout, openKeyboardShortcuts, openAbout } = useHelpStore();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleOpenShortcuts = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    openKeyboardShortcuts();
  };

  const handleOpenAbout = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    openAbout();
  };

  const handleOpenDocumentation = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    try {
      await open('https://github.com/peterfei/ifai/wiki');
    } catch (error) {
      console.error('Failed to open documentation:', error);
      window.open('https://github.com/peterfei/ifai/wiki', '_blank');
    }
  };

  const handleOpenGitHub = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    try {
      await open('https://github.com/peterfei/ifai');
    } catch (error) {
      console.error('Failed to open GitHub:', error);
      window.open('https://github.com/peterfei/ifai', '_blank');
    }
  };

  const handleOpenIssues = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    try {
      await open('https://github.com/peterfei/ifai/issues');
    } catch (error) {
      console.error('Failed to open issues:', error);
      window.open('https://github.com/peterfei/ifai/issues', '_blank');
    }
  };

  const handleResetTutorial = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (confirm(t('onboarding.resetConfirm') || '确定要重置新手引导吗？')) {
      resetTutorialCommand();
      toast.info(t('onboarding.resetMessage') || '页面将重新加载以显示新手引导');
    }
  };

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        className={triggerClass}
        onClick={handleMenuToggle}
        data-testid="help-menu-button"
      >
        {t('menu.help')} <ChevronDown size={14} className="ml-1" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="theme-panel-elevated theme-border theme-shadow dropdown-menu absolute top-full right-0 z-50 mt-1 w-56 rounded border py-1"
        >
          <div className={itemClass} onClick={handleOpenShortcuts}>
            <Keyboard size={14} />
            {t('help.keyboardShortcuts')}
            <span className="theme-text-subtle ml-auto text-xs">?</span>
          </div>

          <div className={itemClass} onClick={handleOpenAbout}>
            <Info size={14} />
            {t('help.about')}
          </div>

          <div className="theme-divider my-1 h-px"></div>

          <div className={itemClass} onClick={handleOpenDocumentation}>
            <Book size={14} />
            {t('help.documentation')}
          </div>

          <div className={itemClass} onClick={handleOpenGitHub}>
            {t('help.githubRepository')}
            <span className="theme-text-subtle ml-auto text-xs">GitHub</span>
          </div>

          <div className={itemClass} onClick={handleOpenIssues}>
            {t('help.reportIssue')}
            <span className="theme-text-subtle ml-auto text-xs">GitHub</span>
          </div>

          <div className="theme-divider my-1 h-px"></div>

          <div className={itemClass} onClick={handleResetTutorial} data-testid="reset-tutorial">
            <RotateCcw size={14} />
            {t('onboarding.resetTutorial') || '重置新手引导'}
          </div>
        </div>
      )}

      {/* 快捷键弹窗 */}
      <KeyboardShortcutsModal
        isOpen={isKeyboardShortcutsOpen}
        onClose={closeKeyboardShortcuts}
      />

      {/* 关于弹窗 */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={closeAbout}
      />
    </div>
  );
};
