/**
 * StreamingPulseBanner — 流式脉冲横幅
 *
 * 固定在 AIChat 输入框上方（与 TodoWriteBanner 同级）。
 * 直接订阅 chatStore + transparencyStore，零 props。
 *
 * 状态推导（零 useState，使用 per-thread streamSummary）：
 * - isLoading=true        → Pulse（绿色脉冲 + 上下文 + 输出估算）
 * - isLoading=false + per-thread streamSummary ≠ null → Summary（上下文 + Token 消费）
 * - isLoading=false + per-thread streamSummary = null → null（不渲染）
 *
 * 🏆 Phase 4: 使用 PerThreadSessionStore.streamSummary 替代局部 useRef(wasLoading)，
 * 解决「切回已完成流式线程时 Summary 不显示」和「wasLoading 跨线程泄漏」问题。
 *
 * 数据来源优先级（与右侧 ConversationDetailPanel 面板一致）：
 *  上下文 = tokenStats.total_tokens（Rust tiktoken）＞ chars/4 粗估
 *  输出  = assistant 消息 chars/4 粗估（tokenStats 无法区分输入/输出）
 */

import React from 'react';
import { useChatStore } from '../../stores/useChatStore';
import { useTransparencyStore } from '../../stores/transparencyStore';
import { useConversationStore, selectTokenStats } from '../../stores/conversationStore';
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

/** 读取 per-thread streamSummary（线程安全、跨线程持久） */
function getPerThreadStreamSummary(threadId: string): { inputTokens: number; outputTokens: number } | null {
  if (typeof window === 'undefined') return null;
  const pss = (window as any).__getPerThreadSessionStore?.();
  if (!pss) return null;
  return pss.getStreamSummary(threadId);
}

/* ===== 主组件 ===== */

export function StreamingPulseBanner() {
  const isLoading = useChatStore(s => s.isLoading);
  const currentThreadId = useChatStore(s => s.currentThreadId);
  const messages = useChatStore(s => s.messages);
  const promptMeta = useTransparencyStore(s => s.currentPromptMeta);
  const tokenStats = useConversationStore(selectTokenStats);

  // 🏆 Phase 4: 从 PerThreadSessionStore 读取 per-thread 摘要
  // 替代局部 useRef(wasLoading)，实现跨线程持久 + 线程隔离
  const streamSummary = currentThreadId ? getPerThreadStreamSummary(currentThreadId) : null;

  // 推导渲染阶段
  const showPulse = isLoading;
  const showSummary = !isLoading && streamSummary !== null;

  if (!showPulse && !showSummary) return null;

  // Pulse 阶段 — tokenStats 优先，降级到 chars/4 粗估
  if (showPulse) {
    const inputTokens = tokenStats?.total_tokens
      ?? estimateTokensFromMessages(messages, 'all');
    const outputEstimate = estimateTokensFromMessages(messages, 'assistant');

    return (
      <div
        data-testid="streaming-pulse"
        className="border-t border-white/5 overflow-hidden"
        style={{ backgroundColor: BG_BANNER }}
      >
        <div className="px-3 py-1.5 flex items-center gap-3">
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
          <span className="text-[10px] text-gray-500 font-mono">
            上下文 {formatTokenCount(inputTokens)}
          </span>
          <span className="text-[10px] text-gray-500 font-mono">
            输出 {formatTokenCount(outputEstimate)}
          </span>
        </div>
      </div>
    );
  }

  // Summary 阶段 — 优先使用 per-thread streamSummary（跨线程保留），
  // 降级到 tokenStats / promptMeta / chars/4 粗估
  const inputTokens = streamSummary?.inputTokens
    ?? tokenStats?.total_tokens
    ?? promptMeta?.total_tokens_estimate
    ?? estimateTokensFromMessages(messages, 'all');
  const outputTokens = streamSummary?.outputTokens
    ?? estimateTokensFromMessages(messages, 'assistant');

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
