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

interface HelpMenuProps {
  className?: string;
}

export const HelpMenu: React.FC<HelpMenuProps> = ({ className = '' }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const handleOpenDocumentation = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    window.open('https://docs.anthropic.com/claude-code', '_blank');
  };

  const handleOpenGitHub = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    window.open('https://github.com/anthropics/claude-code', '_blank');
  };

  const handleOpenIssues = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    window.open('https://github.com/anthropics/claude-code/issues', '_blank');
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
        className="flex items-center text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700"
        onClick={handleMenuToggle}
        data-testid="help-menu-button"
      >
        {t('menu.help')} <ChevronDown size={14} className="ml-1" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1 bg-gray-700 rounded shadow-lg z-50 py-1 w-56 dropdown-menu"
        >
          <div
            className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer flex items-center gap-2"
            onClick={handleOpenShortcuts}
          >
            <Keyboard size={14} />
            {t('help.keyboardShortcuts')}
            <span className="ml-auto text-xs text-gray-500">?</span>
          </div>

          <div
            className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer flex items-center gap-2"
            onClick={handleOpenAbout}
          >
            <Info size={14} />
            {t('help.about')}
          </div>

          <div className="border-t border-gray-600 my-1"></div>

          <div
            className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer flex items-center gap-2"
            onClick={handleOpenDocumentation}
          >
            <Book size={14} />
            {t('help.documentation')}
          </div>

          <div
            className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer flex items-center gap-2"
            onClick={handleOpenGitHub}
          >
            {t('help.githubRepository')}
            <span className="ml-auto text-xs text-gray-500">GitHub</span>
          </div>

          <div
            className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer flex items-center gap-2"
            onClick={handleOpenIssues}
          >
            {t('help.reportIssue')}
            <span className="ml-auto text-xs text-gray-500">GitHub</span>
          </div>

          <div className="border-t border-gray-600 my-1"></div>

          <div
            className="px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer flex items-center gap-2"
            onClick={handleResetTutorial}
            data-testid="reset-tutorial"
          >
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
