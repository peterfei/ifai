/**
 * Performance Monitoring Utilities
 *
 * Measures and reports performance metrics for file tree operations.
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private timers: Map<string, number> = new Map();

  /**
   * Start measuring an operation
   * @param name - Operation name
   */
  start(name: string): void {
    this.timers.set(name, performance.now());
  }

  /**
   * End measuring an operation and record the duration
   * @param name - Operation name
   * @returns Duration in milliseconds
   */
  end(name: string): number {
    const startTime = this.timers.get(name);
    if (startTime === undefined) {
      console.warn(`[Perf] No start time found for: ${name}`);
      return 0;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    this.metrics.push({
      name,
      duration,
      timestamp: Date.now(),
    });

    this.timers.delete(name);

    console.log(`[Perf] ${name}: ${duration.toFixed(2)}ms`);

    return duration;
  }

  /**
   * Measure an async function
   * @param name - Operation name
   * @param fn - Async function to measure
   */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.start(name);
    try {
      const result = await fn();
      this.end(name);
      return result;
    } catch (error) {
      this.end(name);
      throw error;
    }
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics by name
   * @param name - Operation name
   */
  getMetricsByName(name: string): PerformanceMetric[] {
    return this.metrics.filter(m => m.name === name);
  }

  /**
   * Get average duration for an operation
   * @param name - Operation name
   */
  getAverageDuration(name: string): number {
    const metrics = this.getMetricsByName(name);
    if (metrics.length === 0) return 0;

    const sum = metrics.reduce((acc, m) => acc + m.duration, 0);
    return sum / metrics.length;
  }

  /**
   * Get statistics for an operation
   * @param name - Operation name
   */
  getStatistics(name: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    total: number;
  } {
    const metrics = this.getMetricsByName(name);
    if (metrics.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, total: 0 };
    }

    const durations = metrics.map(m => m.duration);
    return {
      count: metrics.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: this.getAverageDuration(name),
      total: durations.reduce((acc, d) => acc + d, 0),
    };
  }

  /**
   * Print summary report
   */
  printSummary(): void {
    console.log('\n=== Performance Summary ===');

    // Group by name
    const grouped = new Map<string, PerformanceMetric[]>();
    for (const metric of this.metrics) {
      if (!grouped.has(metric.name)) {
        grouped.set(metric.name, []);
      }
      grouped.get(metric.name)!.push(metric);
    }

    // Print statistics for each operation
    for (const [name, metrics] of grouped.entries()) {
      const stats = this.getStatistics(name);
      console.log(`\n${name}:`);
      console.log(`  Count: ${stats.count}`);
      console.log(`  Avg:   ${stats.avg.toFixed(2)}ms`);
      console.log(`  Min:   ${stats.min.toFixed(2)}ms`);
      console.log(`  Max:   ${stats.max.toFixed(2)}ms`);
      console.log(`  Total: ${stats.total.toFixed(2)}ms`);
    }

    console.log('\n==========================\n');
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.timers.clear();
  }

  /**
   * Compare before/after optimization
   */
  compare(name: string, beforeMetrics: PerformanceMetric[], afterMetrics: PerformanceMetric[]): void {
    const beforeAvg = beforeMetrics.length > 0
      ? beforeMetrics.reduce((acc, m) => acc + m.duration, 0) / beforeMetrics.length
      : 0;
    const afterAvg = afterMetrics.length > 0
      ? afterMetrics.reduce((acc, m) => acc + m.duration, 0) / afterMetrics.length
      : 0;

    const improvement = beforeAvg > 0 ? ((beforeAvg - afterAvg) / beforeAvg * 100) : 0;

    console.log(`\n=== ${name} Optimization Results ===`);
    console.log(`Before: ${beforeAvg.toFixed(2)}ms`);
    console.log(`After:  ${afterAvg.toFixed(2)}ms`);
    console.log(`Improvement: ${improvement > 0 ? '-' : '+'}${Math.abs(improvement).toFixed(1)}%`);
    console.log(`Speedup: ${beforeAvg / afterAvg}x`);
    console.log('======================================\n');
  }
}

// Singleton instance
export const perfMonitor = new PerformanceMonitor();

/**
 * Performance decorator for measuring functions
 */
export function measurePerformance(name: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      perfMonitor.start(name);
      try {
        const result = await originalMethod.apply(this, args);
        perfMonitor.end(name);
        return result;
      } catch (error) {
        perfMonitor.end(name);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Console-based performance logging utility
 */
export class ConsolePerfLogger {
  private enabled: boolean = true;

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  group(label: string): void {
    if (this.enabled) console.group(`[Perf] ${label}`);
  }

  groupEnd(): void {
    if (this.enabled) console.groupEnd();
  }

  log(message: string, ...args: any[]): void {
    if (this.enabled) console.log(`[Perf] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    if (this.enabled) console.warn(`[Perf] ${message}`, ...args);
  }

  table(data: any): void {
    if (this.enabled) console.table(data);
  }
}

export const perfLogger = new ConsolePerfLogger();
