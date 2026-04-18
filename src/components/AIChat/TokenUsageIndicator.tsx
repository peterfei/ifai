import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTransparencyStore } from '../../stores/transparencyStore';
import { countMessagesTokens, getModelMaxTokens, calculateTokenUsagePercentage, formatTokenCount } from '../../utils/tokenCounter';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

/**
 * Token 使用量指示器
 * 显示当前上下文的 Token 使用情况
 * v0.2.6 新增
 */
export const TokenUsageIndicator: React.FC = () => {
  const { t } = useTranslation();
  // 🔥 FIX: 安全的 null 检查，防止 chatStore 未初始化时出错
  // 🔥 FIX 2: 先获取整个 store，再解构，避免选择器中的 null 问题
  const chatStoreState = useChatStore();
  const messages = chatStoreState?.messages ?? [];
  const currentModel = useSettingsStore(state => state.currentModel);
  const transparencyLevel = useSettingsStore(state => state.transparencyLevel);
  const currentPromptMeta = useTransparencyStore(state => state.currentPromptMeta);
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [percentage, setPercentage] = useState<number>(0);
  const [maxTokens, setMaxTokens] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  // 计算当前上下文的 Token 数量
  useEffect(() => {
    const calculateTokens = async () => {
      if (messages.length === 0) {
        setTokenCount(0);
        setPercentage(0);
        return;
      }

      setIsLoading(true);

      try {
        // 🔥 v0.3.0 多模态修复：简化消息列表进行计数（排除占位符消息和图片数据）
        const messagesForCounting = messages
          .filter(m => m.content && m.content.length > 0)
          .map(m => {
            // 处理 ContentPart[] 格式（多模态消息）
            if (Array.isArray(m.content)) {
              // 只提取文本内容，忽略图片 base64 数据
              const textParts = m.content
                .filter((part: any) => part.type === 'text')
                .map((part: any) => part.text || '');
              return {
                role: m.role,
                content: textParts.join(' ')
              };
            }
            // 处理普通字符串格式
            return {
              role: m.role,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
            };
          })
          .filter(m => m.content.length > 0); // 再次过滤，移除空内容

        const count = await countMessagesTokens(messagesForCounting, currentModel);
        const max = getModelMaxTokens(currentModel);
        const pct = calculateTokenUsagePercentage(count, currentModel);

        setTokenCount(count);
        setMaxTokens(max);
        setPercentage(pct);
      } catch (e) {
        console.error('[TokenUsageIndicator] Failed to count tokens:', e);
        setTokenCount(0);
        setPercentage(0);
      } finally {
        setIsLoading(false);
      }
    };

    // 使用防抖避免频繁计算
    const timeoutId = setTimeout(calculateTokens, 500);
    return () => clearTimeout(timeoutId);
  }, [messages, currentModel]);

  // 如果没有消息或未启用 Token 限制，不显示
  if (messages.length === 0) {
    return null;
  }

  // 根据使用率确定颜色
  const getColorClass = () => {
    if (percentage < 50) return 'bg-[var(--success-color)]';
    if (percentage < 75) return 'bg-[var(--info-color)]';
    if (percentage < 90) return 'bg-[var(--warning-color)]';
    return 'bg-[var(--danger-color)]';
  };

  const getTextColorClass = () => {
    if (percentage < 50) return 'text-[var(--success-color)]';
    if (percentage < 75) return 'text-[var(--info-color)]';
    if (percentage < 90) return 'text-[var(--warning-color)]';
    return 'text-[var(--danger-color)]';
  };

  const getIcon = () => {
    if (percentage >= 90) {
      return <AlertCircle size={12} className={getTextColorClass()} />;
    }
    return <Activity size={12} className="theme-text-subtle" />;
  };

  const showTokenBreakdown = (transparencyLevel === 'verbose' || transparencyLevel === 'debug') && currentPromptMeta;

  return (
    <div
      data-testid="token-usage-indicator"
      className="theme-panel border-t theme-border"
    >
      <div className="flex items-center space-x-2 text-xs px-2 py-1">
        {/* 图标 */}
        {getIcon()}

        {/* 进度条 */}
        <div className="flex-1 h-1.5 theme-panel-muted rounded-full overflow-hidden">
          <div
            data-testid="token-progress-bar"
            className={clsx('h-full transition-all duration-300', getColorClass())}
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>

        {/* 文字信息 */}
        <span
          data-testid="token-current-count"
          className={clsx('font-mono whitespace-nowrap', getTextColorClass())}
        >
          {isLoading ? '...' : formatTokenCount(tokenCount)}
        </span>
        <span className="theme-text-subtle">/</span>
        <span
          data-testid="token-max-count"
          className="theme-text-subtle font-mono"
        >
          {formatTokenCount(maxTokens)}
        </span>
        <span
          data-testid="token-percentage"
          className={clsx('font-medium', getTextColorClass())}
        >
          {percentage}%
        </span>

        {/* Token 分类明细切换按钮 */}
        {showTokenBreakdown && (
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="ml-1 p-0.5 rounded theme-button-ghost theme-text-subtle transition-colors"
            title={t('aiChat.tokenUsage.breakdown')}
          >
            {showDetail ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
      </div>

      {/* Token 分类明细 */}
      {showDetail && showTokenBreakdown && currentPromptMeta && (
        <div className="px-4 pb-2 space-y-0.5">
          {currentPromptMeta.sections
            .filter(s => s.present !== false || s.tokens_estimate > 0)
            .map(section => (
              <div key={section.name} className="flex items-center text-[10px] font-mono">
                <span className="theme-text-subtle w-32 truncate">{section.label}</span>
                <div className="flex-1 h-1 theme-panel-muted rounded-full overflow-hidden mx-2">
                  <div
                    className="h-full rounded-full bg-[var(--accent-soft-border)]"
                    style={{
                      width: `${Math.min(100, (section.tokens_estimate / Math.max(1, currentPromptMeta.total_tokens_estimate)) * 100)}%`
                    }}
                  />
                </div>
                <span className="theme-text-subtle w-20 text-right">
                  ~{section.tokens_estimate.toLocaleString()} {t('aiChat.tokenUsage.tokens')} ({Math.round((section.tokens_estimate / Math.max(1, currentPromptMeta.total_tokens_estimate)) * 100)}%)
                </span>
              </div>
            ))}
          <div className="flex items-center text-[10px] font-mono border-t theme-border pt-1 mt-1">
            <span className="theme-text-muted w-32">{t('aiChat.tokenUsage.systemTotal')}</span>
            <div className="flex-1" />
            <span className="theme-text-subtle w-20 text-right">
              ~{currentPromptMeta.total_tokens_estimate.toLocaleString()} {t('aiChat.tokenUsage.tokens')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokenUsageIndicator;
