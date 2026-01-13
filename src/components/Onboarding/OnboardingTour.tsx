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
 */

import React, { useState, useEffect, useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '../../stores/layoutStore';

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
  return [
    // 步骤 1: 欢迎屏幕（居中显示）
    {
      target: 'body',
      content: t('onboarding.steps.welcome'),
      title: t('onboarding.steps.welcomeTitle'),
      disableBeacon: true,
      placement: 'center' as const,
    },
    // 步骤 2: CommandBar 演示（居中显示，动态打开）
    {
      target: 'body',
      content: t('onboarding.steps.commandBar'),
      title: t('onboarding.steps.commandBarTitle'),
      disableBeacon: true,
      placement: 'center' as const,
    },
    // 步骤 3: Settings 演示（居中显示，动态打开）
    {
      target: 'body',
      content: t('onboarding.steps.settingsGuide'),
      title: t('onboarding.steps.settingsGuideTitle'),
      disableBeacon: true,
      placement: 'center' as const,
    },
    // 步骤 4: 布局切换器
    {
      target: '[data-testid="layout-switcher"]',
      content: t('onboarding.steps.layoutSwitcher'),
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
        disableAnimation: true,
      }}
      disableCloseOnEsc={false}
      disableOverlayClose={true}
      hideBackButton={false}
      debug={true}
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
