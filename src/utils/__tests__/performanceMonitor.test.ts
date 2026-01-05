import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { perfMonitor } from '../performanceMonitor';

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    perfMonitor.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should measure execution time', () => {
    const opName = 'test-op';
    perfMonitor.start(opName);
    
    // 模拟时间流逝 100ms
    vi.advanceTimersByTime(100);
    
    const duration = perfMonitor.end(opName);
    expect(duration).toBe(100);
    
    const metrics = perfMonitor.getMetricsByName(opName);
    expect(metrics).toHaveLength(1);
    expect(metrics[0].duration).toBe(100);
  });

  it('should handle measuring async functions', async () => {
    const opName = 'async-op';
    const asyncFn = async () => {
      vi.advanceTimersByTime(50);
      return 'done';
    };

    const result = await perfMonitor.measure(opName, asyncFn);
    
    expect(result).toBe('done');
    const metrics = perfMonitor.getMetricsByName(opName);
    expect(metrics).toHaveLength(1);
    expect(metrics[0].duration).toBe(50);
  });

  it('should calculate statistics correctly', () => {
    const opName = 'stats-op';
    
    // 模拟 3 次操作：10ms, 20ms, 30ms
    perfMonitor.start(opName);
    vi.advanceTimersByTime(10);
    perfMonitor.end(opName);

    perfMonitor.start(opName);
    vi.advanceTimersByTime(20);
    perfMonitor.end(opName);

    perfMonitor.start(opName);
    vi.advanceTimersByTime(30);
    perfMonitor.end(opName);

    const stats = perfMonitor.getStatistics(opName);
    expect(stats.count).toBe(3);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(30);
    expect(stats.avg).toBe(20);
    expect(stats.total).toBe(60);
  });

  it('should handle missing start time gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const duration = perfMonitor.end('non-existent');
    
    expect(duration).toBe(0);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
