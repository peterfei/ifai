/**
 * v0.2.9 审查历史面板组件
 *
 * 功能：
 * - 显示代码审查历史记录列表
 * - 每条记录显示提交哈希、时间戳、问题数量和状态
 */

import React from 'react';
import { X, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCodeReviewStore, ReviewHistory } from '../../stores/codeReviewStore';

// ============================================================================
// Props
// ============================================================================

interface ReviewHistoryPanelProps {
  /** 是否显示面板 */
  isOpen: boolean;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取状态图标
 */
function getStatusIcon(status: ReviewHistory['status']) {
  switch (status) {
    case 'fixed':
      return <CheckCircle className="theme-text-success" size={16} />;
    case 'ignored':
      return <XCircle className="theme-text-subtle" size={16} />;
    case 'pending':
      return <AlertCircle className="theme-text-warning" size={16} />;
    default:
      return null;
  }
}

function formatTimestamp(timestamp: number, language: string): string {
  const now = Date.now();
  const diff = now - timestamp;
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) {
    return rtf.format(-minutes, 'minute');
  }
  if (hours < 24) {
    return rtf.format(-hours, 'hour');
  }
  return rtf.format(-days, 'day');
}

// ============================================================================
// 组件
// ============================================================================

export const ReviewHistoryPanel: React.FC<ReviewHistoryPanelProps> = ({ isOpen }) => {
  const { t, i18n } = useTranslation();
  const { reviewHistory, toggleHistoryPanel } = useCodeReviewStore();

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="theme-panel-elevated theme-border theme-shadow fixed right-4 top-20 z-[210] flex max-h-[70vh] w-96 flex-col rounded-lg border"
      data-testid="review-history-panel"
    >
      {/* Header */}
      <div className="theme-border flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <Clock className="theme-text-accent" size={18} />
          <h3 className="theme-text text-sm font-semibold">{t('reviewHistory.title')}</h3>
          <span className="theme-text-subtle text-xs">({reviewHistory.length})</span>
        </div>
        <button
          onClick={toggleHistoryPanel}
          className="theme-button-ghost rounded p-1"
          title={t('common.close')}
        >
          <X size={16} />
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {reviewHistory.length === 0 ? (
          <div className="theme-text-subtle py-8 text-center text-sm">
            {t('reviewHistory.empty')}
          </div>
        ) : (
          reviewHistory.map((history) => (
            <div
              key={history.id}
              className="theme-panel-muted theme-border rounded-lg border p-3 transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="theme-text-accent text-xs font-mono">
                    {history.commitHash || t('reviewHistory.commitFallback')}
                  </span>
                  {getStatusIcon(history.status)}
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      history.status === 'fixed'
                        ? 'border-[var(--success-soft-border)] bg-[var(--success-soft-bg)] text-[var(--success-color)]'
                        : history.status === 'pending'
                        ? 'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] text-[var(--warning-color)]'
                        : 'theme-panel theme-border theme-text-subtle'
                    }`}
                  >
                    {t(`reviewHistory.status.${history.status}`, { defaultValue: t('common.unknown') })}
                  </span>
                </div>
                <span
                  className="theme-text-subtle text-xs"
                  title={new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(history.timestamp)}
                >
                  {formatTimestamp(history.timestamp, i18n.language)}
                </span>
              </div>

              <div className="theme-text-muted text-xs">
                {t('reviewHistory.issueCount', { count: history.issues.length })}
              </div>

              {/* Issue Summary */}
              <div className="mt-2 space-y-1">
                {history.issues.slice(0, 3).map((issue, index) => (
                  <div key={index} className="theme-text-subtle truncate text-xs">
                    • {issue.message}
                  </div>
                ))}
                {history.issues.length > 3 && (
                  <div className="theme-text-subtle text-xs opacity-70">
                    {t('reviewHistory.moreIssues', { count: history.issues.length - 3 })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ReviewHistoryPanel;
