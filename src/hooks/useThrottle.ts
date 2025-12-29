import { useEffect, useRef, useState } from 'react';

export function useThrottle<T>(value: T, interval: number = 500): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  // Initialize lastUpdated on first render
  const lastUpdated = useRef<number>(Date.now());
  // Track pending timeout to clear it when value or interval changes
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  // Track previous interval to detect transitions from throttled to immediate mode
  const prevIntervalRef = useRef<number>(interval);

  useEffect(() => {
    // Detect transition from throttled mode to immediate mode
    // When this happens, we need to sync the throttled value immediately
    if (prevIntervalRef.current > 0 && interval <= 0) {
      setThrottledValue(value);
      prevIntervalRef.current = interval;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      return;
    }

    // Update previous interval reference
    prevIntervalRef.current = interval;

    // For immediate mode (interval <= 0), no further processing needed
    if (interval <= 0) {
      // Still sync throttledValue to keep state consistent
      setThrottledValue(value);
      return;
    }

    // Clear any pending timeout when value or interval changes
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdated.current;

    if (timeSinceLastUpdate >= interval) {
      // Enough time has passed, update immediately
      setThrottledValue(value);
      lastUpdated.current = now;
    } else {
      // Not enough time, schedule update for remaining interval
      const remainingTime = interval - timeSinceLastUpdate;
      timeoutRef.current = setTimeout(() => {
        setThrottledValue(value);
        lastUpdated.current = Date.now();
        timeoutRef.current = undefined;
      }, remainingTime);
    }

    // Cleanup: clear timeout on unmount or before next effect
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    };
  }, [value, interval]);

  // Return value directly when in immediate mode to avoid extra render
  if (interval <= 0) {
    return value;
  }

  return throttledValue;
}
