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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#252526] rounded-xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden border border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-5 text-white relative">
          <button
            onClick={handleSkip}
            className="absolute right-4 top-4 text-white/70 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Key size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold">{t('apiKeyGuide.title')}</h1>
              <p className="text-white/80 text-sm mt-0.5">
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
              <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-blue-300 mb-2 flex items-center gap-2">
                  <Award size={18} />
                  {t('apiKeyGuide.zhipuSection.title')}
                </h3>
                <p className="text-sm text-gray-300 mb-3">
                  {t('apiKeyGuide.zhipuSection.description')}
                </p>

                {/* 步骤列表 */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">1</span>
                    <span>{t('apiKeyGuide.zhipuSection.step1')}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">2</span>
                    <span>{t('apiKeyGuide.zhipuSection.step2')}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">3</span>
                    <span>{t('apiKeyGuide.zhipuSection.step3')}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">4</span>
                    <span>{t('apiKeyGuide.zhipuSection.step4')}</span>
                  </div>
                </div>

                <button
                  onClick={openZhipuPlatform}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink size={16} />
                  {t('apiKeyGuide.openZhipuPlatform')}
                </button>
              </div>

              {/* 优势说明 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#2d2d2d] border border-gray-700 rounded-lg p-3 text-center">
                  <Zap size={24} className="mx-auto mb-2 text-yellow-400" />
                  <p className="text-xs text-gray-300">{t('apiKeyGuide.benefits.fast')}</p>
                </div>
                <div className="bg-[#2d2d2d] border border-gray-700 rounded-lg p-3 text-center">
                  <Shield size={24} className="mx-auto mb-2 text-green-400" />
                  <p className="text-xs text-gray-300">{t('apiKeyGuide.benefits.free')}</p>
                </div>
                <div className="bg-[#2d2d2d] border border-gray-700 rounded-lg p-3 text-center">
                  <CheckCircle size={24} className="mx-auto mb-2 text-blue-400" />
                  <p className="text-xs text-gray-300">{t('apiKeyGuide.benefits.stable')}</p>
                </div>
              </div>

              {/* 其他提供商 */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                <p className="text-sm text-gray-400">
                  <span className="font-medium text-gray-300">{t('apiKeyGuide.otherProviders')}：</span>
                  {t('apiKeyGuide.otherProvidersDesc')}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
                <p className="text-sm text-gray-300">
                  {t('apiKeyGuide.zhipuSection.step5')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {t('apiKeyGuide.apiKeyLabel')}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('apiKeyGuide.apiKeyPlaceholder')}
                  className="w-full bg-[#3c3c3c] border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-2">
                  🔒 您的 API Key 将安全存储在本地，不会上传到任何服务器
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#1e1e1e] border-t border-gray-700 flex items-center justify-between">
          {currentStep === 'guide' ? (
            <>
              <button
                onClick={handleSkip}
                className="py-2 px-4 text-gray-400 hover:text-gray-300 text-sm transition-colors"
              >
                {t('apiKeyGuide.skipForNow')}
              </button>
              <button
                onClick={() => setCurrentStep('input')}
                className="py-2.5 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all flex items-center gap-2"
              >
                <span>{t('apiKeyGuide.saveAndContinue')}</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setCurrentStep('guide')}
                className="py-2 px-4 text-gray-400 hover:text-gray-300 text-sm transition-colors"
              >
                ← 返回
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleSkip}
                  className="py-2.5 px-4 bg-gray-700 text-gray-300 rounded-lg font-medium hover:bg-gray-600 transition-colors text-sm"
                >
                  {t('apiKeyGuide.skipForNow')}
                </button>
                <button
                  onClick={handleSaveKey}
                  disabled={!apiKey.trim()}
                  className={clsx(
                    "py-2.5 px-6 rounded-lg font-medium transition-all flex items-center gap-2",
                    apiKey.trim()
                      ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                      : "bg-gray-700 text-gray-500 cursor-not-allowed"
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
