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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-8 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">{t('welcomeDialog.title')}</h1>
          </div>
          <p className="text-white/90 text-sm">
            {t('welcomeDialog.description')}
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">{t('welcomeDialog.advantagesTitle')}</h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span><strong>{t('welcomeDialog.advantages.offline')}</strong>{t('welcomeDialog.advantages.offlineDesc')}</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span><strong>{t('welcomeDialog.advantages.autocomplete')}</strong>{t('welcomeDialog.advantages.autocompleteDesc')}</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span><strong>{t('welcomeDialog.advantages.free')}</strong>{t('welcomeDialog.advantages.freeDesc')}</span>
              </li>
            </ul>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-amber-800">
                <p className="font-medium">{t('welcomeDialog.noticeTitle')}</p>
                <p>{t('welcomeDialog.noticeDesc')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 space-y-3">
          <button
            onClick={() => handleChoice('download')}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('welcomeDialog.downloadNow')}
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleChoice('remind')}
              className="py-2.5 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors text-sm"
            >
              {t('welcomeDialog.remindLater')}
            </button>
            <button
              onClick={() => handleChoice('skip')}
              className="py-2.5 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors text-sm"
            >
              {t('welcomeDialog.skipCloud')}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t text-center text-xs text-gray-500">
          {t('welcomeDialog.footerText')}
        </div>
      </div>
    </div>
  );
};
