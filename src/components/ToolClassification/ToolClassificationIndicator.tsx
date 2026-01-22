/**
 * 实时工具分类指示器组件
 *
 * 在用户输入时实时显示工具分类结果，包含来源图标和用户反馈功能
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { toolClassificationService } from '@/services/toolClassificationService';
import { getToolCategoryDisplayInfo, getLayerDisplayInfo } from '@/types/toolClassification';
import type { ClassificationResult, ClassificationLayer } from '@/types/toolClassification';
import ClassificationBadge from './ClassificationBadge';
import { useToolClassificationStore } from '@/stores/toolClassificationStore';

interface ToolClassificationIndicatorProps {
  /** 用户输入文本 */
  input: string;
  /** 是否禁用（加载中） */
  disabled?: boolean;
  /** 最小输入长度（默认2个字符） */
  minLength?: number;
  /** 防抖延迟（默认300ms） */
  debounceMs?: number;
  /** 自定义类名 */
  className?: string;
}

/**
 * 获取层级对应的图标
 */
function getLayerIcon(layer: ClassificationLayer): string {
  switch (layer) {
    case 'layer1':
      return '🎯'; // 精确匹配
    case 'layer2':
      return '🤔'; // 规则分类
    case 'layer3':
      return '🧠'; // LLM 分类
    default:
      return '❓';
  }
}

/**
 * 防抖Hook
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * 反馈按钮组件
 */
interface FeedbackButtonsProps {
  onPositive: () => void;
  onNegative: () => void;
  disabled?: boolean;
}

const FeedbackButtons: React.FC<FeedbackButtonsProps> = ({ onPositive, onNegative, disabled }) => {
  const [feedbackGiven, setFeedbackGiven] = useState<'positive' | 'negative' | null>(null);

  const handlePositive = () => {
    if (feedbackGiven !== 'positive') {
      setFeedbackGiven('positive');
      onPositive();
    }
  };

  const handleNegative = () => {
    if (feedbackGiven !== 'negative') {
      setFeedbackGiven('negative');
      onNegative();
    }
  };

  return (
    <div className="flex items-center gap-1 ml-2 border-l border-gray-700 pl-2">
      <button
        onClick={handlePositive}
        disabled={disabled || feedbackGiven === 'positive'}
        className={`p-1 rounded transition-colors ${
          feedbackGiven === 'positive'
            ? 'bg-green-600 text-white'
            : 'text-gray-500 hover:text-green-400 hover:bg-gray-800'
        }`}
        title="分类正确"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={handleNegative}
        disabled={disabled || feedbackGiven === 'negative'}
        className={`p-1 rounded transition-colors ${
          feedbackGiven === 'negative'
            ? 'bg-red-600 text-white'
            : 'text-gray-500 hover:text-red-400 hover:bg-gray-800'
        }`}
        title="分类错误"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

/**
 * 工具分类指示器组件
 */
export const ToolClassificationIndicator: React.FC<ToolClassificationIndicatorProps> = ({
  input,
  disabled = false,
  minLength = 2,
  debounceMs = 300,
  className = '',
}) => {
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [latency, setLatency] = useState<number>(0);
  const [showFeedback, setShowFeedback] = useState(false);

  // 防抖输入值
  const debouncedInput = useDebounce(input, debounceMs);

  // 执行分类
  const classify = useCallback(async (text: string) => {
    if (text.length < minLength || disabled) {
      setResult(null);
      setShowFeedback(false);
      return;
    }

    setIsLoading(true);
    const startTime = performance.now();

    try {
      const response = await toolClassificationService.classify(text);
      setResult(response.result);
      setLatency(response.latencyMs);
      // 有结果时显示反馈按钮
      setShowFeedback(true);
    } catch (error) {
      console.error('[ToolClassificationIndicator] Classification failed:', error);
      setResult(null);
      setShowFeedback(false);
    } finally {
      setIsLoading(false);
      setLatency(performance.now() - startTime);
    }
  }, [minLength, disabled]);

  // 监听防抖后的输入变化
  useEffect(() => {
    classify(debouncedInput);
  }, [debouncedInput, classify]);

  // 处理用户反馈
  const handleFeedback = useCallback((isCorrect: boolean) => {
    if (!result) return;

    // 使用store保存反馈数据
    useToolClassificationStore.getState().submitFeedback(
      debouncedInput,
      result,
      isCorrect
    );

    console.log('[ToolClassificationIndicator] User feedback saved:', {
      input: debouncedInput,
      result,
      isCorrect,
      timestamp: Date.now(),
    });
  }, [result, debouncedInput]);

  // 如果没有输入或结果，不显示
  if (!input || input.length < minLength) {
    return null;
  }

  const categoryInfo = result ? getToolCategoryDisplayInfo(result.category) : null;
  const layerInfo = result ? getLayerDisplayInfo(result.layer) : null;
  const layerIcon = result ? getLayerIcon(result.layer) : null;

  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#1e1e1e] border border-gray-700/50 ${className}`}>
      {/* 加载状态 */}
      {isLoading && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>分类中...</span>
        </div>
      )}

      {/* 分类结果 */}
      {!isLoading && result && (
        <>
          {/* 层级指示器 + 图标 */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: layerInfo?.color + '20',
              color: layerInfo?.color,
            }}
            title={layerInfo?.description}
          >
            <span className="text-sm">{layerIcon}</span>
            <span className="ml-1">{layerInfo?.label}</span>
          </div>

          {/* 分类标签 */}
          <ClassificationBadge result={result} compact showConfidence={false} />

          {/* 置信度 */}
          <div className="text-xs text-gray-500">
            {(result.confidence * 100).toFixed(0)}%
          </div>

          {/* 延迟 */}
          {latency > 0 && (
            <div
              className={`text-xs font-mono ${
                latency > 100 ? 'text-red-400' : latency > 20 ? 'text-yellow-400' : 'text-green-400'
              }`}
            >
              {latency.toFixed(1)}ms
            </div>
          )}

          {/* 用户反馈按钮 */}
          {showFeedback && (
            <FeedbackButtons
              onPositive={() => handleFeedback(true)}
              onNegative={() => handleFeedback(false)}
              disabled={isLoading}
            />
          )}
        </>
      )}

      {/* 无结果 */}
      {!isLoading && !result && input.length >= minLength && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Zap className="w-3 h-3" />
          <span>等待输入...</span>
        </div>
      )}
    </div>
  );
};

export default ToolClassificationIndicator;
