/**
 * 实时工具分类指示器组件
 *
 * 在用户输入时实时显示工具分类结果，包含来源图标和用户反馈功能
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
      return 'L1';
    case 'layer2':
      return 'L2';
    case 'layer3':
      return 'L3';
    default:
      return '?';
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
  const { t } = useTranslation();
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
    <div className="theme-border ml-2 flex items-center gap-1 border-l pl-2">
      <button
        onClick={handlePositive}
        data-testid="feedback-correct"
        disabled={disabled || feedbackGiven === 'positive'}
        className={`p-1 rounded transition-colors ${
          feedbackGiven === 'positive'
            ? 'theme-badge-success'
            : 'theme-text-subtle hover:text-[var(--success-color)] hover:bg-[var(--hover-bg)]'
        }`}
        title={t('toolClassificationIndicator.feedbackCorrect')}
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={handleNegative}
        data-testid="feedback-incorrect"
        disabled={disabled || feedbackGiven === 'negative'}
        className={`p-1 rounded transition-colors ${
          feedbackGiven === 'negative'
            ? 'theme-badge-danger'
            : 'theme-text-subtle hover:text-[var(--danger-color)] hover:bg-[var(--hover-bg)]'
        }`}
        title={t('toolClassificationIndicator.feedbackIncorrect')}
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
  const { t } = useTranslation();
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
    <div 
      data-testid="tool-classification-indicator"
      className={`flex items-center gap-2 px-1 py-0.5 ${className}`}
    >
      {/* 加载状态 */}
      {isLoading && (
        <div className="theme-text-subtle flex items-center gap-1.5 text-[10px] italic">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          <span>{t('toolClassificationIndicator.thinking')}</span>
        </div>
      )}

      {/* 分类结果 */}
      {!isLoading && result && (
        <>
          {/* 层级指示器 */}
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight"
            style={{
              backgroundColor: layerInfo?.color + '15',
              color: layerInfo?.color,
            }}
            title={layerInfo?.description}
          >
            <span>{layerIcon}</span>
            <span>{layerInfo?.label}</span>
          </div>

          {/* 分类标签 */}
          <ClassificationBadge result={result} compact showConfidence={false} />

          {/* 性能指标：合并显示 */}
          <div className="theme-text-subtle flex items-center gap-2 text-[10px] font-bold">
            <span>{(result.confidence * 100).toFixed(0)}%</span>
            {latency > 0 && (
              <span className={latency > 100 ? 'theme-text-danger' : 'theme-text-subtle'}>
                {latency.toFixed(0)}ms
              </span>
            )}
          </div>

          {/* 用户反馈按钮 - 更加隐蔽 */}
          {showFeedback && (
            <div className="scale-90 opacity-40 hover:opacity-100 transition-opacity">
              <FeedbackButtons
                onPositive={() => handleFeedback(true)}
                onNegative={() => handleFeedback(false)}
                disabled={isLoading}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ToolClassificationIndicator;
