/**
 * IfAI Editor - Welcome Dialog (Onboarding)
 * =========================================
 *
 * 首次启动向导 - 欢迎对话框
 *
 * 功能：
 * - 检测首次启动
 * - 显示本地模型下载选项
 * - 提供"立即下载"、"稍后提醒"、"跳过"三个选项
 */

import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';

// ============================================================================
// Types
// ============================================================================

export interface OnboardingState {
  completed: boolean;
  skipped: boolean;
  remindCount: number;
  lastRemindDate: string | null;
}

export interface WelcomeDialogProps {
  onChoice: (choice: 'download' | 'remind' | 'skip') => void;
  onClose: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

const ONBOARDING_KEY = 'ifai_onboarding_state';

export const loadOnboardingState = (): OnboardingState => {
  try {
    const stored = localStorage.getItem(ONBOARDING_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('[Onboarding] Failed to load state:', e);
  }
  return {
    completed: false,
    skipped: false,
    remindCount: 0,
    lastRemindDate: null,
  };
};

export const saveOnboardingState = (state: OnboardingState) => {
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[Onboarding] Failed to save state:', e);
  }
};

export const shouldShowOnboarding = (): boolean => {
  // 🔥 禁用首次启动的本地模型下载提示
  return false;

  // 🔥 E2E 环境：跳过欢迎对话框
  if (typeof window !== 'undefined' && (window as any).__E2E_SKIP_STABILIZER__) {
    console.log('[shouldShowOnboarding] E2E environment detected, skipping');
    return false;
  }

  const state = loadOnboardingState();

  // 已完成或已跳过
  if (state.completed || state.skipped) {
    return false;
  }

  // 检查是否需要提醒（3天后）
  if (state.remindCount > 0 && state.lastRemindDate) {
    const lastDate = new Date(state.lastRemindDate);
    const now = new Date();
    const daysSince = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSince < 3) {
      return false;
    }

    // 最多提醒3次
    if (state.remindCount >= 3) {
      return false;
    }
  }

  return true;
};

export const completeOnboarding = () => {
  const state = loadOnboardingState();
  state.completed = true;
  saveOnboardingState(state);
};

// ============================================================================
// Component
// ============================================================================

export const WelcomeDialog: React.FC<WelcomeDialogProps> = ({ onChoice, onClose }) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 🔥 E2E 环境：跳过欢迎对话框
    if (typeof window !== 'undefined' && (window as any).__E2E_SKIP_STABILIZER__) {
      console.log('[WelcomeDialog] E2E environment detected, skipping welcome dialog');
      return;
    }

    // 检查是否应该显示
    if (shouldShowOnboarding()) {
      // 延迟显示，确保应用加载完成
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleChoice = (choice: 'download' | 'remind' | 'skip') => {
    const state = loadOnboardingState();

    switch (choice) {
      case 'download':
        // 标记为已完成，下载完成后会自动启用
        state.completed = true;
        break;

      case 'remind':
        // 增加提醒计数
        state.remindCount++;
        state.lastRemindDate = new Date().toISOString();
        break;

      case 'skip':
        // 标记为跳过
        state.skipped = true;
        break;
    }

    saveOnboardingState(state);
    setIsVisible(false);
    onChoice(choice);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="theme-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="theme-panel-elevated theme-border theme-shadow mx-4 w-full max-w-lg overflow-hidden rounded-xl border animate-fade-in">
        {/* Header */}
        <div className="theme-panel-muted theme-border border-b bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent px-6 py-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="theme-panel-elevated theme-border flex h-12 w-12 items-center justify-center rounded-lg border text-blue-500">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="theme-text text-2xl font-bold">{t('welcomeDialog.title')}</h1>
          </div>
          <p className="theme-text-muted text-sm">
            {t('welcomeDialog.description')}
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <div className="mb-6 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
            <h3 className="mb-2 font-semibold text-blue-500">{t('welcomeDialog.advantagesTitle')}</h3>
            <ul className="space-y-2 text-sm theme-text-muted">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span><strong>{String(t('welcomeDialog.advantages.offline'))}</strong>{String(t('welcomeDialog.advantages.offlineDesc'))}</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span><strong>{String(t('welcomeDialog.advantages.autocomplete'))}</strong>{String(t('welcomeDialog.advantages.autocompleteDesc'))}</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span><strong>{String(t('welcomeDialog.advantages.free'))}</strong>{String(t('welcomeDialog.advantages.freeDesc'))}</span>
              </li>
            </ul>
          </div>

          <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-amber-500">
                <p className="font-medium">{t('welcomeDialog.noticeTitle')}</p>
                <p className="theme-text-muted">{t('welcomeDialog.noticeDesc')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 space-y-3">
          <button
            onClick={() => handleChoice('download')}
            className="theme-button-primary theme-shadow flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('welcomeDialog.downloadNow')}
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleChoice('remind')}
              className="theme-button-secondary rounded-lg px-4 py-2.5 text-sm font-medium"
            >
              {t('welcomeDialog.remindLater')}
            </button>
            <button
              onClick={() => handleChoice('skip')}
              className="theme-button-secondary rounded-lg px-4 py-2.5 text-sm font-medium"
            >
              {t('welcomeDialog.skipCloud')}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="theme-panel-muted theme-border theme-text-subtle border-t px-6 py-4 text-center text-xs">
          {t('welcomeDialog.footerText')}
        </div>
      </div>
    </div>
  );
};
