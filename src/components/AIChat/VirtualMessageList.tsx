/**
 * 虚拟滚动消息列表 - v0.2.6 性能优化
 * 使用 @tanstack/react-virtual 实现高性能长列表渲染
 * 仅渲染可见区域的消息，大幅提升长对话性能
 */

import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChatStore } from '../../stores/useChatStore';
import { MessageItem } from './MessageItem';
// 🔥 工作流内嵌监控器已移至 AIChat 组件中，避免频繁卸载
// import { WorkflowInlineMonitorContainer } from '../workflow/WorkflowInlineMonitor';

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
    overscan: 5, // 🔥 FIX v1.0.0: 增加 overscan 到 5，确保流式时有足够的预渲染消息
    // 🔥 FIX v1.0.0: 流式期间也保持虚拟滚动启用，避免 DOM 节点过多阻塞主线程
    enabled: visibleMessages.length >= 15,
  });

  const virtualItems = virtualizer.getVirtualItems();

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
};

export default VirtualMessageList;
