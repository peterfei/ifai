/**
 * 工具执行状态指示器
 * 提供工业级的执行进度视觉反馈
 */

import React from 'react';
import { Loader2, CheckCircle, XCircle, AlertCircle, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ToolExecutionIndicatorProps {
  status: 'pending' | 'approved' | 'running' | 'completed' | 'failed' | 'rejected';
  progress?: number; // 0-100
  message?: string;
  compact?: boolean;
}

/**
 * 执行状态指示器组件
 */
export const ToolExecutionIndicator: React.FC<ToolExecutionIndicatorProps> = ({
  status,
  progress,
  message,
  compact = false
}) => {
  const { t } = useTranslation();

  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          icon: <AlertCircle size={14} />,
          color: 'theme-text-warning',
          containerClass: 'theme-surface-warning',
          label: t('aiChat.toolExecution.status.pending'),
          pulse: false,
        };
      case 'approved':
        return {
          icon: <Zap size={14} />,
          color: 'theme-text-accent',
          containerClass: 'theme-surface-accent',
          label: t('aiChat.toolExecution.status.approved'),
          pulse: true,
        };
      case 'running':
        return {
          icon: <Loader2 size={14} className="animate-spin" />,
          color: 'theme-text-accent',
          containerClass: 'theme-surface-accent',
          label: t('aiChat.toolExecution.status.running'),
          pulse: true,
        };
      case 'completed':
        return {
          icon: <CheckCircle size={14} />,
          color: 'theme-text-success',
          containerClass: 'theme-surface-success',
          label: t('aiChat.toolExecution.status.completed'),
          pulse: false,
        };
      case 'failed':
        return {
          icon: <XCircle size={14} />,
          color: 'theme-text-danger',
          containerClass: 'theme-surface-danger',
          label: t('aiChat.toolExecution.status.failed'),
          pulse: false,
        };
      case 'rejected':
        return {
          icon: <XCircle size={14} />,
          color: 'theme-text-subtle',
          containerClass: 'theme-panel-muted theme-border theme-text-subtle border',
          label: t('aiChat.toolExecution.status.rejected'),
          pulse: false,
        };
      default:
        return {
          icon: <AlertCircle size={14} />,
          color: 'theme-text-subtle',
          containerClass: 'theme-panel-muted theme-border theme-text-subtle border',
          label: t('aiChat.toolExecution.status.unknown'),
          pulse: false,
        };
    }
  };

  const config = getStatusConfig();
  const activeStepIndex = progress !== undefined ? Math.floor(progress / 33) : 0;
  const steps = [
    t('aiChat.toolExecution.steps.initialize'),
    t('aiChat.toolExecution.steps.execute'),
    t('aiChat.toolExecution.steps.process'),
  ];

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${config.containerClass} ${config.pulse ? 'animate-pulse' : ''}`}>
        <span className={config.color}>{config.icon}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
          {config.label}
        </span>
        {progress !== undefined && (
          <span className="text-[10px] theme-text-subtle ml-auto">
            {progress}%
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${config.pulse ? 'animate-pulse' : ''}`}>
      {/* 状态指示器 */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${config.containerClass}`}>
        <span className={config.color}>{config.icon}</span>
        <div className="flex-1">
          <div className={`text-[11px] font-bold uppercase tracking-wider ${config.color}`}>
            {config.label}
          </div>
          {message && (
            <div className="text-[10px] theme-text-subtle mt-0.5">
              {message}
            </div>
          )}
        </div>
        {status === 'running' && (
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-3 w-1 rounded-full bg-[var(--accent-color)] animate-pulse"
                  style={{ animationDelay: `${i * 150}ms`, animationDuration: '1s' }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 进度条 */}
      {progress !== undefined && status === 'running' && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] theme-text-subtle">{t('aiChat.toolExecution.progress')}</span>
            <span className="text-[10px] font-mono theme-text-accent">{progress}%</span>
          </div>
          <div className="h-1.5 theme-panel-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent-color)] transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 执行步骤 */}
      {status === 'running' && (
        <div className="px-4 space-y-1">
          {steps.map((step, idx) => (
            <div key={step} className="flex items-center gap-2 text-[10px]">
              <div className={`w-3 h-3 rounded-full border ${
                idx < activeStepIndex
                  ? 'border-[var(--accent-color)] bg-[var(--accent-color)]'
                  : 'theme-border bg-transparent'
              }`} />
              <span className={idx < activeStepIndex ? 'theme-text-muted' : 'theme-text-subtle'}>
                {step}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 流式内容加载指示器
 */
export const StreamingContentLoader: React.FC<{ fileName?: string }> = ({ fileName }) => {
  const { t } = useTranslation();

  return (
    <div className="theme-surface-accent flex items-center gap-3 rounded-xl px-4 py-3 animate-pulse">
      <Loader2 size={16} className="theme-text-accent animate-spin" />
      <div className="flex-1">
        <div className="theme-text-accent text-[11px] font-medium">
          {t('aiChat.toolExecution.generatingContent')}
        </div>
        {fileName && (
          <div className="text-[10px] theme-text-subtle mt-0.5 font-mono">
            {fileName}
          </div>
        )}
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-4 w-1 rounded-full bg-[var(--accent-color)] animate-bounce"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
};
