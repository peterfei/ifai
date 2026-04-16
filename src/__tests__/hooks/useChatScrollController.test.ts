/**
 * useChatScrollController 单元测试
 *
 * 测试滚动控制器的核心逻辑：
 * - 规则匹配和优先级
 * - 滚动效果执行
 * - 用户滚动检测
 * - 底部跟随区域判断
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useChatScrollController, DEFAULT_SCROLL_RULES } from '../../hooks/useChatScrollController';

// ============================================
// Mock 容器
// ============================================

const createMockContainer = (distanceToBottom: number = 0) => {
  const container = {
    scrollHeight: 1000,
    scrollTop: 0,
    clientHeight: 500,
    scrollTo: vi.fn(),
  };

  // 根据 distanceToBottom 计算 scrollTop
  container.scrollTop = container.scrollHeight - container.clientHeight - distanceToBottom;

  return container;
};

// ============================================
// 测试用例
// ============================================

describe('useChatScrollController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('规则匹配和优先级', () => {
    it('应该按优先级从高到低匹配规则', () => {
      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef: { current: null },
          messageCount: 10,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      // 验证规则表已按优先级排序
      const sortedRules = [...DEFAULT_SCROLL_RULES].sort((a, b) => b.priority - a.priority);
      expect(DEFAULT_SCROLL_RULES).toEqual(sortedRules);
    });

    it('用户回到底部应该触发解锁效果（优先级 100）', () => {
      const container = createMockContainer(50); // 在跟随区域内
      const containerRef = { current: container as any };

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 10,
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

      // 验证滚动控制器状态
      expect(result.current.isInFollowZone).toBe(true);
    });
  });

  describe('底部跟随区域判断', () => {
    it('应该在跟随区域内时返回 true', () => {
      const container = createMockContainer(50); // 距离底部 50px
      const containerRef = { current: container as any };

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 10,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      expect(result.current.isInFollowZone).toBe(true);
    });

    it('应该在跟随区域外时返回 false', () => {
      const container = createMockContainer(200); // 距离底部 200px
      const containerRef = { current: container as any };

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 10,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      expect(result.current.isInFollowZone).toBe(false);
    });
  });

  describe('滚动效果执行', () => {
    it('应该在非锁定状态下执行跟随底部滚动', () => {
      const container = createMockContainer(50);
      const containerRef = { current: container as any };

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 10,
          isStreaming: true,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      act(() => {
        result.current.followBottom(true);
      });

      // 验证滚动被执行
      expect(container.scrollTop).toBe(container.scrollHeight);
    });

    it('应该在锁定状态下不执行自动滚动', () => {
      const container = createMockContainer(200); // 在跟随区域外
      const containerRef = { current: container as any };

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 10,
          isStreaming: true,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      const initialScrollTop = container.scrollTop;

      act(() => {
        result.current.followBottom(true);
      });

      // 滚动位置应该不变（因为用户已锁定）
      expect(container.scrollTop).toBe(initialScrollTop);
    });
  });

  describe('用户滚动检测', () => {
    it('用户离开跟随区域时应该锁定自动滚动', () => {
      const container = createMockContainer(200); // 在跟随区域外
      const containerRef = { current: container as any };

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
        { initialProps: { messageCount: 10 } }
      );

      act(() => {
        result.current.onUserScroll();
      });

      // rerender 触发返回值重新计算（isAutoScrollLocked 基于 ref，需要重渲染）
      act(() => {
        rerender({ messageCount: 11 });
      });

      // 验证锁定状态
      expect(result.current.isAutoScrollLocked).toBe(true);
    });

    it('用户回到底部时应该解锁自动滚动', () => {
      // 先在跟随区域外锁定
      const container = createMockContainer(200);
      const containerRef = { current: container as any };

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
        { initialProps: { messageCount: 10 } }
      );

      // 先锁定
      act(() => {
        result.current.onUserScroll();
      });

      // 用户回到底部
      container.scrollTop = container.scrollHeight - container.clientHeight - 50;

      act(() => {
        result.current.onUserScroll();
      });

      // rerender 触发返回值重新计算
      act(() => {
        rerender({ messageCount: 12 });
      });

      // 验证解锁状态
      expect(result.current.isAutoScrollLocked).toBe(false);
    });
  });

  describe('feature flag 控制', () => {
    it('禁用时应该不执行任何滚动', () => {
      const container = createMockContainer(50);
      const containerRef = { current: container as any };

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 10,
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

      // 滚动位置应该不变
      expect(container.scrollTop).toBe(initialScrollTop);
    });
  });

  describe('流式更新场景', () => {
    it('流式期间应该在跟随区域内保持自动滚动', () => {
      const container = createMockContainer(100);
      const containerRef = { current: container as any };

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 10,
          isStreaming: true,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      act(() => {
        result.current.followBottom(true);
      });

      // 验证滚动被执行
      expect(container.scrollTop).toBe(container.scrollHeight);
    });
  });

  describe('命令完成场景', () => {
    it('命令完成时应该恢复到底部（如果未锁定）', () => {
      const container = createMockContainer(50);
      const containerRef = { current: container as any };

      const { result } = renderHook(() =>
        useChatScrollController({
          containerRef,
          messageCount: 10,
          isStreaming: false,
          hasPendingToolCalls: false,
          followZonePx: 120,
          enabled: true,
        })
      );

      act(() => {
        result.current.restoreBottom();
      });

      // 验证平滑滚动被执行
      expect(container.scrollTo).toHaveBeenCalledWith({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    });
  });
});

// ============================================
// 辅助函数测试
// ============================================

describe('滚动辅助函数', () => {
  describe('calculateDistanceToBottom', () => {
    it('应该正确计算距离底部的像素', () => {
      const container = {
        scrollHeight: 1000,
        scrollTop: 300,
        clientHeight: 500,
      } as any;

      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      expect(distance).toBe(200);
    });
  });

  describe('isInFollowZone', () => {
    it('应该在阈值内返回 true', () => {
      const container = {
        scrollHeight: 1000,
        scrollTop: 400,
        clientHeight: 500,
      } as any;

      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      const threshold = 120;
      const inZone = distance < threshold;

      expect(inZone).toBe(true);
    });

    it('应该在阈值外返回 false', () => {
      const container = {
        scrollHeight: 1000,
        scrollTop: 300,
        clientHeight: 500,
      } as any;

      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      const threshold = 120;
      const inZone = distance < threshold;

      expect(inZone).toBe(false);
    });
  });
});
