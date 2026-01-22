/**
 * 实时工具分类指示器组件
 *
 * 在用户输入时实时显示工具分类结果
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import { toolClassificationService } from '@/services/toolClassificationService';
import { getToolCategoryDisplayInfo, getLayerDisplayInfo } from '@/types/toolClassification';
import type { ClassificationResult } from '@/types/toolClassification';
import ClassificationBadge from './ClassificationBadge';

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

  // 防抖输入值
  const debouncedInput = useDebounce(input, debounceMs);

  // 执行分类
  const classify = useCallback(async (text: string) => {
    if (text.length < minLength || disabled) {
      setResult(null);
      return;
    }

    setIsLoading(true);
    const startTime = performance.now();

    try {
      const response = await toolClassificationService.classify(text);
      setResult(response.result);
      setLatency(response.latencyMs);
    } catch (error) {
      console.error('[ToolClassificationIndicator] Classification failed:', error);
      setResult(null);
    } finally {
      setIsLoading(false);
      setLatency(performance.now() - startTime);
    }
  }, [minLength, disabled]);

  // 监听防抖后的输入变化
  useEffect(() => {
    classify(debouncedInput);
  }, [debouncedInput, classify]);

  // 如果没有输入或结果，不显示
  if (!input || input.length < minLength) {
    return null;
  }

  const categoryInfo = result ? getToolCategoryDisplayInfo(result.category) : null;
  const layerInfo = result ? getLayerDisplayInfo(result.layer) : null;

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
          {/* 层级指示器 */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: layerInfo?.color + '20',
              color: layerInfo?.color,
            }}
            title={layerInfo?.description}
          >
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
