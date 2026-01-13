/**
 * OnboardingTour - 自定义 Tooltip 组件
 * 工业级 UI 设计
 */

import React from 'react';
import { X, Terminal, Settings, Grid3x3, Sparkles } from 'lucide-react';
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

// 步骤图标映射
const stepIcons: Record<number, React.ReactNode> = {
  0: <Sparkles size={32} className="text-blue-400" />,
  1: <Terminal size={32} className="text-green-400" />,
  2: <Settings size={32} className="text-purple-400" />,
  3: <Grid3x3 size={32} className="text-orange-400" />,
};

// 步骤颜色映射
const stepColors: Record<number, string> = {
  0: 'from-blue-500 to-cyan-500',
  1: 'from-green-500 to-emerald-500',
  2: 'from-purple-500 to-pink-500',
  3: 'from-orange-500 to-amber-500',
};

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
  const stepNumber = step + 1;

  return (
    <div className="onboarding-tooltip">
      {/* 装饰性光晕效果 */}
      <div className={`onboarding-tooltip-glow gradient-${stepColors[step]}`}></div>

      {/* 进度指示器 */}
      <div className="onboarding-progress">
        <div className="onboarding-progress-dots">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`onboarding-progress-dot ${i <= step ? 'active' : ''} ${i === step ? 'current' : ''}`}
              style={{ backgroundColor: i <= step ? undefined : 'rgba(255,255,255,0.15)' }}
            />
          ))}
        </div>
        <div className="onboarding-progress-text">
          {stepNumber} / {totalSteps}
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="onboarding-content">
        {/* 图标 */}
        <div className={`onboarding-icon gradient-${stepColors[step]}`}>
          {stepIcons[step]}
        </div>

        {/* 标题 */}
        <h3 className="onboarding-title">{title}</h3>

        {/* 内容 */}
        <div
          className="onboarding-description"
          dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/:(\w+)/g, '<code>$1</code>') }}
        />
      </div>

      {/* 底部操作按钮 */}
      <div className="onboarding-actions">
        {/* Skip 按钮 */}
        <button onClick={skipAction} className="onboarding-btn-skip">
          跳过
        </button>

        <div className="onboarding-actions-right">
          {/* 后退按钮 */}
          {secondaryAction && (
            <button onClick={secondaryAction} className="onboarding-btn-secondary">
              上一步
            </button>
          )}

          {/* 主要按钮 */}
          <button onClick={primaryAction} className="onboarding-btn-primary">
            {isLastStep ? '完成' : '下一步'}
          </button>
        </div>
      </div>

      {/* 关闭按钮 */}
      <button onClick={skipAction} className="onboarding-close" aria-label="关闭">
        <X size={18} />
      </button>
    </div>
  );
};
