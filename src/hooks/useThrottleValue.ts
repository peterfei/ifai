/**
 * useThrottleValue Hook
 *
 * 对值进行节流，减少高频更新
 *
 * @version 1.0.0
 */

import { useState, useEffect, useRef } from 'react';

export interface UseThrottleValueOptions<T> {
  /** 节流间隔（ms），默认 100ms */
  interval?: number;
  /** 是否启用节流，默认 true */
  enabled?: boolean;
  /** 值比较函数，用于判断是否真正变化 */
  isEqual?: (prev: T, curr: T) => boolean;
}

/**
 * 节流值 hook
 *
 * 对高频变化的值进行节流，只在指定间隔后才更新
 */
export function useThrottleValue<T>(
  value: T,
  options: UseThrottleValueOptions<T> = {}
): T {
  const {
    interval = 100,
    enabled = true,
    isEqual = (prev, curr) => prev === curr,
  } = options;

  const [throttledValue, setThrottledValue] = useState(value);
  const lastValueRef = useRef(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setThrottledValue(value);
      lastValueRef.current = value;
      return;
    }

    // 值未变化，不触发更新
    if (isEqual(lastValueRef.current, value)) {
      return;
    }

    // 清除之前的定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // 立即更新（首次或显著变化）
    if (lastValueRef.current === value || timeoutRef.current === null) {
      setThrottledValue(value);
      lastValueRef.current = value;
      return;
    }

    // 节流更新
    timeoutRef.current = setTimeout(() => {
      setThrottledValue(value);
      lastValueRef.current = value;
    }, interval);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [value, interval, enabled, isEqual]);

  return throttledValue;
}

/**
 * 批处理值 hook
 *
 * 收集一段时间内的多次更新，然后一次性批量更新
 */
export function useBatchValue<T>(
  value: T,
  options: UseThrottleValueOptions<T> = {}
): T {
  const {
    interval = 200, // 批处理间隔更长，默认 200ms
    enabled = true,
    isEqual = (prev, curr) => prev === curr,
  } = options;

  return useThrottleValue(value, { interval, enabled, isEqual });
}
