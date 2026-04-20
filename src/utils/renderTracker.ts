/**
 * 🔍 React 渲染性能分析工具
 *
 * 目标：识别 200 条消息场景下的 React 渲染瓶颈
 *
 * 使用方式：
 * 在组件中添加 `useRenderTracker('ComponentName')` 来监控渲染
 */

import { useEffect, useRef } from 'react';

// 全局渲染统计
const renderStats = new Map<string, {
  count: number;
  totalTime: number;
  lastRender: number;
  timestamps: number[];
}>();

/**
 * 清空渲染统计
 */
export function clearRenderStats() {
  renderStats.clear();
}

/**
 * 获取渲染统计报告
 */
export function getRenderStatsReport() {
  const report: Record<string, any> = {};

  renderStats.forEach((stats, componentName) => {
    report[componentName] = {
      renderCount: stats.count,
      avgTime: stats.totalTime / stats.count,
      lastRender: stats.lastRender,
      timestamps: stats.timestamps,
    };
  });

  return report;
}

/**
 * 打印渲染统计报告到控制台
 */
export function printRenderStatsReport() {
  console.log('\n=== 📊 React 渲染性能报告 ===\n');

  const sorted = Array.from(renderStats.entries())
    .sort((a, b) => b[1].count - a[1].count);

  if (sorted.length === 0) {
    console.log('没有渲染统计数据');
    return;
  }

  console.log('🔥 渲染次数排名：\n');

  sorted.forEach(([name, stats]) => {
    const avgTime = stats.totalTime / stats.count;
    console.log(`  ${name}:`);
    console.log(`    渲染次数: ${stats.count}`);
    console.log(`    平均耗时: ${avgTime.toFixed(2)}ms`);
    console.log(`    最后渲染: ${new Date(stats.lastRender).toLocaleTimeString()}`);
    console.log('');
  });

  // 找出渲染次数最多的组件
  const topRerenderer = sorted[0];
  if (topRerenderer[1].count > 50) {
    console.warn(`⚠️ ${topRerenderer[0]} 渲染了 ${topRerenderer[1].count} 次！`);
    console.warn('   可能需要添加 React.memo 或优化依赖项');
  }

  console.log('=== 📊 报告结束 ===\n');
}

/**
 * 渲染追踪 Hook
 *
 * @param componentName 组件名称
 * @param enabled 是否启用追踪（默认 true）
 *
 * @example
 * function MyComponent() {
 *   useRenderTracker('MyComponent');
 *   return <div>...</div>;
 * }
 */
export function useRenderTracker(componentName: string, enabled: boolean = true) {
  if (!enabled) return;

  const renderCount = useRef(0);
  const mountTime = useRef(Date.now());

  useEffect(() => {
    renderCount.current++;

    const now = Date.now();
    const stats = renderStats.get(componentName) || {
      count: 0,
      totalTime: 0,
      lastRender: 0,
      timestamps: [],
    };

    stats.count++;
    stats.lastRender = now;
    stats.timestamps.push(now);

    // 只保留最近 100 次时间戳
    if (stats.timestamps.length > 100) {
      stats.timestamps.shift();
    }

    renderStats.set(componentName, stats);

    // 🔥 每 50 次渲染打印一次警告
    if (renderCount.current % 50 === 0) {
      console.warn(`[RenderTracker] ${componentName} 已渲染 ${renderCount.current} 次`);
    }
  });

  // 组件卸载时打印统计
  useEffect(() => {
    return () => {
      const stats = renderStats.get(componentName);
      if (stats) {
        const duration = Date.now() - mountTime.current;
        console.log(`[RenderTracker] ${componentName} 卸载:`);
        console.log(`  总渲染次数: ${stats.count}`);
        console.log(`  存活时间: ${(duration / 1000).toFixed(2)}s`);
        console.log(`  平均渲染频率: ${(stats.count / (duration / 1000)).toFixed(2)} renders/s`);
      }
    };
  }, [componentName]);
}

/**
 * 🔥 Store 订阅追踪器
 *
 * 监控 Zustand store 的订阅变化
 *
 * @example
 * const messages = useChatStore(useStoreTracker('useChatStore.messages', state => state.messages));
 */
export function useStoreTracker<T>(
  storeName: string,
  selector: (state: any) => T,
  enabled: boolean = true
): (state: any) => T {
  if (!enabled) return selector;

  return (state) => {
    const result = selector(state);

    // 记录订阅更新
    const key = `${storeName}_${selector.toString().slice(0, 30)}`;
    const stats = renderStats.get(`store:${key}`) || {
      count: 0,
      totalTime: 0,
      lastRender: 0,
      timestamps: [],
    };

    stats.count++;
    stats.lastRender = Date.now();
    renderStats.set(`store:${key}`, stats);

    return result;
  };
}

/**
 * 🔥 性能监控装饰器
 *
 * 用于包装函数以测量执行时间
 *
 * @example
 * const expensiveOperation = monitorPerformance('expensiveOperation', (arg) => {
 *   // ... 一些耗时操作
 *   return result;
 * });
 */
export function monitorPerformance<T extends (...args: any[]) => any>(
  name: string,
  fn: T
): T {
  return ((...args: any[]) => {
    const start = performance.now();
    const result = fn(...args);
    const end = performance.now();

    const stats = renderStats.get(`fn:${name}`) || {
      count: 0,
      totalTime: 0,
      lastRender: 0,
      timestamps: [],
    };

    stats.count++;
    stats.totalTime += end - start;
    stats.lastRender = Date.now();
    renderStats.set(`fn:${name}`, stats);

    // ⚠️ 警告慢函数
    if (end - start > 16) {  // 60fps = 16.67ms
      console.warn(`[Perf] ${name} 耗时 ${(end - start).toFixed(2)}ms`);
    }

    return result;
  }) as T;
}

/**
 * 🔥 检测性能泄漏
 *
 * 检查是否有组件渲染次数过多
 */
export function detectPerformanceLeaks() {
  const leaks: string[] = [];

  renderStats.forEach((stats, name) => {
    // 如果一个组件渲染超过 100 次，可能有问题
    if (stats.count > 100) {
      leaks.push(`${name}: ${stats.count} 次渲染`);
    }
  });

  if (leaks.length > 0) {
    console.error('🚨 检测到可能的性能泄漏：\n');
    leaks.forEach(leak => console.error(`  - ${leak}`));
    console.log('');
  }

  return leaks;
}

/**
 * 🔥 启动全局性能监控
 *
 * 定期打印渲染统计和检测泄漏
 */
export function startGlobalPerformanceMonitoring(intervalMs: number = 10000) {
  return setInterval(() => {
    printRenderStatsReport();
    detectPerformanceLeaks();
  }, intervalMs);
}

/**
 * 🔥 停止全局性能监控
 */
export function stopGlobalPerformanceMonitoring(intervalId: ReturnType<typeof setInterval>) {
  clearInterval(intervalId);
}
