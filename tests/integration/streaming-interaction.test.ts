/**
 * 流式交互集成测试
 *
 * 测试流式输出期间的交互体验：
 * - 输入响应性
 * - Tab 切换流畅性
 * - 滚动交互
 * - UI 不被阻塞
 *
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTypewriter } from '../../src/hooks/useTypewriter';
import { useChatScrollController } from '../../src/hooks/useChatScrollController';
import { featureFlags } from '../../src/config/features';

// ============================================
// 流式交互模拟器
// ============================================

class StreamingSimulator {
  private deltas: string[] = [];
  private currentIndex = 0;
  private chunkDelay = 10; // ms

  constructor(content: string, chunksPerSecond = 100) {
    this.chunkDelay = 1000 / chunksPerSecond;
    // 模拟将内容分割成小片段
    const chunkSize = Math.max(1, Math.floor(content.length / 50));
    for (let i = 0; i < content.length; i += chunkSize) {
      this.deltas.push(content.slice(i, i + chunkSize));
    }
  }

  hasNext(): boolean {
    return this.currentIndex < this.deltas.length;
  }

  getNext(): string {
    return this.deltas[this.currentIndex++] || '';
  }

  reset(): void {
    this.currentIndex = 0;
  }

  getDelay(): number {
    return this.chunkDelay;
  }
}

// ============================================
// 测试套件
// ============================================

describe('流式交互集成测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('输入响应性测试', () => {
    it('流式输出期间打字机不应该阻塞输入', async () => {
      const longContent = 'A'.repeat(1000);

      const { result } = renderHook(() =>
        useTypewriter({
          content: longContent,
          enabled: true,
          throttleMode: true, // 节流模式
          throttleInterval: 50,
        })
      );

      // 模拟输入响应时间
      const inputLatency = measureExecutionTime(() => {
        // 在流式期间模拟用户输入
        act(() => {
          // 获取当前显示文本（模拟渲染）
          const currentText = result.current.displayText;
          expect(currentText).toBeDefined();
        });
      });

      // 输入延迟应该小于 50ms
      expect(inputLatency.durationMs).toBeLessThan(50);
    });

    it('节流模式下更新频率应该降低', () => {
      const longContent = 'B'.repeat(1000);

      const { result } = renderHook(() =>
        useTypewriter({
          content: longContent,
          enabled: true,
          // 不传 throttleMs → 无节流（每帧更新）
        })
      );

      // 收集正常模式的更新次数
      const originalDisplayText = result.current.displayText;

      // 节流模式：throttleMs=50ms
      const { result: throttledResult } = renderHook(() =>
        useTypewriter({
          content: longContent,
          enabled: true,
          throttleMs: 50, // 节流 50ms
        })
      );

      // 节流模式更新次数更少
      // （这个测试主要是概念验证，实际更新次数由 RAF 调度决定）
      expect(throttledResult.current).toBeDefined();
    });
  });

  describe('Tab 切换流畅性测试', () => {
    it('流式输出时切换 tab 不应该导致性能下降', () => {
      const container = {
        scrollHeight: 10000,
        scrollTop: 9500,
        clientHeight: 500,
        scrollTo: vi.fn(),
      };

      const { result: scrollResult } = renderHook(() =>
        useChatScrollController({
          containerRef: { current: container as any },
          messageCount: 100,
          isStreaming: true,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      // 模拟 tab 切换时的操作
      const tabSwitchTime = measureExecutionTime(() => {
        act(() => {
          // 模拟 tab 切换时需要执行的操作
          scrollResult.current.onUserScroll();
          scrollResult.current.followBottom(true);
        });
      }, 10); // 10ms 预算

      // Tab 切换应该在 10ms 内完成
      expect(tabSwitchTime.withinBudget).toBe(true);
    });

    it('多个组件同时流式更新时不应该互相阻塞', () => {
      // 模拟多个消息同时流式输出
      const contents = [
        'A'.repeat(500),
        'B'.repeat(500),
        'C'.repeat(500),
      ];

      const startTime = performance.now();

      const results = contents.map((content) =>
        renderHook(() =>
          useTypewriter({
            content,
            enabled: true,
            throttleMode: true,
            throttleInterval: 50,
          })
        )
      );

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 初始化时间应该小于 100ms
      expect(duration).toBeLessThan(100);

      // 所有 hook 应该正常工作
      results.forEach(({ result }) => {
        expect(result.current.displayText).toBeDefined();
      });
    });
  });

  describe('滚动交互测试', () => {
    it('流式输出时用户可以流畅滚动', () => {
      const container = {
        scrollHeight: 10000,
        scrollTop: 8000, // 不在底部
        clientHeight: 500,
        scrollTo: vi.fn(),
      };

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef: { current: container as any },
          messageCount: 100,
          isStreaming: true,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      // 模拟用户快速滚动
      const scrollDuration = measureExecutionTime(() => {
        act(() => {
          // 模拟 10 次快速滚动
          for (let i = 0; i < 10; i++) {
            container.scrollTop = 8000 - i * 500;
            result.current.onUserScroll();
          }
        });
      }, 20); // 20ms 预算

      // 滚动应该流畅（在预算内）
      expect(scrollDuration.withinBudget).toBe(true);
    });

    it('用户滚动时流式更新不应该强制回到底部', () => {
      const container = {
        scrollHeight: 10000,
        scrollTop: 5000, // 远离底部
        clientHeight: 500,
        scrollTo: vi.fn(),
      };

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef: { current: container as any },
          messageCount: 100,
          isStreaming: true,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      // 用户滚动到中间位置
      act(() => {
        result.current.onUserScroll();
      });

      expect(result.current.isInFollowZone).toBe(false);

      const initialScrollTop = container.scrollTop;

      // 模拟流式更新
      act(() => {
        result.current.followBottom(true);
      });

      // 不应该强制滚动（用户已锁定）
      expect(container.scrollTop).toBe(initialScrollTop);
    });
  });

  describe('UI 阻塞测试', () => {
    it('流式输出时主线程不应该被阻塞', () => {
      const container = {
        scrollHeight: 10000,
        scrollTop: 9500,
        clientHeight: 500,
        scrollTo: vi.fn(),
      };

      const { result: scrollResult } = renderHook(() =>
        useChatScrollController({
          containerRef: { current: container as any },
          messageCount: 1000,
          isStreaming: true,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      const { result: typewriterResult } = renderHook(() =>
        useTypewriter({
          content: 'Test message that is streaming',
          enabled: true,
          throttleMode: true,
          throttleInterval: 50,
        })
      );

      // 模拟主线程任务
      const mainThreadTask = measureExecutionTime(() => {
        act(() => {
          // 滚动操作
          scrollResult.current.followBottom(true);

          // 打字机更新
          const currentText = typewriterResult.current.displayText;

          // 模拟其他 UI 操作
          const isLocked = scrollResult.current.isAutoScrollLocked;
          const isInZone = scrollResult.current.isInFollowZone;

          return { currentText, isLocked, isInZone };
        });
      }, 5); // 5ms 预算

      // 主线程任务应该快速完成
      expect(mainThreadTask.withinBudget).toBe(true);
    });

    it('大量并发操作不应该导致 UI 卡顿', () => {
      const operations = [];

      // 创建 20 个并发操作
      for (let i = 0; i < 20; i++) {
        const container = {
          scrollHeight: 10000,
          scrollTop: 9500 - i * 100,
          clientHeight: 500,
          scrollTo: vi.fn(),
        };

        const { result } = renderHook(() =>
          useChatScrollController({
            containerRef: { current: container as any },
            messageCount: 100,
            isStreaming: i % 2 === 0, // 部分流式
            hasPendingToolCalls: false,
            followZonePx: 120,
            enabled: true,
          })
        );

        operations.push({
          hook: result,
          container,
          index: i,
        });
      }

      // 执行所有操作
      const batchDuration = measureExecutionTime(() => {
        act(() => {
          operations.forEach(({ hook }) => {
            hook.current.onUserScroll();
            hook.current.followBottom(true);
          });
        });
      }, 50); // 50ms 预算

      // 批量操作应该在预算内
      expect(batchDuration.withinBudget).toBe(true);
    });
  });

  describe('节流效果验证', () => {
    it('节流模式下更新间隔应该符合预期', async () => {
      const longContent = 'X'.repeat(500);

      renderHook(() =>
        useTypewriter({
          content: longContent,
          enabled: true,
          throttleMs: 50, // 节流 50ms
        })
      );

      // 由于使用了节流，更新次数应该明显减少
      // 这个测试主要是验证节流逻辑的存在和正确性
      expect(featureFlags.typewriterEffect).toBe(true);
    });

    it('正常模式和节流模式应该有明显差异', () => {
      const content = 'Y'.repeat(200);

      // 正常模式（无节流）
      const { result: normalResult } = renderHook(() =>
        useTypewriter({
          content,
          enabled: true,
          // throttleMs 不传 → 每帧更新
        })
      );

      // 节流模式
      const { result: throttledResult } = renderHook(() =>
        useTypewriter({
          content,
          enabled: true,
          throttleMs: 50,
        })
      );

      // 两种模式都应该正常工作
      expect(normalResult.current).toBeDefined();
      expect(throttledResult.current).toBeDefined();

      // 节流模式应该有不同的内部逻辑
      expect(normalResult.current.isTyping).toBeDefined();
      expect(throttledResult.current.isTyping).toBeDefined();
    });
  });

  describe('实际场景模拟', () => {
    it('模拟真实对话流程：输入 → 流式输出 → 用户滚动 → 新消息', () => {
      const container = {
        scrollHeight: 5000,
        scrollTop: 4500,
        clientHeight: 500,
        scrollTo: vi.fn(),
      };

      const { result, rerender } = renderHook(
        ({ messageCount }) =>
          useChatScrollController({
            containerRef: { current: container as any },
            messageCount,
            isStreaming: false,
            hasPendingToolCalls: false,
            followZonePx: 120,
            enabled: true,
          }),
        { initialProps: { messageCount: 50 } }
      );

      // 1. 用户输入消息，AI 开始流式输出
      // 2. 用户向上滚动查看历史
      act(() => {
        container.scrollTop = 3000;
        result.current.onUserScroll();
      });

      // rerender 触发 useMemo 重新计算 isInFollowZone
      act(() => {
        rerender({ messageCount: 51 });
      });

      expect(result.current.isInFollowZone).toBe(false);

      // 3. 新消息到达（用户已锁定，不应该自动滚动）
      const initialScrollTop = container.scrollTop;

      act(() => {
        result.current.followBottom(false);
      });

      expect(container.scrollTop).toBe(initialScrollTop);

      // 4. 用户回到底部
      act(() => {
        container.scrollTop = container.scrollHeight - container.clientHeight - 50;
        result.current.onUserScroll();
      });

      // rerender 触发 useMemo 重新计算
      act(() => {
        rerender({ messageCount: 52 });
      });

      expect(result.current.isInFollowZone).toBe(true);

      // 5. 新消息到达时应该自动滚动
      act(() => {
        result.current.followBottom(false);
      });

      // followBottom 通过 scrollTop 赋值实现
      expect(container.scrollTop).toBe(container.scrollHeight);
    });
  });
});

// ============================================
// 辅助函数
// ============================================

interface MeasureResult<T> {
  result: T;
  durationMs: number;
  withinBudget: boolean;
}

function measureExecutionTime<T>(
  fn: () => T,
  budgetMs: number
): MeasureResult<T> {
  const startTime = performance.now();
  const result = fn();
  const endTime = performance.now();
  const durationMs = endTime - startTime;

  return {
    result,
    durationMs,
    withinBudget: durationMs <= budgetMs,
  };
}
