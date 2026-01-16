/**
 * MessageTimeline - 消息时间线视图组件
 *
 * 功能特性:
 * 1. 气泡样式展示对话（用户左对齐，AI右对齐）
 * 2. 分步加载避免网络超时（初始10条，滚动加载更多）
 * 3. 按天分组（今天、昨天、更早）
 * 4. 支持点击气泡跳转到对应消息
 * 5. 长消息折叠显示
 *
 * @version v0.3.1
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import { TimelineUserBubble } from './TimelineUserBubble';
import { TimelineAIBubble } from './TimelineAIBubble';
import { TimelineProgress } from './TimelineProgress';
import { TimelineBubbleSkeleton } from './TimelineBubbleSkeleton';
import { TimelineRetryButton } from './TimelineRetryButton';
import { TimelineLoadMore } from './TimelineLoadMore';
import { TimelineLoader, TimelineEvent, TimelineGroup } from './TimelineLoader';
import type { Message } from 'ifainew-core';

interface MessageTimelineProps {
  onBubbleClick?: (messageId: string) => void;
  batchSize?: number;
  timeoutMs?: number;
}

export const MessageTimeline: React.FC<MessageTimelineProps> = ({
  onBubbleClick,
  batchSize = 10,
  timeoutMs = 5000
}) => {
  const messages = useChatStore((state) => state.messages);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Timeline 状态
  const [state, setState] = useState<{
    groups: TimelineGroup[];
    loadedCount: number;
    totalCount: number;
    loading: boolean;
    hasMore: boolean;
    error: string | null;
  }>({
    groups: [],
    loadedCount: 0,
    totalCount: 0,
    loading: false,
    hasMore: true,
    error: null
  });

  const loaderRef = useRef<TimelineLoader | null>(null);

  // 初始化 TimelineLoader
  useEffect(() => {
    loaderRef.current = new TimelineLoader(messages, {
      batchSize,
      timeoutMs
    });

    // 初始加载第一批
    loadInitialBatch();

    return () => {
      loaderRef.current = null;
    };
  }, [messages, batchSize, timeoutMs]);

  // 加载初始批次
  const loadInitialBatch = async () => {
    if (!loaderRef.current) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await loaderRef.current.loadInitial();

      setState({
        groups: result.groups,
        loadedCount: result.loadedCount,
        totalCount: result.totalCount,
        loading: false,
        hasMore: result.hasMore,
        error: result.error || null  // 从result中获取error（如果有）
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : '加载失败'
      }));
    }
  };

  // 加载更多
  const loadMore = useCallback(async () => {
    if (!loaderRef.current || state.loading || !state.hasMore) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await loaderRef.current.loadMore();

      setState({
        groups: result.groups,
        loadedCount: result.loadedCount,
        totalCount: result.totalCount,
        loading: false,
        hasMore: result.hasMore,
        error: result.error || null  // 从result中获取error（如果有）
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : '加载失败'
      }));
    }
  }, [state.loading, state.hasMore]);

  // 重试加载
  const retry = useCallback(() => {
    if (state.error) {
      loadInitialBatch();
    } else {
      loadMore();
    }
  }, [state.error, loadMore]);

  // 处理气泡点击
  const handleBubbleClick = useCallback((messageId: string) => {
    onBubbleClick?.(messageId);
  }, [onBubbleClick]);

  // 滚动到底部加载更多
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const scrollTop = target.scrollTop;
    const scrollHeight = target.scrollHeight;
    const clientHeight = target.clientHeight;

    // 当滚动到距离底部 100px 时加载更多
    if (scrollHeight - scrollTop - clientHeight < 100 && state.hasMore && !state.loading) {
      loadMore();
    }
  }, [state.hasMore, state.loading, loadMore]);

  if (state.groups.length === 0 && state.loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div
      ref={timelineRef}
      className="flex flex-col h-full bg-[#1e1e1e] overflow-y-auto"
      onScroll={handleScroll}
      data-testid="timeline-view"
    >
      {/* 进度条 */}
      <TimelineProgress
        loaded={state.loadedCount}
        total={state.totalCount}
        data-testid="timeline-progress"
      />

      {/* 时间线分组 */}
      {state.groups.map((group) => {
        // 生成英文 data-testid 以匹配测试期望
        const getTestId = (label: string): string => {
          const labelMap: Record<string, string> = {
            '今天': 'today',
            '昨天': 'yesterday',
            '更早': 'older'
          };
          return `timeline-group-${labelMap[label] || label}`;
        };

        return (
          <div
            key={group.label}
            className="border-b border-gray-700/50"
            data-testid={getTestId(group.label)}
          >
            {/* 分组标签 */}
            <div className="px-4 py-2 bg-[#252526] sticky top-0 z-10">
              <span className="text-xs text-gray-400 font-medium">
                {group.label}
              </span>
            </div>

            {/* 气泡列表 */}
            <div className="flex flex-col gap-2 p-4">
              {group.events.map((event) => {
                if (event.type === 'user') {
                  return (
                    <TimelineUserBubble
                      key={event.id}
                      time={event.timeLabel}
                      timestamp={event.timestamp}
                      content={event.preview}
                      hasCode={event.hasCode}
                      onClick={() => handleBubbleClick(event.messageId)}
                      data-testid={`timeline-user-bubble-${event.id}`}
                    />
                  );
                } else {
                  return (
                    <TimelineAIBubble
                      key={event.id}
                      time={event.timeLabel}
                      timestamp={event.timestamp}
                      content={event.preview}
                      hasCode={event.hasCode}
                      codeLanguage={event.codeLanguage}
                      codeLines={event.codeLines}
                      onClick={() => handleBubbleClick(event.messageId)}
                      data-testid={`timeline-ai-bubble-${event.id}`}
                    />
                  );
                }
              })}
            </div>
          </div>
        );
      })}

      {/* 加载状态 */}
      {state.loading && (
        <div className="flex flex-col gap-2 p-4">
          <TimelineBubbleSkeleton type="user" data-testid="timeline-skeleton-user" />
          <TimelineBubbleSkeleton type="assistant" data-testid="timeline-skeleton-assistant" />
        </div>
      )}

      {/* 错误重试 */}
      {state.error && (
        <TimelineRetryButton
          message={state.error}
          onRetry={retry}
          data-testid="timeline-retry-button"
        />
      )}

      {/* 加载更多 */}
      {state.hasMore && !state.loading && !state.error && (
        <TimelineLoadMore
          onClick={loadMore}
          data-testid="timeline-load-more"
        />
      )}
    </div>
  );
};

export default MessageTimeline;
