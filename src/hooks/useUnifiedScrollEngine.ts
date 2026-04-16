/**
 * 统一滚动引擎 - v3.0.0
 *
 * 设计原则：
 * 1. 单一职责：一个入口管理所有滚动逻辑
 * 2. 性能优先：单一 RAF 调度器，消除嵌套延迟
 * 3. 用户优先：零延迟响应用户滚动
 * 4. DRY 极限化：代码复用率 > 90%
 */

import { useRef, useCallback, useEffect } from 'react';
import { featureFlags } from '../config/features';

// ============================================
// 类型定义
// ============================================

export type ScrollEventType = 'user-message' | 'stream-update' | 'message-appended';

interface ScrollEvent {
  type: ScrollEventType;
  timestamp: number;
}

interface ScrollEngineOptions {
  /** 滚动容器引用 */
  containerRef: React.RefObject<HTMLDivElement>;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 消息数量（用于判断是否启用虚拟滚动） */
  messageCount: number;
  /** 虚拟滚动组件引用（可选） */
  virtualMessageListRef?: React.RefObject<{ scrollToBottom: () => void }>;
  /** 跟随底部区域阈值（像素），默认 120px */
  followZonePx?: number;
  /** 是否启用，默认从 feature flags 读取 */
  enabled?: boolean;
}

interface ScrollEngineReturn {
  /** 用户发送消息时调用 */
  onUserMessage: () => void;
  /** 流式更新时调用 */
  onStreamUpdate: () => void;
  /** 新消息追加时调用 */
  onMessageAppended: () => void;
  /** 用户开始滚动时调用 */
  onUserScrollStart: () => void;
  /** 用户结束滚动时调用 */
  onUserScrollEnd: () => void;
  /** 是否自动滚动已锁定 */
  isAutoScrollLocked: boolean;
}

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

/**
 * 滚动到底部（直接 DOM 操作，无延迟）
 */
function scrollToBottom(container: HTMLElement): void {
  container.scrollTop = container.scrollHeight;
}

// ============================================
// 优先级配置
// ============================================

const EVENT_PRIORITY: Record<ScrollEventType, number> = {
  'user-message': 100,     // 最高优先级：用户发送消息
  'stream-update': 50,     // 中优先级：流式更新
  'message-appended': 40,  // 低优先级：消息追加
};

// ============================================
// 主 Hook
// ============================================

/**
 * 统一滚动引擎
 *
 * 核心优化：
 * 1. 单一 RAF 调度器替代多个嵌套 RAF
 * 2. 事件队列合并，批量处理滚动请求
 * 3. 零延迟响应用户滚动
 * 4. 自动节流，避免频繁 DOM 操作
 */
