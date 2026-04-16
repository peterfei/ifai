/**
 * useChatScrollController - 统一聊天滚动控制器
 *
 * 基于规则表的滚动行为管理，解决以下问题：
 * - 滚动逻辑分散在多个组件中导致的行为不一致
 * - 流式更新期间的滚动冲突
 * - 用户手动浏览时的自动滚动干扰
 *
 * @version 1.0.0
 */

import { useRef, useCallback, useEffect, useMemo } from 'react';
import { featureFlags } from '../config/features';

// ============================================
// 类型定义
// ============================================

/**
 * 滚动触发器类型
 */
export type ScrollTrigger =
  | 'message-appended'      // 新消息追加
  | 'stream-updated'        // 流式内容更新
  | 'command-completed'     // 命令完成（如 /explore）
  | 'message-sent'          // 用户发送消息
  | 'user-scrolled'         // 用户手动滚动
  | 'user-returned-bottom'; // 用户回到底部

/**
 * 滚动效果类型
 */
export type ScrollEffect =
  | 'follow-bottom'    // 跟随底部（平滑滚动）
  | 'lock'            // 锁定自动滚动
  | 'unlock'          // 解锁自动滚动
  | 'restore-bottom'; // 恢复到底部

/**
 * 滚动规则接口
 */
export interface ScrollRule {
  /** 触发器 */
  trigger: ScrollTrigger;
  /** 优先级（数字越大优先级越高） */
  priority: number;
  /** 条件判断函数 */
  when: (ctx: ScrollContext) => boolean;
  /** 滚动效果 */
  effect: ScrollEffect;
}

/**
 * 滚动上下文
 */
export interface ScrollContext {
  /** 容器引用 */
  containerRef: React.RefObject<HTMLDivElement>;
  /** 消息数量 */
  messageCount: number;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 是否有待处理的工具调用 */
  hasPendingToolCalls: boolean;
  /** 距离底部的像素距离 */
  distanceToBottom: number;
  /** 用户是否正在手动滚动 */
  isUserScrolling: boolean;
  /** 是否在跟随底部区域 */
  isInFollowZone: boolean;
}

/**
 * 滚动控制器配置
 */
export interface UseChatScrollControllerOptions {
  /** 滚动容器引用 */
  containerRef: React.RefObject<HTMLDivElement>;
  /** 消息数量 */
  messageCount: number;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 是否有待处理的工具调用 */
  hasPendingToolCalls?: boolean;
  /** 跟随底部区域的阈值（像素），默认 120px */
  followZonePx?: number;
  /** 是否启用新滚动策略（feature flag），默认 true */
  enabled?: boolean;
}

/**
 * 滚动控制器返回值
 */
export interface UseChatScrollControllerReturn {
  /** 跟随到底部 */
  followBottom: (instant?: boolean) => void;
  /** 恢复到底部（用于命令完成后） */
  restoreBottom: () => void;
  /** 发送消息后恢复底部 */
  messageSent: () => void;
  /** 强制滚动到底部（绕过所有规则） */
  forceScrollToBottom?: () => void;
  /** 处理用户滚动事件 */
  onUserScroll: () => void;
  /** 是否自动滚动已锁定 */
  isAutoScrollLocked: boolean;
  /** 是否在跟随底部区域 */
  isInFollowZone: boolean;
}

// ============================================
// 默认规则表
// ============================================

/**
 * 默认滚动规则表
 *
 * 规则按优先级从高到低执行：
 * 1. 用户回到底部 → 立即解锁
 * 2. 用户滚动离开跟随区域 → 锁定自动滚动
 * 3. 命令完成 → 恢复到底部（如果未锁定）
 * 4. 流式更新 → 跟随底部（如果未锁定且在跟随区域）
 * 5. 新消息追加 → 跟随底部（如果未锁定且在跟随区域）
 */
