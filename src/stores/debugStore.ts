/**
 * 调试页面状态管理
 *
 * 控制各种开发和调试工具面板的显示
 */

import { create } from 'zustand';

/**
 * 调试页面状态
 */
interface DebugState {
  /** 工具分类测试面板是否打开 */
  isToolClassificationTestOpen: boolean;
  /** 性能监控面板是否打开 */
  isPerformanceMonitorOpen: boolean;
  /** 缓存统计面板是否打开 */
  isCacheStatsOpen: boolean;
  /** 任务监控演示面板是否打开 */
  isTaskMonitorDemoOpen: boolean;

  /** 打开工具分类测试面板 */
  openToolClassificationTest: () => void;
  /** 关闭工具分类测试面板 */
  closeToolClassificationTest: () => void;
  /** 切换工具分类测试面板 */
  toggleToolClassificationTest: () => void;

  /** 打开性能监控面板 */
  openPerformanceMonitor: () => void;
  /** 关闭性能监控面板 */
  closePerformanceMonitor: () => void;
  /** 切换性能监控面板 */
  togglePerformanceMonitor: () => void;

  /** 打开缓存统计面板 */
  openCacheStats: () => void;
  /** 关闭缓存统计面板 */
  closeCacheStats: () => void;
  /** 切换缓存统计面板 */
  toggleCacheStats: () => void;

  /** 打开任务监控演示面板 */
  openTaskMonitorDemo: () => void;
  /** 关闭任务监控演示面板 */
  closeTaskMonitorDemo: () => void;
  /** 切换任务监控演示面板 */
  toggleTaskMonitorDemo: () => void;

  /** 关闭所有调试面板 */
  closeAll: () => void;
}

/**
 * 调试页面 Store
 */
export const useDebugStore = create<DebugState>((set) => ({
  // 初始状态
  isToolClassificationTestOpen: false,
  isPerformanceMonitorOpen: false,
  isCacheStatsOpen: false,
  isTaskMonitorDemoOpen: false,

  // 工具分类测试面板
  openToolClassificationTest: () => set({ isToolClassificationTestOpen: true }),
  closeToolClassificationTest: () => set({ isToolClassificationTestOpen: false }),
  toggleToolClassificationTest: () =>
    set((state) => ({ isToolClassificationTestOpen: !state.isToolClassificationTestOpen })),

  // 性能监控面板
  openPerformanceMonitor: () => set({ isPerformanceMonitorOpen: true }),
  closePerformanceMonitor: () => set({ isPerformanceMonitorOpen: false }),
  togglePerformanceMonitor: () =>
    set((state) => ({ isPerformanceMonitorOpen: !state.isPerformanceMonitorOpen })),

  // 缓存统计面板
  openCacheStats: () => set({ isCacheStatsOpen: true }),
  closeCacheStats: () => set({ isCacheStatsOpen: false }),
  toggleCacheStats: () => set((state) => ({ isCacheStatsOpen: !state.isCacheStatsOpen })),

  // 任务监控演示面板
  openTaskMonitorDemo: () => set({ isTaskMonitorDemoOpen: true }),
  closeTaskMonitorDemo: () => set({ isTaskMonitorDemoOpen: false }),
  toggleTaskMonitorDemo: () =>
    set((state) => ({ isTaskMonitorDemoOpen: !state.isTaskMonitorDemoOpen })),

  // 关闭所有
  closeAll: () =>
    set({
      isToolClassificationTestOpen: false,
      isPerformanceMonitorOpen: false,
      isCacheStatsOpen: false,
      isTaskMonitorDemoOpen: false,
    }),
}));

/**
 * 便捷Hooks
 */
export const useToolClassificationTestOpen = () =>
  useDebugStore((state) => state.isToolClassificationTestOpen);

export const usePerformanceMonitorOpen = () =>
  useDebugStore((state) => state.isPerformanceMonitorOpen);

export const useCacheStatsOpen = () => useDebugStore((state) => state.isCacheStatsOpen);

export const useTaskMonitorDemoOpen = () =>
  useDebugStore((state) => state.isTaskMonitorDemoOpen);
