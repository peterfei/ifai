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
// 常量
// ============================================

/**
 * 滚动系统统一常量
 *
 * 集中管理所有滚动相关的常量，消除散落的魔法数字
 */
export const ScrollConstants = {
  /** 跟随底部区域阈值（像素） */
  FOLLOW_ZONE_PX: 120,
  /** 虚拟滚动启用阈值（消息数量） */
  VIRTUAL_SCROLL_THRESHOLD: 15,
  /** 用户滚动冷却时间（毫秒）- 用户手动滚动后多久不自动滚动 */
  USER_SCROLL_COOLDOWN_MS: 1000,
  /** 流式跟随节流（毫秒）- 流式输出时滚动触发的最小间隔 */
  STREAM_THROTTLE_MS: 100,
  /** 滚动验证重试延迟（毫秒）- 滚动后验证是否成功的延迟 */
  RETRY_DELAY_MS: 150,
  /** 判断用户发送消息的时间阈值（毫秒）- 消息间隔超过此值认为是用户主动发送 */
  MESSAGE_SENT_THRESHOLD_MS: 500,
} as const;

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
  /** 统一滚动到底部方法（替代 AIChat/VirtualMessageList 的重复实现） */
  scrollToBottom: (options?: { skipRAF?: boolean }) => void;
  /** 统一消息变化处理入口（替代 AIChat 的两个独立 useEffect） */
  onMessagesChanged: (currentCount: number, lastMessageId: string, isStreaming: boolean) => void;
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
 * 4. 流式更新 → 跟随底部（只要用户未主动向上滚动）
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
    when: (ctx) => !ctx.isUserScrolling,
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
 *
 * 导出供其他组件使用，避免 inline 重复计算
 */
