/**
 * IfAI Editor - API Key Guide Dialog
 * ===================================
 *
 * 首次启动向导 - API Key 引导对话框
 *
 * 功能：
 * - 引导用户获取智谱 AI API Key
 * - 提供清晰的注册步骤说明
 * - 直接链接到智谱平台
 * - 支持稍后配置
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settingsStore';
import { ExternalLink, Key, CheckCircle, Zap, Award, Shield, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';

// ============================================================================
// Types
// ============================================================================

export interface APIKeyGuideDialogProps {
  onComplete: () => void;
  onSkip: () => void;
}

const GUIDE_STORAGE_KEY = 'ifai_apikey_guide_completed';

// ============================================================================
// Helper Functions
// ============================================================================

export const shouldShowAPIKeyGuide = (): boolean => {
  try {
    const completed = localStorage.getItem(GUIDE_STORAGE_KEY);
    if (completed === 'true') {
      return false;
    }
  } catch (e) {
    console.error('[APIKeyGuide] Failed to check state:', e);
  }

  // 检查是否已有配置的 API key
  try {
    const settings = (window as any).__settingsStore;
    if (settings) {
      const state = settings.getState();
      const hasKey = state.providers.some(
        (p: any) => p.apiKey && p.apiKey.trim() !== ''
      );
      if (hasKey) {
        return false;
      }
    }
  } catch (e) {
    // Ignore
  }

  return true;
};

export const markAPIKeyGuideCompleted = () => {
  try {
    localStorage.setItem(GUIDE_STORAGE_KEY, 'true');
  } catch (e) {
    console.error('[APIKeyGuide] Failed to save state:', e);
  }
};

// ============================================================================
// Component
// ============================================================================

export const APIKeyGuideDialog: React.FC<APIKeyGuideDialogProps> = ({
  onComplete,
  onSkip,
}) => {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const [apiKey, setApiKey] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<'guide' | 'input'>('guide');

  useEffect(() => {
    if (shouldShowAPIKeyGuide()) {
      const timer = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      // 保存到智谱提供商
      settings.updateProviderConfig('zhipu', { apiKey: apiKey.trim() });

      // 设置为当前提供商
      if (settings.providers.find(p => p.id === 'zhipu')?.models) {
        const zhipuProvider = settings.providers.find(p => p.id === 'zhipu');
        if (zhipuProvider && zhipuProvider.models.length > 0) {
          settings.setCurrentProviderAndModel('zhipu', zhipuProvider.models[0]);
        }
      }

      markAPIKeyGuideCompleted();
      setIsOpen(false);
      onComplete();
    }
  };

  const handleSkip = () => {
    markAPIKeyGuideCompleted();
    setIsOpen(false);
    onSkip();
  };

  const openZhipuPlatform = async () => {
    try {
      await open('https://open.bigmodel.cn/usercenter/apikeys');
    } catch (error) {
      console.error('Failed to open Zhipu platform:', error);
      // Fallback to window.open
      window.open('https://open.bigmodel.cn/usercenter/apikeys', '_blank');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="theme-backdrop-strong fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="theme-panel-elevated theme-border theme-shadow mx-4 w-full max-w-2xl overflow-hidden rounded-xl border">
        {/* Header */}
        <div className="theme-panel-muted theme-border relative border-b bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent px-6 py-5">
          <button
            onClick={handleSkip}
            className="theme-button-ghost theme-text-subtle absolute right-4 top-4 rounded p-1"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="theme-panel-elevated theme-border flex h-10 w-10 items-center justify-center rounded-lg border text-blue-500">
              <Key size={22} />
            </div>
            <div>
              <h1 className="theme-text text-xl font-bold">{t('apiKeyGuide.title')}</h1>
              <p className="theme-text-muted mt-0.5 text-sm">
                {t('apiKeyGuide.description')}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {currentStep === 'guide' ? (
            <div className="space-y-5">
              {/* 智谱 AI 推荐部分 */}
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
                <h3 className="mb-2 flex items-center gap-2 font-semibold text-blue-500">
                  <Award size={18} />
                  {t('apiKeyGuide.zhipuSection.title')}
                </h3>
                <p className="theme-text-muted mb-3 text-sm">
                  {t('apiKeyGuide.zhipuSection.description')}
                </p>

                {/* 步骤列表 */}
                <div className="space-y-2 mb-4">
                  <div className="theme-text-muted flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">1</span>
                    <span>{t('apiKeyGuide.zhipuSection.step1')}</span>
                  </div>
                  <div className="theme-text-muted flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">2</span>
                    <span>{t('apiKeyGuide.zhipuSection.step2')}</span>
                  </div>
                  <div className="theme-text-muted flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">3</span>
                    <span>{t('apiKeyGuide.zhipuSection.step3')}</span>
                  </div>
                  <div className="theme-text-muted flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">4</span>
                    <span>{t('apiKeyGuide.zhipuSection.step4')}</span>
                  </div>
                </div>

                <button
                  onClick={openZhipuPlatform}
                  className="theme-button-primary flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-medium"
                >
                  <ExternalLink size={16} />
                  {t('apiKeyGuide.openZhipuPlatform')}
                </button>
              </div>

              {/* 优势说明 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="theme-panel-muted theme-border rounded-lg border p-3 text-center">
                  <Zap size={24} className="mx-auto mb-2 text-yellow-400" />
                  <p className="theme-text-muted text-xs">{t('apiKeyGuide.benefits.fast')}</p>
                </div>
                <div className="theme-panel-muted theme-border rounded-lg border p-3 text-center">
                  <Shield size={24} className="mx-auto mb-2 text-green-400" />
                  <p className="theme-text-muted text-xs">{t('apiKeyGuide.benefits.free')}</p>
                </div>
                <div className="theme-panel-muted theme-border rounded-lg border p-3 text-center">
                  <CheckCircle size={24} className="mx-auto mb-2 text-blue-400" />
                  <p className="theme-text-muted text-xs">{t('apiKeyGuide.benefits.stable')}</p>
                </div>
              </div>

              {/* 其他提供商 */}
              <div className="theme-panel-muted theme-border rounded-lg border p-3">
                <p className="theme-text-subtle text-sm">
                  <span className="theme-text font-medium">{t('apiKeyGuide.otherProviders')}：</span>
                  {t('apiKeyGuide.otherProvidersDesc')}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
                <p className="theme-text-muted text-sm">
                  {t('apiKeyGuide.zhipuSection.step5')}
                </p>
              </div>

              <div>
                <label className="theme-text mb-2 block text-sm font-medium">
                  {t('apiKeyGuide.apiKeyLabel')}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('apiKeyGuide.apiKeyPlaceholder')}
                  className="theme-input-surface theme-border theme-text w-full rounded-lg border px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
                <p className="theme-text-subtle mt-2 text-xs">
                  您的 API Key 将安全存储在本地，不会上传到任何服务器
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="theme-panel-muted theme-border flex items-center justify-between border-t px-6 py-4">
          {currentStep === 'guide' ? (
            <>
              <button
                onClick={handleSkip}
                className="theme-button-ghost rounded px-4 py-2 text-sm"
              >
                {t('apiKeyGuide.skipForNow')}
              </button>
              <button
                onClick={() => setCurrentStep('input')}
                className="theme-button-primary flex items-center gap-2 rounded-lg px-6 py-2.5 font-medium"
              >
                <span>{t('apiKeyGuide.saveAndContinue')}</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setCurrentStep('guide')}
                className="theme-button-ghost rounded px-4 py-2 text-sm"
              >
                ← 返回
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleSkip}
                  className="theme-button-secondary rounded-lg px-4 py-2.5 text-sm font-medium"
                >
                  {t('apiKeyGuide.skipForNow')}
                </button>
                <button
                  onClick={handleSaveKey}
                  disabled={!apiKey.trim()}
                  className={clsx(
                    'flex items-center gap-2 rounded-lg px-6 py-2.5 font-medium transition-all',
                    apiKey.trim()
                      ? 'theme-button-primary'
                      : 'theme-input-surface theme-text-subtle cursor-not-allowed'
                  )}
                >
                  <CheckCircle size={16} />
                  <span>{t('apiKeyGuide.saveAndContinue')}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// clsx 简化实现
function clsx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
