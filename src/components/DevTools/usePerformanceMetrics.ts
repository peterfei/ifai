import { useState, useEffect, useRef } from 'react';
import { perfMonitor } from '../../utils/performanceMonitor';

export interface MetricsPoint {
  timestamp: number;
  fps: number;
  memory: number; // MB
  tokens: number;
}

export const usePerformanceMetrics = (updateInterval = 1000) => {
  const [metrics, setMetrics] = useState<MetricsPoint[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<MetricsPoint>({
    timestamp: 0,
    fps: 0,
    memory: 0,
    tokens: 0
  });

  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const rafId = useRef<number | null>(null);

  // FPS Calculation loop
  useEffect(() => {
    const loop = (time: number) => {
      frameCount.current++;
      if (time - lastTime.current >= 1000) {
        // FPS is calculated in the interval timer below to sync with other metrics
      }
      rafId.current = requestAnimationFrame(loop);
    };
    rafId.current = requestAnimationFrame(loop);

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  // Metrics collection timer
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const perfNow = performance.now();
      const delta = perfNow - lastTime.current;
      
      const currentFps = Math.round((frameCount.current * 1000) / delta);
      
      // Reset FPS counters
      frameCount.current = 0;
      lastTime.current = perfNow;

      // Mock Memory (since performance.memory is non-standard/Chrome only)
      // @ts-ignore
      const memory = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : 0;

      // Mock Token usage (in real app, fetch from store)
      const tokens = Math.floor(Math.random() * 1000); 

      const newPoint: MetricsPoint = {
        timestamp: now,
        fps: currentFps,
        memory,
        tokens
      };

      setCurrentMetrics(newPoint);
      setMetrics(prev => {
        const next = [...prev, newPoint];
        if (next.length > 50) next.shift(); // Keep last 50 points
        return next;
      });

    }, updateInterval);

    return () => clearInterval(timer);
  }, [updateInterval]);

  return { metrics, currentMetrics };
};