const DEFAULT_SCROLL_RULES: ScrollRule[] = [
  {
    trigger: 'user-returned-bottom',
    priority: 100,
    when: (ctx) => ctx.isInFollowZone && ctx.isUserScrolling,
    effect: 'unlock',
  },
  {
    trigger: 'user-scrolled',
    priority: 90,
    when: (ctx) => !ctx.isInFollowZone,
    effect: 'lock',
  },
  {
    trigger: 'command-completed',
    priority: 70,
    when: (ctx) => !ctx.isUserScrolling,
    effect: 'restore-bottom',
  },
  {
    trigger: 'message-sent',
    priority: 65,
    when: () => true,
    effect: 'restore-bottom',
  },
  {
    trigger: 'stream-updated',
    priority: 50,
    when: (ctx) => !ctx.isUserScrolling && ctx.isInFollowZone,
    effect: 'follow-bottom',
  },
  {
    trigger: 'message-appended',
    priority: 40,
    when: (ctx) => !ctx.isUserScrolling && ctx.isInFollowZone,
    effect: 'follow-bottom',
  },
];

// ============================================
// 工具函数
// ============================================

/**
 * 计算距离底部的像素距离
 */
function calculateDistanceToBottom(container: HTMLElement): number {
  return container.scrollHeight - container.scrollTop - container.clientHeight;
}

/**
 * 判断是否在跟随底部区域
 */
function isInFollowZone(container: HTMLElement, threshold: number): boolean {
  return calculateDistanceToBottom(container) < threshold;
}

// ============================================
// 主 Hook
// ============================================

/**
 * 统一聊天滚动控制器 Hook
 */
