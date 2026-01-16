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
  onOpenComposer?: (messageId: string) => void; // v0.2.8: 打开 Composer 面板
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
  onOpenComposer,
  isLoading,
  parentRef,
}) => {
  const localRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = parentRef || localRef;

  // 🔥 FIX: 过滤掉 role === 'tool' 的消息，因为工具结果已经通过 ToolApproval 组件在 assistant 消息中显示
  // 这避免了重复输出（一次格式化显示，一次原始 JSON 字符串显示）
  // 注意：不过滤只有 toolCalls 的空 assistant 消息，因为它们需要在 MessageItem 中渲染 ToolApproval
  const visibleMessages = messages.filter(m => m.role !== 'tool');

  // 检测是否有待处理的工具调用
  const hasPendingToolCalls = messages.some(m =>
    m.toolCalls?.some(tc => tc.status === 'pending' || tc.isPartial)
  );

  // ⚠️ 重要：始终调用 hooks，不能在条件返回之前
  // 使用 @tanstack/react-virtual 创建虚拟化列表
  const virtualizer = useVirtualizer({
    count: visibleMessages.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 150, // 估算每条消息高度
    overscan: 3, // 额外渲染上下各 3 条消息（减少白屏）
    // 流式输出 或 有待处理工具调用时禁用虚拟滚动
    enabled: visibleMessages.length >= 15 && !isLoading && !hasPendingToolCalls,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // 自动滚动到底部（流式输出时）
  useEffect(() => {
    if ((isLoading || hasPendingToolCalls) && scrollElementRef.current) {
      scrollElementRef.current.scrollTop = scrollElementRef.current.scrollHeight;
    }
  }, [visibleMessages, isLoading, hasPendingToolCalls]);

  // 条件渲染：短对话、正在加载、或有待处理工具调用时使用普通列表
  if (visibleMessages.length < 15 || isLoading || hasPendingToolCalls) {
    return (
      <div className="space-y-4" style={{ contain: 'layout style paint' }}>
        {visibleMessages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onApprove={onApprove}
            onReject={onReject}
            onOpenFile={onOpenFile}
            onOpenComposer={onOpenComposer}
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
                message={message}
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
};

export default VirtualMessageList;
