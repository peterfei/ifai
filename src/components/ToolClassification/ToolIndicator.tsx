/**
 * 工具指示器组件
 *
 * 在用户输入时实时显示工具分类结果
 */

import React, { useEffect, useState } from 'react';
import { useToolClassificationStore } from '@/stores/toolClassificationStore';
import { toolClassificationService } from '@/services/toolClassificationService';
import ClassificationBadge from './ClassificationBadge';

interface ToolIndicatorProps {
  /** 用户输入 */
  input: string;
  /** 是否启用 */
  enabled?: boolean;
  /** 防抖延迟（毫秒） */
  debounceMs?: number;
  /** 自定义类名 */
  className?: string;
  /** 分类回调 */
  onClassified?: (result: import('@/types/toolClassification').ClassificationResult) => void;
}

/**
 * 工具指示器组件
 */
export const ToolIndicator: React.FC<ToolIndicatorProps> = ({
  input,
  enabled = true,
  debounceMs = 500,
  className = '',
  onClassified,
}) => {
  const [localResult, setLocalResult] = useState<
    import('@/types/toolClassification').ClassificationResult | null
  >(null);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const { currentResult, isClassifying } = useToolClassificationStore();

  // 防抖分类
  useEffect(() => {
    if (!enabled || !input.trim()) {
      setLocalResult(null);
      setIsDebouncing(false);
      return;
    }

    setIsDebouncing(true);

    // 清除之前的定时器
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // 设置新的定时器
    const timer = setTimeout(async () => {
      try {
        const response = await toolClassificationService.classify(input.trim());
        setLocalResult(response.result);
        setIsDebouncing(false);
        onClassified?.(response.result);
      } catch (error) {
        console.error('[ToolIndicator] Classification error:', error);
        setIsDebouncing(false);
      }
    }, debounceMs);

    setDebounceTimer(timer);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [input, enabled, debounceMs]);

  // 如果没有输入或正在防抖，不显示
  if (!input.trim() || (!localResult && !isDebouncing)) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* 分类结果 */}
      {localResult && (
        <ClassificationBadge
          result={localResult}
          compact
          showConfidence={false}
          showLayer={false}
        />
      )}

      {/* 加载状态 */}
      {isDebouncing && !localResult && (
        <div className="theme-text-subtle flex items-center gap-2 text-xs">
          <div className="theme-border h-3 w-3 animate-spin rounded-full border border-t-transparent" />
          <span>分析中...</span>
        </div>
      )}

      {/* 延迟显示 */}
      {localResult && (
        <span className="theme-text-subtle text-xs">
          {input.length > 20 ? '复杂' : '简单'}查询
        </span>
      )}
    </div>
  );
};

/**
 * 迷你工具指示器（仅显示图标）
 */
export const MiniToolIndicator: React.FC<
  Omit<ToolIndicatorProps, 'className'> & { size?: 'sm' | 'md' | 'lg' }
> = ({ input, enabled = true, debounceMs = 500, size = 'md', onClassified }) => {
  const [localResult, setLocalResult] = useState<
    import('@/types/toolClassification').ClassificationResult | null
  >(null);
  const [isDebouncing, setIsDebouncing] = useState(false);

  useEffect(() => {
    if (!enabled || !input.trim()) {
      setLocalResult(null);
      setIsDebouncing(false);
      return;
    }

    setIsDebouncing(true);

    const timer = setTimeout(async () => {
      try {
        const response = await toolClassificationService.classify(input.trim());
        setLocalResult(response.result);
        setIsDebouncing(false);
        onClassified?.(response.result);
      } catch (error) {
        setIsDebouncing(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [input, enabled, debounceMs]);

  if (!input.trim()) {
    return null;
  }

  const sizeClasses = {
    sm: 'w-4 h-4 text-sm',
    md: 'w-5 h-5 text-base',
    lg: 'w-6 h-6 text-lg',
  };

  if (isDebouncing && !localResult) {
    return (
      <div className={`${sizeClasses[size]} theme-text-subtle flex items-center justify-center`}>
        <div className="theme-border h-full w-full animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    );
  }

  if (localResult) {
    const categoryInfo = localResult.category
      ? {
          file_operations: { icon: 'F' },
          code_generation: { icon: 'G' },
          code_analysis: { icon: 'A' },
          terminal_commands: { icon: 'T' },
          ai_chat: { icon: 'C' },
          search_operations: { icon: 'S' },
          no_tool_needed: { icon: 'N' },
        }[localResult.category]
      : { icon: '?' };

    return (
      <span className={`${sizeClasses[size]} theme-text-muted inline-flex items-center justify-center font-semibold`} aria-label="Tool category">
        {categoryInfo.icon}
      </span>
    );
  }

  return null;
};

export default ToolIndicator;