export function calculateDistanceToBottom(container: HTMLElement): number {
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

  // 消息变化追踪 refs（用于 onMessagesChanged）
  const prevMessageCountRef = useRef(0);
  const lastMessageIdRef = useRef<string | undefined>(undefined);
  const lastAddedTimeRef = useRef<number>(Date.now());
  const lastProcessTimeRef = useRef(0);

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

    // 🔥 使用双重 RAF 确保完全渲染后再滚动
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!containerRef.current) return;

        // 直接设置 scrollTop，强制滚动到底部
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
        lastScrollTimeRef.current = Date.now();

        // 🔥 验证滚动是否成功
        setTimeout(() => {
          if (!containerRef.current) return;
          const distance = calculateDistanceToBottom(containerRef.current);

          if (distance > 10) {
            console.log('[useChatScrollController] ⚠️ Force scroll retry, distance:', distance);

            // 尝试更激进的滚动值
            containerRef.current.scrollTop = containerRef.current.scrollHeight + 100;
            lastScrollTimeRef.current = Date.now();

            // 再次验证
            setTimeout(() => {
              if (!containerRef.current) return;
              const finalDistance = calculateDistanceToBottom(containerRef.current);
              if (finalDistance > 20) {
                console.warn('[useChatScrollController] ⚠️ Force scroll still not at bottom, final distance:', finalDistance);
                containerRef.current.scrollTop = containerRef.current.scrollHeight * 2;
              }
            }, ScrollConstants.RETRY_DELAY_MS / 2);
          }
        }, ScrollConstants.RETRY_DELAY_MS);
      });
    });

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

  // 统一滚动到底部方法（替代 AIChat/VirtualMessageList 的三重 RAF 实现）
  const scrollToBottom = useCallback((options?: { skipRAF?: boolean }) => {
    const container = containerRef.current;
    if (!container) return;

    // 重置用户滚动状态
    isUserScrollingRef.current = false;

    const performScroll = () => {
      // 🔥 修复：考虑容器的 padding，确保真正滚动到底部
      // container.scrollHeight 包含 padding，但我们需要滚动到内容的真实底部
      // 对于虚拟滚动，需要确保滚动到最后一条消息可见

      // 先尝试标准滚动
      container.scrollTop = container.scrollHeight;
      lastScrollTimeRef.current = Date.now();

      // 🔥 验证滚动是否成功，添加重试机制
      // 某些情况下（虚拟滚动、动态内容等）需要多次尝试才能到达真正的底部
      setTimeout(() => {
        if (!containerRef.current) return;

        const distance = calculateDistanceToBottom(containerRef.current);

        // 🔥 如果距离底部仍然较远，可能是因为虚拟滚动的高度计算问题
        // 尝试使用更激进的滚动值
        if (distance > 10) {
          console.log('[useChatScrollController] ⚠️ Scroll retry, distance:', distance);

          // 尝试滚动到 scrollHeight + padding 的位置
          // 这应该确保即使有虚拟滚动或 padding 也能到达底部
          containerRef.current.scrollTop = containerRef.current.scrollHeight + 100;
          lastScrollTimeRef.current = Date.now();

          // 再次验证
          setTimeout(() => {
            if (!containerRef.current) return;
            const finalDistance = calculateDistanceToBottom(containerRef.current);
            if (finalDistance > 20) {
              console.warn('[useChatScrollController] ⚠️ Scroll still not at bottom, final distance:', finalDistance);
              // 最后尝试：设置一个很大的值
              containerRef.current.scrollTop = containerRef.current.scrollHeight * 2;
            }
          }, ScrollConstants.RETRY_DELAY_MS / 2);
        }
      }, ScrollConstants.RETRY_DELAY_MS);
    };

    if (options?.skipRAF) {
      // 立即执行（用于 followBottom 等已在正确时机的调用）
      performScroll();
      return;
    }

    // 双重 RAF 确保完全渲染后再滚动
    // RAF1: 浏览器准备重绘
    // RAF2: 浏览器已重绘，DOM 完全更新
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        performScroll();
      });
    });
  }, [containerRef]);

  // 统一消息变化处理入口（替代 AIChat 的两个独立 useEffect）
  // 🔥 使用 useRef 存储 followBottom 和 forceScrollToBottom 的最新引用，避免 useCallback 依赖循环
  const followBottomRef = useRef(followBottom);
  const forceScrollToBottomRef = useRef(forceScrollToBottom);

  const onMessagesChanged = useCallback((
    currentCount: number,
    lastMessageId: string,
    isStreaming: boolean,
  ) => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const now = Date.now();

    // 流式期间节流：避免每个 delta 都触发规则引擎
    if (isStreaming && now - lastProcessTimeRef.current < ScrollConstants.STREAM_THROTTLE_MS) {
      return;
    }
    lastProcessTimeRef.current = now;

    const isNewMessage = currentCount > prevMessageCountRef.current
      && lastMessageId !== lastMessageIdRef.current;
    const timeSinceLastAdded = now - lastAddedTimeRef.current;
    const isUserSentMessage = timeSinceLastAdded > ScrollConstants.MESSAGE_SENT_THRESHOLD_MS
      || currentCount === 1;

    // 🔥 FIX v3.0.0: 修复滚动逻辑
    // 当用户发送消息后（通过时间阈值判断），应该强制滚动到底部
    // 无论当前是否流式输出，都应该解锁并滚动到底部
    if (isUserSentMessage) {
      // 用户发送消息 → 强制滚动到底部（绕过规则）
      console.log('[useChatScrollController] 🚀 onMessagesChanged: User sent message detected, forcing scroll to bottom');
      forceScrollToBottomRef.current();
    } else if (isStreaming) {
      // 流式更新 → 通过规则引擎跟随底部
      followBottomRef.current(true);
    } else if (isNewMessage) {
      // 批量消息追加 → 通过规则引擎跟随底部
      followBottomRef.current(false);
    }

    // 更新追踪 refs
    prevMessageCountRef.current = currentCount;
    lastMessageIdRef.current = lastMessageId;
    lastAddedTimeRef.current = now;
  }, [enabled, containerRef]); // 移除 followBottom 和 forceScrollToBottom 依赖

  // 保持 ref 同步（在 onMessagesChanged 之后更新，避免闭包陷阱）
  useEffect(() => {
    followBottomRef.current = followBottom;
    forceScrollToBottomRef.current = forceScrollToBottom;
  }, [followBottom, forceScrollToBottom]);

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
    scrollToBottom,
    onMessagesChanged,
    isAutoScrollLocked: isUserScrollingRef.current,
    isInFollowZone: isInFollowZoneCurrent,
  };
}

// ============================================
// 导出规则表用于测试
// ============================================

export { DEFAULT_SCROLL_RULES };
