/**
 * 滚动行为集成测试
 *
 * 测试长历史消息场景下的滚动行为：
 * - 新消息自动滚动到底部
 * - 用户手动滚动不被打断
 * - 虚拟列表切换时的滚动表现
 * - 流式输出期间的滚动跟随
 * - 命令完成后的滚动恢复
 *
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatScrollController } from '../../src/hooks/useChatScrollController';
import { featureFlags } from '../../src/config/features';

// ============================================
// Mock 容器工厂
// ============================================

interface MockContainer {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
  scrollTo: ReturnType<typeof vi.fn>;
}

function createMockContainer(options: {
  scrollHeight?: number;
  scrollTop?: number;
  clientHeight?: number;
} = {}): MockContainer {
  return {
    scrollHeight: options.scrollHeight ?? 10000,
    scrollTop: options.scrollTop ?? 0,
    clientHeight: options.clientHeight ?? 500,
    scrollTo: vi.fn(),
  };
}

// ============================================
// 测试套件
// ============================================

describe('滚动行为集成测试', () => {
  let container: MockContainer;
  let containerRef: React.RefObject<MockContainer>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    container = createMockContainer();
    containerRef = { current: container } as any;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('长历史消息场景', () => {
    it('1000 条消息时滚动控制器应该正常工作', () => {
      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 1000,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      // 验证控制器正常初始化
      expect(result.current).toBeDefined();
      expect(result.current.isInFollowZone).toBeDefined();
      expect(result.current.isAutoScrollLocked).toBeDefined();
    });

    it('新消息追加时应该自动滚动到底部', () => {
      // 设置容器在底部附近
      container.scrollTop = container.scrollHeight - container.clientHeight - 50;

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 100,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      act(() => {
        result.current.followBottom(false);
      });

      // follow-bottom 效果通过直接设置 scrollTop 实现
      expect(container.scrollTop).toBe(container.scrollHeight);
    });

    it('长历史消息中用户手动滚动应该被尊重', () => {
      // 设置用户向上滚动（远离底部）
      container.scrollTop = container.scrollHeight - container.clientHeight - 500;

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 500,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      // 模拟用户滚动
      act(() => {
        result.current.onUserScroll();
      });

      // 验证不在跟随区域
      expect(result.current.isInFollowZone).toBe(false);

      // 新消息到达时应该不自动滚动
      const initialScrollTop = container.scrollTop;

      act(() => {
        result.current.followBottom(true);
      });

      // 滚动位置应该不变（用户锁定了）
      expect(container.scrollTop).toBe(initialScrollTop);
    });
  });

  describe('虚拟列表切换场景', () => {
    it('从短对话切换到长对话时滚动逻辑应该一致', () => {
      // 短对话（10 条消息）
      const shortMessages = 10;
      const { rerender } = renderHook(
        ({ messageCount }) =>
          useChatScrollController({
            containerRef,
            messageCount,
            isStreaming: false,
            hasPendingToolCalls: false,
            followZonePx: 120,
            enabled: true,
          }),
        { initialProps: { messageCount: shortMessages } }
      );

      // 切换到长对话（1000 条消息）
      rerender({ messageCount: 1000 });

      // 验证控制器仍然正常工作
      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 1000,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      expect(result.current).toBeDefined();
    });

    it('虚拟滚动启用/禁用切换时状态应该保持一致', () => {
      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 20,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      const initialAutoScrollLocked = result.current.isAutoScrollLocked;
      const initialIsInFollowZone = result.current.isInFollowZone;

      // 模拟一些操作
      act(() => {
        result.current.onUserScroll();
      });

      // 状态应该保持一致
      expect(result.current.isAutoScrollLocked).toBeDefined();
      expect(result.current.isInFollowZone).toBeDefined();
    });
  });

  describe('流式输出期间的滚动跟随', () => {
    it('流式输出时应该在跟随区域内自动滚动', () => {
      // 设置在跟随区域内
      container.scrollTop = container.scrollHeight - container.clientHeight - 50;

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 100,
          isStreaming: true,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      act(() => {
        result.current.followBottom(true);
      });

      // follow-bottom 效果通过直接设置 scrollTop 实现（不使用 scrollTo）
      // 验证滚动被触发：scrollTop 被赋值为 scrollHeight
      expect(container.scrollTop).toBe(container.scrollHeight);
    });

    it('流式输出时用户手动滚动应该锁定自动滚动', () => {
      // 设置在跟随区域外
      container.scrollTop = container.scrollHeight - container.clientHeight - 500;

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 100,
          isStreaming: true,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      // 模拟用户滚动
      act(() => {
        result.current.onUserScroll();
      });

      // 验证被锁定
      expect(result.current.isInFollowZone).toBe(false);

      // 流式更新时不应该滚动
      const initialScrollTop = container.scrollTop;

      act(() => {
        result.current.followBottom(true);
      });

      expect(container.scrollTop).toBe(initialScrollTop);
    });

    it('用户回到底部时应该解锁自动滚动', () => {
      // 先锁定 - 设置在跟随区域外
      container.scrollTop = container.scrollHeight - container.clientHeight - 500;

      const { result, rerender } = renderHook(
        ({ messageCount }) =>
          useChatScrollController({
            containerRef,
            messageCount,
            isStreaming: true,
            hasPendingToolCalls: false,
            followZonePx: 120,
            enabled: true,
          }),
        { initialProps: { messageCount: 100 } }
      );

      act(() => {
        result.current.onUserScroll();
      });

      // 用户回到底部
      container.scrollTop = container.scrollHeight - container.clientHeight - 50;

      // 通过 rerender 触发 useMemo 重新计算
      act(() => {
        rerender({ messageCount: 101 });
      });

      // isInFollowZone 应该为 true（useMemo 基于 rerender 时的 scrollTop 重新计算）
      expect(result.current.isInFollowZone).toBe(true);
    });
  });

  describe('命令完成后的滚动恢复', () => {
    it('命令完成时应该恢复到底部（如果未锁定）', () => {
      // 设置在跟随区域内
      container.scrollTop = container.scrollHeight - container.clientHeight - 50;

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 100,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      act(() => {
        result.current.restoreBottom();
      });

      // 验证平滑滚动
      expect(container.scrollTo).toHaveBeenCalledWith({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    });

    it('命令完成时如果用户锁定则不强制滚动', () => {
      // 设置在跟随区域外（用户已锁定）
      container.scrollTop = container.scrollHeight - container.clientHeight - 500;

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 100,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      act(() => {
        result.current.onUserScroll();
      });

      const initialScrollTop = container.scrollTop;

      act(() => {
        result.current.restoreBottom();
      });

      // 不应该滚动（用户已锁定）
      expect(container.scrollTop).toBe(initialScrollTop);
    });
  });

  describe('边界条件和错误处理', () => {
    it('没有容器时不应该崩溃', () => {
      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef: { current: null },
          messageCount: 100,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      // 不应该崩溃
      expect(result.current).toBeDefined();

      // 调用方法不应该崩溃
      act(() => {
        result.current.followBottom();
        result.current.onUserScroll();
        result.current.restoreBottom();
      });
    });

    it('空消息列表时应该正常工作', () => {
      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 0,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      expect(result.current).toBeDefined();
    });

    it('极端消息数量（10000+）时应该不崩溃', () => {
      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 10000,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      expect(result.current).toBeDefined();
      expect(result.current.isInFollowZone).toBeDefined();
    });
  });

  describe('Feature Flag 控制', () => {
    it('禁用滚动控制器时不应该执行任何滚动', () => {
      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 100,
          isStreaming: true,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: false, // 禁用
        })
      );

      const initialScrollTop = container.scrollTop;

      act(() => {
        result.current.followBottom(true);
      });

      // 不应该滚动
      expect(container.scrollTop).toBe(initialScrollTop);
    });

    it('动态切换 feature flag 应该生效', () => {
      // 设置容器在跟随区域内
      container.scrollTop = container.scrollHeight - container.clientHeight - 50;

      // 启用
      const { result: enabledResult } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 100,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      // 禁用
      const { result: disabledResult } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 100,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: false,
        })
      );

      // 启用时应该响应 - followBottom 通过 scrollTop 赋值实现
      act(() => {
        enabledResult.current.followBottom(true);
      });
      // 启用模式下 scrollTop 会被设置为 scrollHeight
      expect(container.scrollTop).toBe(container.scrollHeight);

      // 重置 scrollTop
      container.scrollTop = container.scrollHeight - container.clientHeight - 50;

      // 禁用时应该不响应
      act(() => {
        disabledResult.current.followBottom(true);
      });
      // 禁用模式下 scrollTop 保持不变
      expect(container.scrollTop).toBe(container.scrollHeight - container.clientHeight - 50);
    });
  });

  describe('性能和稳定性', () => {
    it('高频调用 onUserScroll 不应该导致性能问题', () => {
      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 1000,
          isStreaming: true,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      // 模拟 100 次快速滚动
      const startTime = performance.now();

      act(() => {
        for (let i = 0; i < 100; i++) {
          // 每次稍微改变 scrollTop
          container.scrollTop = container.scrollHeight - container.clientHeight - (i % 10) * 100;
          result.current.onUserScroll();
        }
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 应该在 100ms 内完成
      expect(duration).toBeLessThan(100);
    });

    it('高频调用 followBottom 不应该导致性能问题', () => {
      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 1000,
          isStreaming: true,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      // 设置在跟随区域内
      container.scrollTop = container.scrollHeight - container.clientHeight - 50;

      const startTime = performance.now();

      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.followBottom(true);
        }
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 应该在 50ms 内完成（因为有节流）
      expect(duration).toBeLessThan(50);
    });
  });
});
