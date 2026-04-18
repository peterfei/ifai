/**
 * Section 5.3: 对话总结组件
 *
 * 在对话中显示对话总结的可折叠卡片
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  Copy,
  Download
} from 'lucide-react';

interface ConversationSummaryProps {
  summary: string;
  timestamp?: number;
  onCopy?: () => void;
  onExport?: () => void;
}

/**
 * 对话总结卡片组件
 */
export function ConversationSummary({
  summary,
  timestamp,
  onCopy,
  onExport
}: ConversationSummaryProps) {
  const { t, i18n } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // 🔥 FIX: 确保 summary 是字符串类型，防止对象导致崩溃
  const safeSummary = typeof summary === 'string' ? summary : JSON.stringify(summary, null, 2);

  const formatTimestamp = (value: number) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(value * 1000);

  const handleCopy = async () => {
    if (onCopy) {
      onCopy();
    } else {
      await navigator.clipboard.writeText(safeSummary);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="theme-panel-elevated theme-border my-4 rounded-lg border">
      {/* 头部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="theme-soft-hover-accent flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <FileText className="theme-text-accent h-4 w-4" />
          <span className="theme-text font-medium">
            {t('conversation.summary.title')}
          </span>
          {timestamp && (
            <span className="theme-text-accent text-xs">
              {formatTimestamp(timestamp)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 操作按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="theme-button-ghost theme-text-subtle rounded p-1 transition-colors hover:text-[var(--accent-color)]"
            title={copied ? t('conversation.summary.copied') : t('conversation.summary.copy')}
          >
            <Copy className="h-4 w-4" />
          </button>
          {onExport && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExport();
              }}
              className="theme-button-ghost theme-text-subtle rounded p-1 transition-colors hover:text-[var(--accent-color)]"
              title={t('conversation.summary.export')}
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          {/* 展开/折叠按钮 */}
          {isExpanded ? (
            <ChevronUp className="theme-text-accent h-4 w-4" />
          ) : (
            <ChevronDown className="theme-text-accent h-4 w-4" />
          )}
        </div>
      </button>

      {/* 内容 */}
      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="max-w-none text-sm">
            <pre className="theme-code-surface theme-border whitespace-pre-wrap rounded border p-3">
              {safeSummary}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Token 统计组件
 */
interface TokenStatsProps {
  stats: {
    total_tokens: number;
    message_count: number;
    estimated_cost_cny?: number;
  };
  model?: string;
}

export function TokenStatsDisplay({ stats, model }: TokenStatsProps) {
  const { t, i18n } = useTranslation();

  // 🔥 FIX: 检查 stats 和 total_tokens 是否存在
  if (!stats || stats.total_tokens === undefined || stats.total_tokens === null) {
    return null;
  }

  return (
    <div className="theme-text-subtle flex items-center gap-4 px-2 text-xs">
      <div className="flex items-center gap-1">
        <FileText className="w-3 h-3" />
        <span>
          {stats.total_tokens.toLocaleString(i18n.language)} {t('conversation.summary.tokens')}
        </span>
      </div>
      <span>•</span>
      <span>
        {stats.message_count.toLocaleString(i18n.language)} {t('conversation.summary.messages')}
      </span>
      {model && (
        <>
          <span>•</span>
          <span className="font-mono">{model}</span>
        </>
      )}
      {stats.estimated_cost_cny !== undefined && (
        <>
          <span>•</span>
          <span>
            {t('conversation.summary.estimatedCost', { value: stats.estimated_cost_cny.toFixed(4) })}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * 压缩指示器组件
 */
interface CompactIndicatorProps {
  originalCount: number;
  compressedCount: number;
  onClick?: () => void;
}

export function CompactIndicator({
  originalCount,
  compressedCount,
  onClick
}: CompactIndicatorProps) {
  const { t } = useTranslation();
  const reduction = ((originalCount - compressedCount) / originalCount * 100).toFixed(0);

  return (
    <button
      onClick={onClick}
      className="theme-button-secondary flex items-center gap-2 rounded-lg border border-[var(--success-soft-border)] bg-[var(--success-soft-bg)] px-3 py-2 transition-colors hover:border-[var(--success-soft-border)] hover:bg-[var(--success-soft-bg)]"
    >
      <div className="flex items-center gap-1">
        <FileText className="h-4 w-4 text-[var(--success-color)]" />
        <span className="theme-text text-sm font-medium">
          {t('conversation.summary.compacted')}
        </span>
      </div>
      <div className="text-xs text-[var(--success-color)]">
        {originalCount} → {compressedCount} (-{reduction}%)
      </div>
    </button>
  );
}
