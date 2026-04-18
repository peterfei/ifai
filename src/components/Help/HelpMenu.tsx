/**
 * v0.3.0: 帮助菜单组件
 *
 * 提供帮助入口，包括文档、快捷键、关于等
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Book, Keyboard, Info, RotateCcw, ExternalLink, Github, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHelpStore } from '../../stores/helpStore';
import { resetTutorialCommand } from '../Onboarding/OnboardingTour';
import { toast } from 'sonner';
import { open } from '@tauri-apps/plugin-shell';
import clsx from 'clsx';
import { ConfirmDialog } from '../UI/ConfirmDialog';

interface HelpMenuProps {
  className?: string;
}

export const HelpMenu: React.FC<HelpMenuProps> = ({ className = '' }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerClass = clsx(
    'theme-button-ghost theme-focus-ring-accent flex items-center rounded px-2 py-1 text-sm'
  );
  const itemClass = clsx(
    'theme-button-ghost theme-focus-ring-accent theme-text-muted flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm transition-colors'
  );

  const openKeyboardShortcuts = useHelpStore((state) => state.openKeyboardShortcuts);
  const openAbout = useHelpStore((state) => state.openAbout);

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
    setShowResetConfirm(true);
  };

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <ConfirmDialog
        open={showResetConfirm}
        title={t('onboarding.resetTutorial')}
        description={t('onboarding.resetConfirm')}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={() => {
          resetTutorialCommand();
          toast.info(t('onboarding.resetMessage'));
          setShowResetConfirm(false);
        }}
      />
      <button
        type="button"
        className={triggerClass}
        onClick={handleMenuToggle}
        data-testid="help-menu-button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {t('menu.help')} <ChevronDown size={14} className="ml-1" />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t('menu.help')}
          className="theme-panel-elevated theme-border theme-shadow dropdown-menu absolute top-full right-0 z-50 mt-1 w-56 rounded border py-1"
        >
          <button type="button" role="menuitem" className={itemClass} onClick={handleOpenShortcuts}>
            <Keyboard size={14} />
            <span>{t('help.keyboardShortcuts')}</span>
          </button>

          <button type="button" role="menuitem" className={itemClass} onClick={handleOpenAbout}>
            <Info size={14} />
            <span>{t('help.about')}</span>
          </button>

          <div className="theme-divider my-1 h-px"></div>

          <button type="button" role="menuitem" className={itemClass} onClick={handleOpenDocumentation}>
            <Book size={14} />
            <span>{t('help.documentation')}</span>
            <ExternalLink size={12} className="theme-text-subtle ml-auto" />
          </button>

          <button type="button" role="menuitem" className={itemClass} onClick={handleOpenGitHub}>
            <Github size={14} />
            <span>{t('help.githubRepository')}</span>
            <ExternalLink size={12} className="theme-text-subtle ml-auto" />
          </button>

          <button type="button" role="menuitem" className={itemClass} onClick={handleOpenIssues}>
            <FileText size={14} />
            <span>{t('help.reportIssue')}</span>
            <ExternalLink size={12} className="theme-text-subtle ml-auto" />
          </button>

          <div className="theme-divider my-1 h-px"></div>

          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={handleResetTutorial}
            data-testid="reset-tutorial"
          >
            <RotateCcw size={14} />
            <span>{t('onboarding.resetTutorial')}</span>
          </button>
        </div>
      )}
    </div>
  );
};
