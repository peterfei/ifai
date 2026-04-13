/**
 * QueueIndicator - 消息队列状态指示器
 *
 * 显示消息队列的处理状态：
 * - 处理中的消息（旋转动画）
 * - 等待中的消息数量（脉冲动画）
 * - 工作流消息优先级提示
 *
 * @version 1.0.0
 * @proposal P4 Multi-Agent Collaboration - Phase 2
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Clock, Zap } from 'lucide-react';
import { chatEventBus } from '../../stores/chat/eventBus/ChatEventBus';
import type { ChatEvents } from '../../stores/chat/eventBus/ChatEventBus';
import clsx from 'clsx';

interface QueueStatus {
  normal: { pending: number; processing: number };
  workflow: { pending: number; processing: number };
  isProcessing: boolean;
}

interface QueueIndicatorProps {
  className?: string;
}

/**
 * QueueIndicator 组件
 *
 * 自动订阅 ChatEventBus 的队列事件，实时显示队列状态
 */
export const QueueIndicator: React.FC<QueueIndicatorProps> = ({ className }) => {
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    normal: { pending: 0, processing: 0 },
    workflow: { pending: 0, processing: 0 },
    isProcessing: false,
  });

  const [isVisible, setIsVisible] = useState(false);

  /**
   * 计算是否应该显示指示器
   */
  const shouldShow = useCallback(() => {
    return (
      queueStatus.isProcessing ||
      queueStatus.normal.pending > 0 ||
      queueStatus.workflow.pending > 0
    );
  }, [queueStatus]);

  /**
   * 计算总等待消息数
   */
  const totalPending = queueStatus.normal.pending + queueStatus.workflow.pending;

  /**
   * 是否有工作流消息在队列中
   */
  const hasWorkflow = queueStatus.workflow.pending > 0 || queueStatus.workflow.processing > 0;

  // 订阅 ChatEventBus 事件
  useEffect(() => {
    const unsubscribes: Array<() => void> = [];

    // 监听消息处理开始
    unsubscribes.push(
      chatEventBus.on('chat:queue:processing', (payload) => {
        console.log('[QueueIndicator] 🔄 Message processing:', payload.messageId);
        setQueueStatus(payload.queueStatus);
      })
    );

    // 监听消息完成
    unsubscribes.push(
      chatEventBus.on('chat:queue:completed', (payload) => {
        console.log('[QueueIndicator] ✅ Message completed:', payload.messageId);
        setQueueStatus(payload.queueStatus);
      })
    );

    // 监听消息中止
    unsubscribes.push(
      chatEventBus.on('chat:queue:aborted', (payload) => {
        console.log('[QueueIndicator] ⏹️ Message aborted:', payload.messageId);
        setQueueStatus(payload.queueStatus);
      })
    );

    // 监听消息失败
    unsubscribes.push(
      chatEventBus.on('chat:queue:failed', (payload) => {
        console.log('[QueueIndicator] ❌ Message failed:', payload.messageId);
        setQueueStatus(payload.queueStatus);
      })
    );

    // 🔥 FIX: 监听状态变更事件（在 finally 块中触发，确保 isProcessing=false 被正确传递）
    unsubscribes.push(
      chatEventBus.on('chat:queue:status-changed', (payload) => {
        setQueueStatus(payload.queueStatus);
      })
    );

    // 清理函数
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, []);

  /**
   * 自动显示/隐藏逻辑
   */
  useEffect(() => {
    const show = shouldShow();

    // 延迟隐藏，避免闪烁
    if (!show) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(true);
    }
  }, [shouldShow]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300',
        hasWorkflow
          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
        className
      )}
      data-testid="queue-indicator"
    >
      {/* 处理中图标 */}
      {queueStatus.isProcessing && (
        <div className="flex items-center gap-1.5">
          <Loader2 size={14} className="animate-spin" />
          <span>处理中</span>
        </div>
      )}

      {/* 等待中图标 */}
      {totalPending > 0 && (
        <div className="flex items-center gap-1.5">
          {queueStatus.isProcessing && <span className="text-white/30">|</span>}
          <Clock size={14} className={clsx(totalPending > 0 && 'animate-pulse')} />
          <span>
            {totalPending} 条等待
            {hasWorkflow && ' (含工作流)'}
          </span>
        </div>
      )}

      {/* 工作流优先级提示 */}
      {hasWorkflow && (
        <div className="flex items-center gap-1 ml-1 pl-2 border-l border-white/20">
          <Zap size={12} className="animate-pulse" />
        </div>
      )}
    </div>
  );
};

/**
 * 默认导出
 */
export default QueueIndicator;
