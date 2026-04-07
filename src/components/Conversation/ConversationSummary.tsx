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

  const handleCopy = async () => {
    if (onCopy) {
      onCopy();
    } else {
      await navigator.clipboard.writeText(summary);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20">
      {/* 头部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="font-medium text-blue-900 dark:text-blue-100">
            {t('conversation.summary.title')}
          </span>
          {timestamp && (
            <span className="text-xs text-blue-600 dark:text-blue-400">
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
            className="p-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors"
            title={copied ? t('conversation.summary.copied') : t('conversation.summary.copy')}
          >
            <Copy className="w-4 h-4" />
          </button>
          {onExport && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExport();
              }}
              className="p-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors"
              title={t('conversation.summary.export')}
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          {/* 展开/折叠按钮 */}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          )}
        </div>
      </button>

      {/* 内容 */}
      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="prose dark:prose-invert max-w-none text-sm">
            <pre className="whitespace-pre-wrap text-blue-900 dark:text-blue-100 bg-white dark:bg-gray-800 p-3 rounded border border-blue-200 dark:border-blue-800">
              {summary}
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

  return (
    <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400 px-2">
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
      className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
    >
      <div className="flex items-center gap-1">
        <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />
        <span className="text-sm font-medium text-green-900 dark:text-green-100">
          {t('conversation.summary.compacted')}
        </span>
      </div>
      <div className="text-xs text-green-700 dark:text-green-300">
        {originalCount} → {compressedCount} (-{reduction}%)
      </div>
    </button>
  );
}
