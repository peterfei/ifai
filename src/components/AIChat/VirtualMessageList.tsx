/**
 * 虚拟滚动消息列表 - v0.2.6 性能优化
 * 使用 @tanstack/react-virtual 实现高性能长列表渲染
 * 仅渲染可见区域的消息，大幅提升长对话性能
 */

import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChatStore } from '../../stores/useChatStore';
import { MessageItem } from './MessageItem';

interface VirtualMessageListProps {
  messages: ReturnType<typeof useChatStore.getState>['messages'];
  onApprove: (messageId: string, toolCallId: string) => void;
  onReject: (messageId: string, toolCallId: string) => void;
  onOpenFile: (path: string) => Promise<void>;
  isLoading: boolean;
  parentRef?: React.RefObject<HTMLDivElement>; // 外部滚动容器引用
}

/**
 * 虚拟滚动消息列表组件
 * 使用 @tanstack/react-virtual 实现动态高度虚拟滚动
 * 支持外部滚动容器（避免嵌套滚动问题）
 */
export const VirtualMessageList: React.FC<VirtualMessageListProps> = ({
  messages,
  onApprove,
  onReject,
  onOpenFile,
  isLoading,
  parentRef,
}) => {
  const localRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = parentRef || localRef;

  // 检测是否有待处理的工具调用
  const hasPendingToolCalls = messages.some(m =>
    m.toolCalls?.some(tc => tc.status === 'pending' || tc.isPartial)
  );

  // ⚠️ 重要：始终调用 hooks，不能在条件返回之前
  // 使用 @tanstack/react-virtual 创建虚拟化列表
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 150, // 估算每条消息高度
    overscan: 5, // 增加预加载范围
    // 稳定性优化：仅基于消息数量决定是否启用，不基于 isLoading，防止流式输出期间频繁切换模式
    enabled: messages.length >= 15,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // 自动滚动到底部优化：使用 requestAnimationFrame 异步执行
  useEffect(() => {
    if ((isLoading || hasPendingToolCalls) && scrollElementRef.current) {
      const scrollEl = scrollElementRef.current;
      requestAnimationFrame(() => {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      });
    }
  }, [messages.length, isLoading, hasPendingToolCalls]);

  // 条件渲染：只有在消息极少时才降级，且过程平滑
  if (messages.length < 5) {
    return (
      <div className="space-y-4" style={{ contain: 'layout style paint' }}>
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onApprove={onApprove}
            onReject={onReject}
            onOpenFile={onOpenFile}
            isStreaming={isLoading && message.role === 'assistant'}
          />
        ))}
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
          const message = messages[virtualRow.index];
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
                message={message}
                onApprove={onApprove}
                onReject={onReject}
                onOpenFile={onOpenFile}
                isStreaming={false}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VirtualMessageList;
