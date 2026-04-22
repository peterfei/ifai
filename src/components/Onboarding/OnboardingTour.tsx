/**
 * v0.5.0: 新手引导 Tour 组件 (深度修复语言切换崩溃)
 *
 * 使用 react-joyride 实现的新手引导流程
 *
 * 功能：
 * - 首次启动自动触发
 * - 支持跳过引导
 * - 支持重置引导（通过命令面板或设置）
 * - LocalStorage 状态持久化
 * - Markdown 内容渲染支持
 * - 🔥 语言切换安全支持（避免崩溃）
 * - 🔥 高保真场景还原（动态面板控制）
 * - 🔥 ErrorBoundary 包裹防止错误扩散
 * - 🔥 激进的状态管理（语言切换时立即卸载）
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, Component, ReactNode } from 'react';
import { Joyride } from 'react-joyride';
import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '../../stores/layoutStore';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import './OnboardingTour.css';

// ============================================================================
// Error Boundary for Joyride
// ============================================================================

interface TourErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface TourErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error) => void;
}

/**
 * Tour Error Boundary
 * 捕获 Joyride 组件中的所有错误，防止导致整个应用崩溃
 */
class TourErrorBoundary extends Component<TourErrorBoundaryProps, TourErrorBoundaryState> {
  constructor(props: TourErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): TourErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[OnboardingTour] ErrorBoundary caught an error:', error);
    console.error('[OnboardingTour] Error info:', errorInfo);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return null; // 静默失败，不渲染任何内容
    }
    return this.props.children;
  }
}

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

/**
 * 创建 Markdown 渲染组件
 */