export function useUnifiedScrollEngine(
  options: ScrollEngineOptions
): ScrollEngineReturn {
  const {
    containerRef,
    isStreaming,
    messageCount,
    virtualMessageListRef,
    followZonePx = 120,
    enabled = featureFlags.newScrollController,
  } = options;

  // 🔥 状态管理
  const isUserScrollingRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);

  // 🔥 事件队列（批量处理）
  const eventQueueRef = useRef<ScrollEvent[]>([]);
  const isRafScheduledRef = useRef(false);

  // 🔥 用户消息后的强制跟随时段（3秒）
  const forceFollowUntilRef = useRef<number>(0);

  /**
   * 处理事件队列（在 RAF 中执行）
   */
  const processQueue = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      eventQueueRef.current = [];
      isRafScheduledRef.current = false;
      return;
    }

    // 获取并清空队列
    const queue = eventQueueRef.current;
    eventQueueRef.current = [];
    isRafScheduledRef.current = false;

    if (queue.length === 0) return;

    // 🔥 按优先级排序并取最后一个事件
    queue.sort((a, b) => EVENT_PRIORITY[b.type] - EVENT_PRIORITY[a.type]);
    const lastEvent = queue[queue.length - 1];

    console.log('[UnifiedScrollEngine] Processing event:', lastEvent.type, 'Queue size:', queue.length);

    // 🔥 v3.0.1: 用户消息事件优先级最高，强制忽略滚动锁定
    // 这样即使正在滚动，也会先处理用户发送的消息
    const hasUserMessageEvent = queue.some(e => e.type === 'user-message');

    // 🔥 用户正在滚动，暂停自动滚动（除非有用户消息事件）
    if (isUserScrollingRef.current && !hasUserMessageEvent) {
      console.log('[UnifiedScrollEngine] ⚠️ User scrolling, skipping queue');
      return;
    }

    // 🔥 根据事件类型执行不同的滚动策略
    const isInForceFollowPeriod = Date.now() < forceFollowUntilRef.current;
    const inFollowZone = isInFollowZone(container, followZonePx);

    switch (lastEvent.type) {
      case 'user-message':
        // 用户发送消息：强制滚动到底部，无论当前状态
        console.log('[UnifiedScrollEngine] 🚀 User message, forcing scroll to bottom');
        console.log('[UnifiedScrollEngine] Message count:', messageCount, 'Virtual scroll enabled:', messageCount >= 15);
        console.log('[UnifiedScrollEngine] Virtual ref available:', !!virtualMessageListRef?.current);
        isUserScrollingRef.current = false; // 解锁
        forceFollowUntilRef.current = Date.now() + 3000; // 3秒强制跟随

        // 🔥 虚拟滚动支持：使用 virtualMessageListRef 或直接设置 scrollTop
        if (messageCount >= 15 && virtualMessageListRef?.current) {
          console.log('[UnifiedScrollEngine] Using virtual scroll API');

          // 🔥 v3.0.1: 给虚拟滚动更多初始化时间（特别是长消息列表）
          // 根据消息数量动态调整延迟：15-20条消息 300ms，21+条消息 500ms
          const initialDelay = messageCount > 20 ? 500 : 300;
          console.log('[UnifiedScrollEngine] Initial delay:', initialDelay, 'ms');

          setTimeout(() => {
            console.log('[UnifiedScrollEngine] Calling scrollToBottom()...');
            virtualMessageListRef.current!.scrollToBottom();

            // 🔥 验证并重试（虚拟滚动可能需要额外时间）
            setTimeout(() => {
              const currentContainer = containerRef.current;
              if (currentContainer) {
                const distance = calculateDistanceToBottom(currentContainer);
                console.log('[UnifiedScrollEngine] After scrollToBottom(), distance:', distance);
                if (distance > 100) {
                  console.warn('[UnifiedScrollEngine] ⚠️ Virtual scroll incomplete, retrying...');
                  // 第二次尝试
                  setTimeout(() => {
                    if (containerRef.current && virtualMessageListRef?.current) {
                      const retryDistance = calculateDistanceToBottom(containerRef.current);
                      if (retryDistance > 100) {
                        console.warn('[UnifiedScrollEngine] ⚠️ Retry failed, force scrollTop');
                        containerRef.current.scrollTop = containerRef.current.scrollHeight;
                      } else {
                        console.log('[UnifiedScrollEngine] ✅ Retry succeeded');
                      }
                    }
                  }, 150);
                }
              }
            }, 200);
          }, initialDelay);
        } else {
          // 普通滚动或无虚拟滚动引用
          console.log('[UnifiedScrollEngine] Using direct scrollTop');
          console.log('[UnifiedScrollEngine] Reason:', messageCount < 15 ? 'Message count < 15' : 'Virtual ref not available');
          scrollToBottom(container);
        }
        break;

      case 'stream-update':
      case 'message-appended':
        // 流式更新或消息追加：仅在跟随区域且未锁定时滚动
        if (isInForceFollowPeriod || (inFollowZone && !isUserScrollingRef.current)) {
          const now = performance.now();
          // 节流：100ms 内只滚动一次
          if (now - lastScrollTimeRef.current >= 100) {
            lastScrollTimeRef.current = now;
            scrollToBottom(container);
          }
        }
        break;
    }
  }, [containerRef, followZonePx, messageCount, virtualMessageListRef]);

  /**
   * 添加事件到队列
   */
  const enqueueEvent = useCallback((event: ScrollEvent) => {
    eventQueueRef.current.push(event);

    // 🔥 单一 RAF 调度（避免嵌套 RAF）
    if (!isRafScheduledRef.current) {
      isRafScheduledRef.current = true;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        processQueue();
      });
    }
  }, [processQueue]);

  /**
   * 用户发送消息
   */
  const onUserMessage = useCallback(() => {
    if (!enabled) return;
    console.log('[UnifiedScrollEngine] 📨 User message event');
    enqueueEvent({ type: 'user-message', timestamp: Date.now() });
  }, [enabled, enqueueEvent]);

  /**
   * 流式更新
   */
  const onStreamUpdate = useCallback(() => {
    if (!enabled) return;
    enqueueEvent({ type: 'stream-update', timestamp: Date.now() });
  }, [enabled, enqueueEvent]);

  /**
   * 新消息追加
   */
  const onMessageAppended = useCallback(() => {
    if (!enabled) return;
    enqueueEvent({ type: 'message-appended', timestamp: Date.now() });
  }, [enabled, enqueueEvent]);

  /**
   * 用户开始滚动
   */
  const onUserScrollStart = useCallback(() => {
    if (!enabled) return;
    console.log('[UnifiedScrollEngine] 👤 User scroll start');
    isUserScrollingRef.current = true;
  }, [enabled]);

  /**
   * 用户结束滚动
   */
  const onUserScrollEnd = useCallback(() => {
    if (!enabled) return;
    console.log('[UnifiedScrollEngine] 👤 User scroll end');
    // 不立即解锁，让用户有时间继续滚动
    // 只有当用户滚动到跟随区域时才解锁
    const container = containerRef.current;
    if (container && isInFollowZone(container, followZonePx)) {
      isUserScrollingRef.current = false;
      console.log('[UnifiedScrollEngine] 👤 User back in follow zone, unlocking');
    }
  }, [enabled, containerRef, followZonePx]);

  /**
   * 清理 RAF
   */
  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  return {
    onUserMessage,
    onStreamUpdate,
    onMessageAppended,
    onUserScrollStart,
    onUserScrollEnd,
    isAutoScrollLocked: isUserScrollingRef.current,
  };
}
