/**
 * OnboardingTour - 自定义 Tooltip 组件
 * IDE 风格自定义浮层
 */

import React from 'react';
import { X, Terminal, Settings, Grid3x3, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './OnboardingTour.css';

interface CustomTooltipProps {
  step: number;
  totalSteps: number;
  title: string;
  content: string;
  isLastStep: boolean;
  primaryAction: () => void;
  secondaryAction?: () => void;
  skipAction: () => void;
}

const stepIcons = [Sparkles, Terminal, Settings, Grid3x3];

export const CustomTooltip: React.FC<CustomTooltipProps> = ({
  step,
  totalSteps,
  title,
  content,
  isLastStep,
  primaryAction,
  secondaryAction,
  skipAction,
}) => {
  const { t } = useTranslation();
  const stepNumber = step + 1;
  const StepIcon = stepIcons[step] ?? Sparkles;

  return (
    <div className="theme-panel-elevated theme-border relative w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-2xl border shadow-[var(--app-shadow)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[var(--accent-soft-bg)] to-transparent" />

      <div className="theme-panel-muted theme-border relative flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="theme-surface-accent flex h-10 w-10 items-center justify-center rounded-xl">
            <StepIcon size={20} className="theme-text-accent" />
          </div>
          <div>
            <div className="theme-text text-sm font-semibold">{title}</div>
            <div className="theme-text-subtle text-[11px] uppercase tracking-[0.14em]">
              {t('onboarding.progress', { current: stepNumber, total: totalSteps })}
            </div>
          </div>
        </div>
        <button
          onClick={skipAction}
          className="theme-button-ghost theme-focus-ring-accent rounded-md p-1.5"
          aria-label={t('onboarding.buttons.close')}
        >
          <X size={16} />
        </button>
      </div>

      <div className="relative px-5 pb-5 pt-4">
        <div className="mb-4 flex items-center gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < step
                  ? 'bg-[var(--accent-color)]'
                  : i === step
                  ? 'bg-[var(--accent-soft-border)]'
                  : 'bg-[var(--border-color)]'
              }`}
            />
          ))}
        </div>

        <div
          className="theme-text-muted text-sm leading-7"
          dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/:(\w+)/g, '<code>$1</code>') }}
        />

        <div className="theme-border mt-5 flex items-center justify-between border-t pt-4">
          <button onClick={skipAction} className="theme-button-ghost rounded-lg px-3 py-2 text-sm">
            {t('onboarding.buttons.skip')}
          </button>

          <div className="flex items-center gap-2">
            {secondaryAction && (
              <button onClick={secondaryAction} className="theme-button-secondary rounded-lg px-3 py-2 text-sm">
                {t('onboarding.buttons.back')}
              </button>
            )}

            <button onClick={primaryAction} className="theme-button-primary rounded-lg px-3 py-2 text-sm font-medium">
              {isLastStep ? t('onboarding.buttons.last') : t('onboarding.buttons.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