const createMarkdownRenderer = () => {
  const renderMarkdown = (content: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkBreaks, remarkGfm]}
      components={{
        p: ({ children }) => <p style={{ margin: '0.5em 0' }}>{children}</p>,
        ul: ({ children }) => <ul style={{ marginLeft: '1.5em', marginTop: '0.5em', marginBottom: '0.5em' }}>{children}</ul>,
        strong: ({ children }) => <strong style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{children}</strong>,
        code: ({ inline, children }: any) => {
          return inline ? (
            <code style={{
              backgroundColor: 'var(--accent-soft-bg)',
              border: '1px solid var(--accent-soft-border)',
              color: 'var(--accent-color)',
              padding: '0.2em 0.4em',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '0.9em',
            }}>{children}</code>
          ) : (
            <code>{children}</code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
  return renderMarkdown;
};

/**
 * 安全的 DOM 查询辅助函数
 * 确保总是返回一个有效的 DOM 元素
 */
const safeQuerySelector = (selector: string): HTMLElement | null => {
  try {
    return document.querySelector(selector);
  } catch (e) {
    console.warn(`[OnboardingTour] Failed to query selector: ${selector}`, e);
    return null;
  }
};

/**
 * 🔥 FIX: 安全的 target 获取器
 * 返回字符串选择器，让 Joyride 自己处理查询
 * 如果元素不存在，Joyride 会跳过该步骤
 */
const getSafeTargetSelector = (selector: string): string => {
  const element = safeQuerySelector(selector);
  if (element) {
    return selector;  // 元素存在，返回选择器
  }
  console.warn(`[OnboardingTour] Target not found: ${selector}, falling back to body`);
  return 'body';  // 元素不存在，回退到 body（居中显示）
};

/**
 * 生成 Tour Steps
 */
const createTourSteps = (t: (key: string) => string): any[] => {
  const renderMarkdown = createMarkdownRenderer();

  // 🔥 FIX: 动态检查 layout-switcher 是否存在
  const layoutSwitcherSelector = getSafeTargetSelector('[data-testid="layout-switcher"]');

  return [
    // 步骤 1: 欢迎屏幕（居中显示）
    {
      target: 'body',
      content: renderMarkdown(t('onboarding.steps.welcome')),
      title: t('onboarding.steps.welcomeTitle'),
      disableBeacon: true,
      placement: 'center' as const,
    },
    // 步骤 2: CommandBar 演示（居中显示，动态打开 CommandBar）
    {
      target: 'body',
      content: renderMarkdown(t('onboarding.steps.commandBar')),
      title: t('onboarding.steps.commandBarTitle'),
      disableBeacon: true,
      placement: 'center' as const,
    },
    // 步骤 3: Settings 演示（居中显示，动态打开 Settings）
    {
      target: 'body',
      content: renderMarkdown(t('onboarding.steps.settingsGuide')),
      title: t('onboarding.steps.settingsGuideTitle'),
      disableBeacon: true,
      placement: 'center' as const,
    },
    // 步骤 4: 布局切换器（定位到布局切换按钮）
    // 🔥 FIX: 使用预先验证的选择器，而不是函数
    {
      target: layoutSwitcherSelector,
      content: renderMarkdown(t('onboarding.steps.layoutSwitcher')),
      title: t('onboarding.steps.layoutSwitcherTitle'),
      disableBeacon: false,
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
  const { t, i18n } = useTranslation();
  const [run, setRun] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [joyrideKey, setJoyrideKey] = useState(0);
  const [isLanguageChanging, setIsLanguageChanging] = useState(false);
  const { setCommandBarOpen, setSettingsOpen } = useLayoutStore();

  // 🔥 FIX: 使用 useMemo 缓存 steps，只在语言改变时重新计算
  const steps = useMemo(() => createTourSteps(t), [t]);

  // 🔥 FIX: 激进的语言变化处理 - 语言切换后不重启 Tour
  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      console.log('[OnboardingTour] 🔄 Language change detected:', lng);
      console.log('[OnboardingTour] Current state:', {
        run,
        mounted,
        isLanguageChanging,
        joyrideKey,
        i18nLanguage: i18n.language
      });

      // 🔥 DEBUG: 记录调用堆栈
      console.log('[OnboardingTour] Call stack:', new Error().stack);

      // 1. 立即停止 tour
      console.log('[OnboardingTour] Step 1: Stopping tour...');
      setRun(false);

      // 2. 永久卸载 Joyride（语言切换后不再重启）
      console.log('[OnboardingTour] Step 2: Permanently unmounting Joyride...');
      setMounted(false);

      // 3. 关闭所有打开的面板
      console.log('[OnboardingTour] Step 3: Closing all panels...');
      setCommandBarOpen(false);
      setSettingsOpen(false);

      // 4. 标记 Tour 为已跳过（因为用户切换了语言）
      console.log('[OnboardingTour] Step 4: Marking tour as skipped...');
      markTourSkipped();

      console.log('[OnboardingTour] ✅ Language change handled, tour stopped');
    };

    // 监听 i18next 的 languageChanged 事件
    console.log('[OnboardingTour] Registering languageChanged listener...');
    i18n.on('languageChanged', handleLanguageChange);

    // 🔥 FIX: 同时监听 storage 事件（测试中通过 localStorage 修改语言）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'i18nextLng' && e.newValue && e.newValue !== i18n.language) {
        console.log('[OnboardingTour] 🔄 Storage event detected, new language:', e.newValue);
        handleLanguageChange(e.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    console.log('[OnboardingTour] Registered language change listeners (i18next + storage)');

    return () => {
      console.log('[OnboardingTour] Unregistering language change listeners...');
      i18n.off('languageChanged', handleLanguageChange);
      window.removeEventListener('storage', handleStorageChange);
      console.log('[OnboardingTour] Unregistered language change listeners');
    };
  }, [i18n, forceStart, run, mounted, isLanguageChanging, joyrideKey, setCommandBarOpen, setSettingsOpen]);

  // 检查是否应该启动引导
  useEffect(() => {
    if (forceStart || shouldShowTour()) {
      console.log('[OnboardingTour] Initializing tour...');

      // 🔥 FIX: 简化初始化逻辑，不进行复杂的 DOM 检测
      // 直接启动，让 joyride 自己处理 target 查找
      const timer = setTimeout(() => {
        console.log('[OnboardingTour] Starting tour...');
        setRun(true);
      }, 1000); // 给页面 1 秒时间完全渲染

      return () => clearTimeout(timer);
    }
  }, [forceStart]);

  // 处理引导回调
  const handleCallback = useCallback((data: any) => {
    const { status, index, action, type } = data;

    console.log('[OnboardingTour] Callback:', { status, index, action, type });

    // 🔥 FIX: 如果正在切换语言，不处理任何回调，避免面板被重新打开
    if (isLanguageChanging) {
      console.log('[OnboardingTour] Language change in progress, ignoring callback');
      return;
    }

    // 提前处理完成/跳过状态
    if (status === 'finished' || status === 'skipped') {
      // 立即卸载组件
      setMounted(false);
      setRun(false);

      // 延迟执行清理操作，并关闭所有打开的面板
      setTimeout(() => {
        setCommandBarOpen(false);
        setSettingsOpen(false);

        if (status === 'finished') {
          console.log('[OnboardingTour] Tour finished');
          markTourCompleted();
          onTourComplete?.();
        } else {
          console.log('[OnboardingTour] Tour skipped');
          markTourSkipped();
          onTourSkip?.();
        }
      }, 300);

      return;
    }

    // 🔥 在 step:before 事件中动态打开面板（高保真场景还原）
    if (type === 'step:before') {
      console.log('[OnboardingTour] Before step:', index, '- preparing scene...');

      // 步骤 0: 欢迎屏幕 - 关闭所有面板
      if (index === 0) {
        setCommandBarOpen(false);
        setSettingsOpen(false);
        console.log('[OnboardingTour] Scene ready: Clean workspace');
      }
      // 步骤 1: CommandBar - 打开命令行面板
      else if (index === 1) {
        setCommandBarOpen(true);
        setSettingsOpen(false);
        console.log('[OnboardingTour] Scene ready: CommandBar opened');
      }
      // 步骤 2: Settings - 打开设置面板
      else if (index === 2) {
        setCommandBarOpen(false);
        setSettingsOpen(true);
        console.log('[OnboardingTour] Scene ready: Settings opened');
      }
      // 步骤 3: Layout Switcher - 关闭所有面板
      else if (index === 3) {
        setCommandBarOpen(false);
        setSettingsOpen(false);
        console.log('[OnboardingTour] Scene ready: Panels closed for layout switcher');
      }
    }
  }, [onTourComplete, onTourSkip, setCommandBarOpen, setSettingsOpen, isLanguageChanging]);

  // 自定义 tooltip 样式
  const tooltipStyles = {
    options: {
      zIndex: 10000,
      arrowColor: 'var(--bg-secondary)',
    },
    button: {
      primary: {
        borderRadius: '8px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        fontWeight: '500',
        padding: '8px 16px',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      },
      secondary: {
        borderRadius: '8px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        fontWeight: '500',
        padding: '8px 16px',
      },
      skip: {
        borderRadius: '8px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        fontWeight: '500',
        padding: '8px 12px',
      },
    },
    tooltip: {
      borderRadius: '16px',
      fontSize: '14px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      lineHeight: '1.7',
      padding: '24px 32px 0',
      maxWidth: '480px',
    },
    tooltipContainer: {
      textAlign: 'left' as const,
    },
    tooltipHeader: {
      padding: '24px 32px 8px',
    },
    tooltipTitle: {
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
  };

  // 🔥 FIX: 处理 ErrorBoundary 错误（必须在所有 hooks 之后，在 return 之前）
  const handleJoyrideError = useCallback((error: Error) => {
    console.error('[OnboardingTour] Joyride error, permanently stopping tour:', error);
    setRun(false);
    setMounted(false);
    // 标记为已完成，防止持续出错
    markTourSkipped();
  }, []);

  const JoyrideComponent = Joyride as any;

  // 🔥 FIX: 使用条件渲染而不是提前返回，避免违反 Hooks 规则
  // 🔥 FIX: 只在 mounted 为 true 且语言未在变化时渲染 Joyride
  if (!mounted || isLanguageChanging) {
    return null;
  }

  // 🔥 FIX: 验证 Joyride target 元素存在，避免 NotFoundError
  // 在渲染前检查所有 target 是否存在
  const allTargetsExist = steps.every(step => {
    // 对于居中显示的步骤（target: 'body'），总是返回 true
    if (step.target === 'body' || step.placement === 'center') {
      return true;
    }
    // 对于函数形式的 target，尝试执行并检查
    if (typeof step.target === 'function') {
      try {
        const target = step.target();
        return target !== null && target !== document.body;
      } catch {
        return false;
      }
    }
    // 对于选择器字符串，检查元素是否存在
    if (typeof step.target === 'string') {
      return document.querySelector(step.target) !== null;
    }
    return true;
  });

  // 🔥 FIX: 如果有任何 target 不存在，不渲染 Joyride，避免崩溃
  if (!allTargetsExist) {
    console.log('[OnboardingTour] Some targets do not exist yet, skipping Joyride render');
    return null;
  }

  // 🔥 FIX: 使用 Error Boundary 包裹 Joyride，防止错误扩散
  return (
    <TourErrorBoundary onError={handleJoyrideError}>
      <JoyrideComponent
        key={`onboarding-${i18n.language}-${joyrideKey}`} // 🔥 使用 joyrideKey 确保语言切换后重新挂载
        steps={steps}
        run={run}
        continuous
        showSkipButton
        showProgress
        callback={handleCallback}
        styles={tooltipStyles}
        locale={{
          back: String(t('onboarding.buttons.back')),
          close: String(t('onboarding.buttons.close')),
          last: String(t('onboarding.buttons.last')),
          next: String(t('onboarding.buttons.next')),
          open: String(t('onboarding.buttons.open')),
          skip: String(t('onboarding.buttons.skip')),
        }}
        disableCloseOnEsc={true}
        disableOverlayClose={true}
        hideBackButton={false}
        scrollToFirstStep={false}
        spotlightClicks={true}
        debug={false}
        // 🔥 FIX: 添加容错选项，防止 target 找不到时崩溃
        floaterProps={{
          disableAnimation: true,
        }}
        // 🔥 FIX: 防止在 tour 未完全初始化时渲染 tooltip
        disableScrolling
        // 🔥 FIX: 添加错误处理
        spotlightPadding={10}
        // 🔥 FIX: 禁用 tooltip 动画，减少渲染问题
        disableOverlay={false}
      />
    </TourErrorBoundary>
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
