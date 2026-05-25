/**
 * StreamingPulseBanner — 流式脉冲横幅
 *
 * 固定在 AIChat 输入框上方（与 TodoWriteBanner 同级）。
 * 直接订阅 chatStore + transparencyStore，零 props。
 *
 * 状态推导（零 useState）：
 * - isLoading=true        → Pulse（绿色脉冲 + 上下文估算）
 * - isLoading=false + wasLoading=true  → Summary（上下文 + Token 消费）
 * - isLoading=false + wasLoading=false → null（不渲染）
 */

import React, { useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import { useTransparencyStore } from '../../stores/transparencyStore';
import { formatTokenCount } from '../../utils/tokenCounter';

/* ===== 常量 ===== */

const COLOR_GREEN = '#10B981';
const BG_BANNER = 'rgba(30, 30, 40, 0.6)';
const PULSE_ANIMATION = 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite';

/** 从消息内容长度估算 token 数（chars / 4 粗估） */
function estimateTokensFromMessages(messages: any[], scope: 'all' | 'assistant'): number {
  const filtered = scope === 'assistant'
    ? messages.filter((m: any) => m.role === 'assistant')
    : messages;
  const totalChars = filtered.reduce((sum: number, m: any) => {
    const content = typeof m.content === 'string' ? m.content : '';
    return sum + content.length;
  }, 0);
  return Math.round(totalChars / 4);
}

/* ===== 主组件 ===== */

export function StreamingPulseBanner() {
  const isLoading = useChatStore(s => s.isLoading);
  const messages = useChatStore(s => s.messages);
  const promptMeta = useTransparencyStore(s => s.currentPromptMeta);

  const wasLoading = useRef(false);

  // 追踪 isLoading 边沿：true 时标记
  useEffect(() => {
    if (isLoading) wasLoading.current = true;
  }, [isLoading]);

  // 推导渲染阶段
  const showPulse = isLoading;
  const showSummary = !isLoading && wasLoading.current;

  if (!showPulse && !showSummary) return null;

  // Pulse 阶段
  if (showPulse) {
    const ctxEstimate = messages.length > 0
      ? formatTokenCount(messages.length * 350)
      : '0';

    return (
      <div
        data-testid="streaming-pulse"
        className="border-t border-white/5 overflow-hidden"
        style={{ backgroundColor: BG_BANNER }}
      >
        <div className="px-3 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              style={{
                color: COLOR_GREEN,
                fontSize: 11,
                animation: PULSE_ANIMATION,
              }}
            >
              ●
            </span>
            <span className="text-[10px] text-gray-400">思考中...</span>
          </div>
          <span
            data-testid="pulse-context"
            className="text-[10px] text-gray-600 font-mono"
          >
            ~{ctxEstimate}
          </span>
        </div>
      </div>
    );
  }

  // Summary 阶段
  // 数据源：currentPromptMeta.total_tokens_estimate（SSE 流式时设置）
  // 降级：从消息内容长度估算（chars / 4）
  const inputTokens = promptMeta?.total_tokens_estimate
    ?? estimateTokensFromMessages(messages, 'all');
  const outputTokens = estimateTokensFromMessages(messages, 'assistant');

  return (
    <div
      data-testid="streaming-summary"
      className="border-t border-white/5 overflow-hidden"
      style={{ backgroundColor: BG_BANNER }}
    >
      <div className="px-3 py-1.5 flex items-center gap-3">
        <span style={{ color: COLOR_GREEN, fontSize: 11 }}>✓</span>
        <span className="text-[10px] text-gray-400">完成</span>
        <span className="text-[10px] text-gray-500 font-mono">
          上下文 {formatTokenCount(inputTokens)}
        </span>
        <span className="text-[10px] text-gray-500 font-mono">
          输出 {formatTokenCount(outputTokens)}
        </span>
      </div>
    </div>
  );
}
