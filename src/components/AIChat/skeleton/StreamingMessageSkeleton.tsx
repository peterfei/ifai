/**
 * 单消息气泡骨架屏组件（用于流式加载）
 *
 * 🔥 这是一个独立的组件，直接渲染消息气泡骨架
 * 不使用 DSLRenderer，避免 overlay 布局问题
 * 将在 VirtualMessageList 中作为消息列表的最后一项渲染
 */

import React from 'react';

export const StreamingMessageSkeleton: React.FC = () => {
  return (
    <div
      className="flex flex-col gap-2 p-3"
      data-testid="streaming-message-skeleton"
      style={{
        width: '100%',
        animation: 'skeleton-fade-in 0.2s ease-in-out forwards',
      }}
    >
      <div className="flex gap-2">
        {/* 头像骨架 */}
        <div
          className="skeleton-block skeleton-shimmer"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            flexShrink: 0,
          }}
        />

        {/* 消息内容骨架 */}
        <div className="flex flex-col gap-1.5" style={{ flex: 1 }}>
          {/* 名称骨架 */}
          <div
            className="skeleton-block"
            style={{
              width: '100px',
              height: '16px',
              borderRadius: '4px',
            }}
          />

          {/* 文本行骨架 */}
          <div
            className="skeleton-block"
            style={{
              width: '100%',
              height: '12px',
              borderRadius: '4px',
            }}
          />
          <div
            className="skeleton-block"
            style={{
              width: '90%',
              height: '12px',
              borderRadius: '4px',
            }}
          />
          <div
            className="skeleton-block skeleton-shimmer"
            style={{
              width: '70%',
              height: '12px',
              borderRadius: '4px',
            }}
          />
        </div>
      </div>
    </div>
  );
};
