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
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // 🔥 FIX: 确保 summary 是字符串类型，防止对象导致崩溃
  const safeSummary = typeof summary === 'string' ? summary : JSON.stringify(summary, null, 2);

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
    <div className="my-4 rounded-lg border border-blue-500/20 bg-blue-500/10">
      {/* 头部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-blue-500/10"
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-500" />
          <span className="theme-text font-medium">
            {t('conversation.summary.title')}
          </span>
          {timestamp && (
            <span className="text-xs text-blue-500">
              {new Date(timestamp * 1000).toLocaleString()}
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
            className="rounded p-1 text-blue-500 transition-colors hover:bg-blue-500/10 hover:text-blue-600"
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
              className="rounded p-1 text-blue-500 transition-colors hover:bg-blue-500/10 hover:text-blue-600"
              title={t('conversation.summary.export')}
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          {/* 展开/折叠按钮 */}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-blue-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-blue-500" />
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
  const { t } = useTranslation();

  // 🔥 FIX: 检查 stats 和 total_tokens 是否存在
  if (!stats || stats.total_tokens === undefined || stats.total_tokens === null) {
    return null;
  }

  return (
    <div className="theme-text-subtle flex items-center gap-4 px-2 text-xs">
      <div className="flex items-center gap-1">
        <FileText className="w-3 h-3" />
        <span>
          {stats.total_tokens.toLocaleString()} {t('conversation.summary.tokens')}
        </span>
      </div>
      <span>•</span>
      <span>
        {stats.message_count} {t('conversation.summary.messages')}
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
            ¥{stats.estimated_cost_cny.toFixed(4)}
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
      className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 transition-colors hover:bg-green-500/15"
    >
      <div className="flex items-center gap-1">
        <FileText className="h-4 w-4 text-green-500" />
        <span className="theme-text text-sm font-medium">
          {t('conversation.summary.compacted')}
        </span>
      </div>
      <div className="text-xs text-green-500">
        {originalCount} → {compressedCount} (-{reduction}%)
      </div>
    </button>
  );
}
