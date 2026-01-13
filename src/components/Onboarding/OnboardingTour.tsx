/**
 * v0.3.0: 新手引导 Tour 组件
 *
 * 使用 react-joyride 实现的新手引导流程
 *
 * 功能：
 * - 首次启动自动触发
 * - 支持跳过引导
 * - 支持重置引导（通过命令面板或设置）
 * - LocalStorage 状态持久化
 * - Markdown 内容渲染支持
 */

import React, { useState, useEffect, useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '../../stores/layoutStore';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import './OnboardingTour.css';

// ============================================================================
// Constants
// ============================================================================

const TOUR_COMPLETED_KEY = 'tour_completed';
const TOUR_SKIPPED_KEY = 'tour_skipped';
const ONBOARDING_DONE_KEY = 'onboarding_done';

// ============================================================================
// Types
// ============================================================================

export interface OnboardingTourProps {
  // 是否强制启动（用于重置功能）
  forceStart?: boolean;
  // 启动完成的回调
  onTourComplete?: () => void;
  // 跳过的回调
  onTourSkip?: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 检查是否已完成引导
 */
export const isTourCompleted = (): boolean => {
  try {
    return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true' ||
           localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
  } catch {
    return false;
  }
};

/**
 * 检查是否已跳过引导
 */
export const isTourSkipped = (): boolean => {
  try {
    return localStorage.getItem(TOUR_SKIPPED_KEY) === 'true';
  } catch {
    return false;
  }
};

/**
 * 检查是否应该显示引导
 */
export const shouldShowTour = (): boolean => {
  return !isTourCompleted() && !isTourSkipped();
};

/**
 * 标记引导为已完成
 */
export const markTourCompleted = () => {
  try {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
    localStorage.setItem(TOUR_SKIPPED_KEY, 'false');
  } catch (e) {
    console.error('[OnboardingTour] Failed to mark tour as completed:', e);
  }
};

/**
 * 标记引导为已跳过
 */
export const markTourSkipped = () => {
  try {
    localStorage.setItem(TOUR_SKIPPED_KEY, 'true');
  } catch (e) {
    console.error('[OnboardingTour] Failed to mark tour as skipped:', e);
  }
};

/**
 * 重置引导状态
 */
export const resetTourState = () => {
  try {
    localStorage.removeItem(TOUR_COMPLETED_KEY);
    localStorage.removeItem(TOUR_SKIPPED_KEY);
    localStorage.removeItem(ONBOARDING_DONE_KEY);
  } catch (e) {
    console.error('[OnboardingTour] Failed to reset tour state:', e);
  }
};

// ============================================================================
// Tour Steps Definition
// ============================================================================

const getTourSteps = (t: (key: string) => string): Step[] => {
  // 创建 Markdown 渲染组件的辅助函数
  const renderMarkdown = (content: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkBreaks, remarkGfm]}
      components={{
        // 自定义段落样式，保持一致的行高
        p: ({ children }) => <p style={{ margin: '0.5em 0' }}>{children}</p>,
        // 自定义列表样式
        ul: ({ children }) => <ul style={{ marginLeft: '1.5em', marginTop: '0.5em', marginBottom: '0.5em' }}>{children}</ul>,
        // 自定义 strong/b 样式
        strong: ({ children }) => <strong style={{ fontWeight: '600', color: '#fff' }}>{children}</strong>,
        // 自定义代码样式
        code: ({ inline, children }) => inline ? (
          <code style={{
            backgroundColor: 'rgba(255,255,255,0.1)',
            padding: '0.2em 0.4em',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.9em',
          }}>{children}</code>
        ) : (
          <code>{children}</code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );

  return [
    // 步骤 1: 欢迎屏幕（居中显示）
    {
      target: 'body',
      content: renderMarkdown(t('onboarding.steps.welcome')),
      title: t('onboarding.steps.welcomeTitle'),
      disableBeacon: true,
      placement: 'center' as const,
    },
    // 步骤 2: CommandBar 演示（居中显示，动态打开）
    {
      target: 'body',
      content: renderMarkdown(t('onboarding.steps.commandBar')),
      title: t('onboarding.steps.commandBarTitle'),
      disableBeacon: true,
      placement: 'center' as const,
    },
    // 步骤 3: Settings 演示（居中显示，动态打开）
    {
      target: 'body',
      content: renderMarkdown(t('onboarding.steps.settingsGuide')),
      title: t('onboarding.steps.settingsGuideTitle'),
      disableBeacon: true,
      placement: 'center' as const,
    },
    // 步骤 4: 布局切换器
    {
      target: '[data-testid="layout-switcher"]',
      content: renderMarkdown(t('onboarding.steps.layoutSwitcher')),
      title: t('onboarding.steps.layoutSwitcherTitle'),
      placement: 'bottom' as const,
    },
  ];
};

// ============================================================================
// Component
// ============================================================================

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  forceStart = false,
  onTourComplete,
  onTourSkip,
}) => {
  const { t } = useTranslation();
  const [run, setRun] = useState(false);
  const { setCommandBarOpen, setSettingsOpen } = useLayoutStore();

  // 检查是否应该启动引导
  useEffect(() => {
    if (forceStart || shouldShowTour()) {
      console.log('[OnboardingTour] Waiting for targets to be mounted...');

      // 目标元素选择器（只检查静态元素）
      const targets = [
        'body',
        '[data-testid="layout-switcher"]'
      ];

      // 轮询检测目标元素是否存在
      let checkInterval: NodeJS.Timeout | null = null;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const checkTargets = () => {
        const missingTargets = targets.filter(t => !document.querySelector(t));

        if (missingTargets.length === 0) {
          // 所有目标都存在，启动 Tour
          console.log('[OnboardingTour] All targets mounted, starting tour...');
          if (checkInterval) clearInterval(checkInterval);
          if (timeoutTimer) clearTimeout(timeoutTimer);
          setRun(true);
        } else {
          console.log('[OnboardingTour] Still waiting for targets:', missingTargets);
        }
      };

      // 立即检查一次
      checkTargets();

      // 每 500ms 检查一次，最多等待 3 秒
      checkInterval = setInterval(checkTargets, 500);
      timeoutTimer = setTimeout(() => {
        if (checkInterval) clearInterval(checkInterval);
        const missingTargets = targets.filter(t => !document.querySelector(t));
        if (missingTargets.length > 0) {
          console.warn('[OnboardingTour] Timeout - some targets still missing:', missingTargets);
          // 即使有缺失的目标也启动 Tour
          setRun(true);
        }
      }, 3000);

      return () => {
        if (checkInterval) clearInterval(checkInterval);
        if (timeoutTimer) clearTimeout(timeoutTimer);
      };
    }
  }, [forceStart]);

  // 处理引导回调
  const handleCallback = useCallback((data: CallBackProps) => {
    const { status, index, action, type } = data;

    console.log('[OnboardingTour] Callback:', { status, index, action, type });

    // 步骤开始前：打开对应组件
    if (type === 'step:before') {
      console.log('[OnboardingTour] Step before:', index);

      // 步骤 2 (index 1): 打开 CommandBar
      if (index === 1) {
        console.log('[OnboardingTour] Opening CommandBar');
        setCommandBarOpen(true);
      }
      // 步骤 3 (index 2): 打开 Settings
      if (index === 2) {
        console.log('[OnboardingTour] Opening Settings');
        setSettingsOpen(true);
      }
    }

    // 步骤结束后：关闭组件
    if (type === 'step:after') {
      console.log('[OnboardingTour] Step after:', index);

      // 离开步骤 2 (index 1): 关闭 CommandBar
      if (index === 1) {
        console.log('[OnboardingTour] Closing CommandBar');
        setCommandBarOpen(false);
      }
      // 离开步骤 3 (index 2): 关闭 Settings
      if (index === 2) {
        console.log('[OnboardingTour] Closing Settings');
        setSettingsOpen(false);
      }
    }

    // 处理完成状态
    if (status === STATUS.FINISHED) {
      console.log('[OnboardingTour] Tour finished');
      setRun(false);
      // 确保所有组件都已关闭
      setCommandBarOpen(false);
      setSettingsOpen(false);
      markTourCompleted();
      onTourComplete?.();
    } else if (status === STATUS.SKIPPED) {
      console.log('[OnboardingTour] Tour skipped');
      setRun(false);
      setCommandBarOpen(false);
      setSettingsOpen(false);
      markTourSkipped();
      onTourSkip?.();
    }
  }, [onTourComplete, onTourSkip, setCommandBarOpen, setSettingsOpen]);

  // 自定义 tooltip 样式
  const tooltipStyles = {
    options: {
      zIndex: 10000,
      arrowColor: '#1e1e1e',
    },
    button: {
      primary: {
        backgroundColor: '#3b82f6',
        borderRadius: '8px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        fontWeight: '500',
        padding: '8px 16px',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      },
      secondary: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        color: 'rgba(255, 255, 255, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        fontWeight: '500',
        padding: '8px 16px',
      },
      skip: {
        backgroundColor: 'transparent',
        borderRadius: '8px',
        color: 'rgba(255, 255, 255, 0.5)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        fontWeight: '500',
        padding: '8px 12px',
      },
    },
    tooltip: {
      backgroundColor: '#1e1e1e',
      borderRadius: '16px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.2)',
      color: 'rgba(255, 255, 255, 0.9)',
      fontSize: '14px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      lineHeight: '1.7',
      padding: '24px 32px 0', // 添加顶部和左右 padding，为标题提供空间
      maxWidth: '480px',
    },
    tooltipContainer: {
      textAlign: 'left',
    },
    tooltipHeader: {
      padding: '24px 32px 8px',
    },
    tooltipTitle: {
      color: '#ffffff',
      fontSize: '18px',
      fontWeight: '600',
      marginBottom: '0',
      marginTop: '0',
    },
    tooltipContent: {
      padding: '16px 32px 24px',
      fontSize: '15px',
      lineHeight: '1.75',
    },
    tooltipFooter: {
      padding: '16px 20px 20px',
      marginTop: '0',
    },
    options: {
      zIndex: 10000,
    },
  };

  const steps = getTourSteps(t);

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showSkipButton
      showProgress
      callback={handleCallback}
      styles={tooltipStyles}
      locale={{
        back: t('onboarding.buttons.back') || 'Back',
        close: t('onboarding.buttons.close') || 'Close',
        last: t('onboarding.buttons.last') || 'Finish',
        next: t('onboarding.buttons.next') || 'Next',
        open: t('onboarding.buttons.open') || 'Open the dialog',
        skip: t('onboarding.buttons.skip') || 'Skip',
      }}
      floaterProps={{
        disableAnimation: false,
      }}
      disableCloseOnEsc={false}
      disableOverlayClose={true}
      hideBackButton={false}
      debug={false}
    />
  );
};

// ============================================================================
// Command: Reset Tutorial
// ============================================================================

/**
 * 重置引导命令（供命令面板调用）
 */
export const resetTutorialCommand = () => {
  resetTourState();
  // 重新加载页面以触发引导
  window.location.reload();
};
