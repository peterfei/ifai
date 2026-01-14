import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle } from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { countMessagesTokens, getModelMaxTokens, calculateTokenUsagePercentage, formatTokenCount } from '../../utils/tokenCounter';
import clsx from 'clsx';

/**
 * Token 使用量指示器
 * 显示当前上下文的 Token 使用情况
 * v0.2.6 新增
 */
export const TokenUsageIndicator: React.FC = () => {
  const messages = useChatStore(state => state.messages);
  const currentModel = useSettingsStore(state => state.currentModel);
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [percentage, setPercentage] = useState<number>(0);
  const [maxTokens, setMaxTokens] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

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
    if (percentage < 50) return 'bg-green-500';
    if (percentage < 75) return 'bg-yellow-500';
    if (percentage < 90) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getTextColorClass = () => {
    if (percentage < 50) return 'text-green-400';
    if (percentage < 75) return 'text-yellow-400';
    if (percentage < 90) return 'text-orange-400';
    return 'text-red-400';
  };

  const getIcon = () => {
    if (percentage >= 90) {
      return <AlertCircle size={12} className={getTextColorClass()} />;
    }
    return <Activity size={12} className="text-gray-400" />;
  };

  return (
    <div className="flex items-center space-x-2 text-xs px-2 py-1 bg-[#1e1e1e] border-t border-gray-700">
      {/* 图标 */}
      {getIcon()}

      {/* 进度条 */}
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={clsx('h-full transition-all duration-300', getColorClass())}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>

      {/* 文字信息 */}
      <span className={clsx('font-mono whitespace-nowrap', getTextColorClass())}>
        {isLoading ? '...' : formatTokenCount(tokenCount)}
      </span>
      <span className="text-gray-500">/</span>
      <span className="text-gray-500 font-mono">{formatTokenCount(maxTokens)}</span>
      <span className={clsx('font-medium', getTextColorClass())}>
        {percentage}%
      </span>
    </div>
  );
};

export default TokenUsageIndicator;