export function useChatScrollController(
  options: UseChatScrollControllerOptions
): UseChatScrollControllerReturn {
  const {
    containerRef,
    messageCount,
    isStreaming,
    hasPendingToolCalls = false,
    followZonePx = 120,
    enabled = featureFlags.newScrollController, // 🔥 FIX v1.0.0: 从 feature flags 读取默认值
  } = options;

  // 状态 refs
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollTimeRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const pendingRestoreRef = useRef(false);

  // 计算当前滚动上下文
  const getCurrentContext = useCallback((): ScrollContext | null => {
    const container = containerRef.current;
    if (!container) return null;

    const distanceToBottom = calculateDistanceToBottom(container);
    const isInFollowZone = distanceToBottom < followZonePx;

    return {
      containerRef,
      messageCount,
      isStreaming: isStreaming || hasPendingToolCalls,
      hasPendingToolCalls,
      distanceToBottom,
      isUserScrolling: isUserScrollingRef.current,
      isInFollowZone,
    };
  }, [containerRef, messageCount, isStreaming, hasPendingToolCalls, followZonePx]);

  // 应用滚动规则
  const applyRules = useCallback(
    (trigger: ScrollTrigger): ScrollEffect | null => {
      if (!enabled) return null;

      const ctx = getCurrentContext();
      if (!ctx) return null;

      // 按优先级从高到低检查规则
      const sortedRules = [...DEFAULT_SCROLL_RULES].sort((a, b) => b.priority - a.priority);

      for (const rule of sortedRules) {
        if (rule.trigger === trigger && rule.when(ctx)) {
          console.log(`[useChatScrollController] Rule matched: ${rule.trigger} -> ${rule.effect}`);
          return rule.effect;
        }
      }

      return null;
    },
    [enabled, getCurrentContext]
  );

  // 执行滚动效果
  const executeEffect = useCallback(
    (effect: ScrollEffect, instant = false) => {
      const container = containerRef.current;
      if (!container) return;

      switch (effect) {
        case 'follow-bottom':
          // 使用 RAF 节流
          const now = Date.now();
          if (now - lastScrollTimeRef.current < 100) {
            // 100ms 节流
            if (rafIdRef.current) {
              cancelAnimationFrame(rafIdRef.current);
            }
            rafIdRef.current = requestAnimationFrame(() => {
              container.scrollTop = container.scrollHeight;
              lastScrollTimeRef.current = Date.now();
            });
          } else {
            container.scrollTop = container.scrollHeight;
            lastScrollTimeRef.current = now;
          }
          break;

        case 'restore-bottom':
          // 恢复到底部
          // 🔥 FIX: 使用直接赋值而非 scrollTo，确保虚拟滚动中也能正确工作
          isUserScrollingRef.current = false;
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
            scrollTimeoutRef.current = null;
          }
          // 直接设置 scrollTop 到 scrollHeight，兼容虚拟滚动
          container.scrollTop = container.scrollHeight;
          break;

        case 'lock':
          isUserScrollingRef.current = true;
          // 清除之前的超时
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
          break;

        case 'unlock':
          isUserScrollingRef.current = false;
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
            scrollTimeoutRef.current = null;
          }
          break;
      }
    },
    [containerRef]
  );

  type RuleTrigger = ScrollTrigger;

  // 跟随到底部
  const followBottom = useCallback(
    (instant = false) => {
      if (!enabled) return;

      const effect = applyRules(isStreaming ? 'stream-updated' : 'message-appended');
      if (effect === 'follow-bottom') {
        executeEffect(effect, instant);
      }
    },
    [enabled, isStreaming, applyRules, executeEffect]
  );

  // 恢复到底部
  const restoreBottom = useCallback(() => {
    if (!enabled) return;

    const effect = applyRules('command-completed');
    if (effect === 'restore-bottom') {
      executeEffect(effect);
    }
  }, [enabled, applyRules, executeEffect]);

  const messageSent = useCallback(() => {
    if (!enabled) return;

    const effect = applyRules('message-sent');
    if (effect === 'restore-bottom') {
      executeEffect(effect);
    }
  }, [enabled, applyRules, executeEffect]);

  // 🔥 FIX v2.0.0: 强制滚动到底部，绕过所有规则
  // 用于用户发送消息时，确保一定能滚动到底部看到新消息
  const forceScrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      console.warn('[useChatScrollController] forceScrollToBottom: container is null');
      return;
    }

    console.log('[useChatScrollController] 🚀 forceScrollToBottom called');

    // 强制解锁滚动状态
    isUserScrollingRef.current = false;

    // 清除所有超时
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }

    // 直接设置 scrollTop，强制滚动到底部
    container.scrollTop = container.scrollHeight;

    console.log('[useChatScrollController] 🚀 forceScrollToBottom completed');
  }, [containerRef]);

  // 处理用户滚动
  const onUserScroll = useCallback(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const inFollowZone = isInFollowZone(container, followZonePx);

    // 检查是否需要锁定或解锁
    if (!inFollowZone && !isUserScrollingRef.current) {
      // 用户离开跟随区域，锁定自动滚动
      const effect = applyRules('user-scrolled');
      if (effect === 'lock') {
        executeEffect(effect);
      }
    } else if (inFollowZone && isUserScrollingRef.current) {
      // 用户回到底部，解锁自动滚动
      const effect = applyRules('user-returned-bottom');
      if (effect === 'unlock') {
        executeEffect(effect);
      }
    }
  }, [enabled, followZonePx, applyRules, executeEffect]);

  // 清理 RAF
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // 计算当前是否在跟随区域
  const isInFollowZoneCurrent = useMemo(() => {
    const container = containerRef.current;
    if (!container) return false;
    return isInFollowZone(container, followZonePx);
  }, [containerRef, followZonePx, messageCount]); // 依赖 messageCount 以在消息变化时重新计算

  return {
    followBottom,
    restoreBottom,
    messageSent,
    forceScrollToBottom,
    onUserScroll,
    isAutoScrollLocked: isUserScrollingRef.current,
    isInFollowZone: isInFollowZoneCurrent,
  };
}

// ============================================
// 导出规则表用于测试
// ============================================

export { DEFAULT_SCROLL_RULES };
