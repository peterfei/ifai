/**
 * 虚拟滚动消息列表 - v0.2.6 性能优化
 * 使用 @tanstack/react-virtual 实现高性能长列表渲染
 * 仅渲染可见区域的消息，大幅提升长对话性能
 */

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChatStore } from '../../stores/useChatStore';
import { MessageItem } from './MessageItem';
import { calculateDistanceToBottom, ScrollConstants } from '../../hooks/useChatScrollController';
import { StreamingMessageSkeleton } from './skeleton';

export interface VirtualMessageListHandle {
  scrollToBottom: () => void;
}

interface VirtualMessageListProps {
  messages: ReturnType<typeof useChatStore.getState>['messages'];
  onApprove: (messageId: string, toolCallId: string) => void;
  onReject: (messageId: string, toolCallId: string) => void;
  onOpenFile: (path: string) => Promise<void>;
  onOpenComposer?: (messageId: string) => void;
  isLoading: boolean;
  parentRef?: React.RefObject<HTMLDivElement>;
}

/**
 * 虚拟滚动消息列表组件
 * 使用 @tanstack/react-virtual 实现动态高度虚拟滚动
 * 支持外部滚动容器（避免嵌套滚动问题）
 */
export const VirtualMessageList = forwardRef<VirtualMessageListHandle, VirtualMessageListProps>(({
  messages,
  onApprove,
  onReject,
  onOpenFile,
  onOpenComposer,
  isLoading,
  parentRef,
}, ref) => {
  const localRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = parentRef || localRef;

  // 🔥 FIX: 过滤掉 role === 'tool' 的消息，因为工具结果已经通过 ToolApproval 组件在 assistant 消息中显示
  const visibleMessages = messages.filter(m => m.role !== 'tool');

  // 检测是否有待处理的工具调用
  const hasPendingToolCalls = messages.some(m =>
    m.toolCalls?.some(tc => tc.status === 'pending' || tc.isPartial)
  );

  // 🔥 检测是否有流式内容的 assistant 消息（最后一条消息）
  // 如果有实际流式内容，就不显示骨架屏
  const lastMessage = visibleMessages[visibleMessages.length - 1];
  const hasStreamingContent = lastMessage?.role === 'assistant' && (
    lastMessage.isStreaming === true ||
    (lastMessage.content && lastMessage.content.length > 0)
  );

  // 🔥 计算虚拟化项数量：只有在加载中但没有实际内容时才显示骨架屏
  const virtualItemCount = useMemo(() => {
    // 🔥 关键修复：有流式内容时不显示骨架屏
    const shouldShowSkeleton = isLoading && visibleMessages.length > 0 && !hasStreamingContent;
    return visibleMessages.length + (shouldShowSkeleton ? 1 : 0);
  }, [visibleMessages.length, isLoading, hasStreamingContent]);

  // ⚠️ 重要：始终调用 hooks，不能在条件返回之前
  // 使用 @tanstack/react-virtual 创建虚拟化列表
  const virtualizer = useVirtualizer({
    count: virtualItemCount,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 150,
    overscan: 5,
    enabled: visibleMessages.length >= 15,
  });

  // 暴露滚动到底部的方法
  useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      if (visibleMessages.length > 0) {
        const lastIndex = visibleMessages.length - 1;
        // 直接使用 virtualizer.scrollToIndex，移除三重 RAF 延迟
        try {
          virtualizer.scrollToIndex(lastIndex, { align: 'end' });

          // 后备验证：使用统一常量
          setTimeout(() => {
            const container = scrollElementRef.current;
            if (container) {
              const distance = calculateDistanceToBottom(container);
              if (distance > ScrollConstants.FOLLOW_ZONE_PX) {
                container.scrollTop = container.scrollHeight;
              }
            }
          }, ScrollConstants.RETRY_DELAY_MS);
        } catch (error) {
          // virtualizer 未就绪，直接设置 scrollTop
          const container = scrollElementRef.current;
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        }
      }
    },
  }), [virtualizer, visibleMessages.length, scrollElementRef]);

  const virtualItems = virtualizer.getVirtualItems();
  const topOffset = virtualizer.getVirtualItems()[0]?.start ?? 0;

  // 🔥 FIX v1.0.0: 移除独立的 RAF 滚动循环
  // 滚动逻辑现在由 AIChat 组件中的 useChatScrollController 统一管理
  // 这样避免了多个组件同时控制滚动导致的冲突和用户滚动被覆盖的问题
  // 详见: /Users/mac/project/aieditor/openspec/changes/fix-scroll-focus-and-ui-freeze

  // 🔥 FIX v1.0.0: 移除流式期间禁用虚拟滚动的逻辑
  // 现在虚拟滚动始终启用（当消息数 >= 15 时），无论是否在流式输出
  // 这确保了长对话在流式期间也能保持良好的性能
  if (visibleMessages.length < 15) {
    // 短对话直接渲染
    return (
      <div className="space-y-4" style={{ contain: 'layout style paint' }}>
        {visibleMessages.map((message, index) => (
          <React.Fragment key={message.id}>
            <MessageItem
              message={message as any}
              onApprove={onApprove}
              onReject={onReject}
              onOpenFile={onOpenFile}
              onOpenComposer={onOpenComposer}
              // 🔥 v0.5.0: 只在消息本身的 isStreaming 为 true 时才启用，不使用全局 isLoading
              // 这样历史消息加载时不会触发打字机效果
              isStreaming={message.isStreaming || false}
            />
          </React.Fragment>
        ))}
        {/* 🔥 流式加载骨架屏：只有在加载中但没有实际内容时才显示 */}
        {isLoading && visibleMessages.length > 0 && !hasStreamingContent && <StreamingMessageSkeleton />}
      </div>
    );
  }

  // 虚拟滚动渲染（长对话 + 非流式状态 + 无待处理工具调用）
  return (
    <div
      ref={localRef}
      style={{
        // 移除 h-full 和 overflow: hidden，让父容器控制滚动
        // 虚拟滚动通过父容器的滚动来工作
        contain: 'layout style paint',
        willChange: 'transform',
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
          contain: 'layout style paint',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const isSkeletonItem = virtualRow.index >= visibleMessages.length;

          // 🔥 如果是骨架屏项，渲染骨架屏
          if (isSkeletonItem) {
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                data-skeleton-item="true"
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  willChange: 'transform',
                  contain: 'layout style paint',
                }}
              >
                <StreamingMessageSkeleton />
              </div>
            );
          }

          const message = visibleMessages[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                willChange: 'transform',
                contain: 'layout style paint',
              }}
            >
              <MessageItem
                message={message as any}
                onApprove={onApprove}
                onReject={onReject}
                onOpenFile={onOpenFile}
                onOpenComposer={onOpenComposer}
                isStreaming={false}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

VirtualMessageList.displayName = 'VirtualMessageList';

export default VirtualMessageList;
