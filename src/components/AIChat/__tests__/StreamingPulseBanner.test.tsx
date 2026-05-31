/**
 * StreamingPulseBanner 测试 — 流式脉冲横幅
 *
 * SPB-1~7：覆盖 isLoading 三态推导 + per-thread streamSummary 展示
 *
 * 🏆 Phase 4: PerThreadSessionStore.streamSummary 替代局部 useRef(wasLoading)。
 *   - wasLoading 边沿逻辑 → per-thread streamSummary 持久状态
 *   - SC-1: isLoading=true → Pulse（streamSummary 忽略）
 *   - SC-2: isLoading=false + streamSummary ≠ null → Summary
 *   - SC-3: isLoading=false + streamSummary = null → null（不渲染）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------- Mock stores ----------

let mockIsLoading = false;
let mockMessages: any[] = [];
let mockPromptMeta: any = null;
let mockCurrentThreadId = 'test-thread';
/** Per-thread streamSummary，控制 Summary 显示 */
let mockStreamSummary: any = null;

const mockTokenStats = vi.hoisted(() => ({ value: null as any }));

vi.mock('../../../stores/useChatStore', () => ({
  useChatStore: (selector: (s: any) => any) =>
    selector({ isLoading: mockIsLoading, messages: mockMessages, currentThreadId: mockCurrentThreadId }),
}));

vi.mock('../../../stores/transparencyStore', () => ({
  useTransparencyStore: (selector: (s: any) => any) =>
    selector({ currentPromptMeta: mockPromptMeta }),
}));

vi.mock('../../../stores/conversationStore', () => ({
  useConversationStore: (selector: (s: any) => any) =>
    selector({ tokenStats: mockTokenStats.value }),
  selectTokenStats: (s: any) => s.tokenStats,
}));

vi.mock('../../../utils/tokenCounter', () => ({
  formatTokenCount: (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)),
}));

// ---------- Helper ----------

async function renderBanner() {
  const { StreamingPulseBanner } = await import('../StreamingPulseBanner');
  return render(<StreamingPulseBanner />);
}

// ---------- Tests ----------

describe('StreamingPulseBanner', () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockMessages = [];
    mockPromptMeta = null;
    mockTokenStats.value = null;
    mockCurrentThreadId = 'test-thread';
    mockStreamSummary = null;
    // 设置 per-thread session store mock
    (window as any).__getPerThreadSessionStore = () => ({
      getStreamSummary: () => mockStreamSummary,
    });
    vi.resetModules();
  });

  // SPB-1: isLoading=true → 渲染 Pulse
  it('SPB-1: isLoading=true 渲染 Pulse（绿色脉冲 + 思考中）', async () => {
    mockIsLoading = true;
    mockMessages = [{ id: '1', role: 'user', content: 'hi' }];

    await renderBanner();

    expect(screen.getByTestId('streaming-pulse')).toBeTruthy();
    expect(screen.getByText('思考中...')).toBeTruthy();
  });

  // SPB-2: Pulse 阶段显示上下文 + 输出估算
  it('SPB-2: Pulse 阶段显示上下文 + 输出估算', async () => {
    mockIsLoading = true;
    mockMessages = [
      { id: '1', role: 'user', content: 'a'.repeat(400) },
    ];

    await renderBanner();

    // 用户消息 400 chars / 4 = 100 tokens → "上下文 100"
    expect(screen.getByText(/上下文 100/)).toBeTruthy();
    // 无 assistant 消息 → "输出 0"
    expect(screen.getByText(/输出 0/)).toBeTruthy();
  });

  // SPB-3: 无消息 + 未加载 → 不渲染
  it('SPB-3: 无消息 + 未加载 → 不渲染', async () => {
    mockIsLoading = false;
    mockMessages = [];

    const { container } = await renderBanner();

    expect(container.innerHTML).toBe('');
  });

  // SPB-4: 有消息但从未加载 → 不渲染
  it('SPB-4: 有消息但从未加载 → 不渲染', async () => {
    mockIsLoading = false;
    mockMessages = [{ id: '1', role: 'user', content: 'hi' }];

    const { container } = await renderBanner();

    expect(container.innerHTML).toBe('');
  });

  // SPB-5: true→false 过渡 → Summary（streamSummary + promptMeta 有数据）
  it('SPB-5: isLoading true→false 过渡后显示 Summary（含 token 数据）', async () => {
    // 阶段 1：loading 中
    mockIsLoading = true;
    mockMessages = [
      { id: '1', role: 'user', content: 'hi' },
      { id: '2', role: 'assistant', content: 'hello world response here' },
    ];

    const { rerender } = await renderBanner();
    expect(screen.getByTestId('streaming-pulse')).toBeTruthy();

    // 阶段 2：loading 结束，设置 per-thread streamSummary
    mockIsLoading = false;
    mockPromptMeta = { total_tokens_estimate: 4200 };
    mockStreamSummary = { inputTokens: 4200, outputTokens: 100 };

    const { StreamingPulseBanner } = await import('../StreamingPulseBanner');
    rerender(<StreamingPulseBanner />);

    expect(screen.getByTestId('streaming-summary')).toBeTruthy();
    expect(screen.getByText(/完成/)).toBeTruthy();
    // streamSummary.inputTokens 优先于 promptMeta
    expect(screen.getByText(/上下文 4.2K/)).toBeTruthy();
  });

  // SPB-6: promptMeta 为 null 时 Summary 降级（从 streamSummary 读取）
  it('SPB-6: promptMeta 为 null 时 Summary 从 streamSummary 读取', async () => {
    // 阶段 1：loading 中
    mockIsLoading = true;
    mockMessages = [
      { id: '1', role: 'user', content: 'a'.repeat(400) },
      { id: '2', role: 'assistant', content: 'b'.repeat(800) },
    ];

    const { rerender } = await renderBanner();

    // 阶段 2：loading 结束，设置 per-thread streamSummary
    mockIsLoading = false;
    mockStreamSummary = { inputTokens: 100, outputTokens: 200 };

    const { StreamingPulseBanner } = await import('../StreamingPulseBanner');
    rerender(<StreamingPulseBanner />);

    // 不崩溃，Summary 存在，从 streamSummary 获取数据
    expect(screen.getByTestId('streaming-summary')).toBeTruthy();
    // streamSummary.outputTokens = 200
    expect(screen.getByText(/输出 200/)).toBeTruthy();
  });

  // SPB-8: Pulse 阶段 tokenStats 优先于 chars/4 粗估
  it('SPB-8: Pulse 阶段使用 tokenStats 精确值', async () => {
    mockTokenStats.value = { total_tokens: 1900 };
    mockIsLoading = true;
    mockMessages = [
      { id: '1', role: 'user', content: 'a'.repeat(400) },
    ];

    await renderBanner();

    // tokenStats.total_tokens = 1900 → "上下文 1.9K"
    expect(screen.getByText(/上下文 1\.9K/)).toBeTruthy();
    // 无 assistant 消息 → "输出 0"
    expect(screen.getByText(/输出 0/)).toBeTruthy();
  });

  // SPB-7: 再次 true → 切回 Pulse（Summary 消失）
  it('SPB-7: 再次 isLoading=true → 切回 Pulse', async () => {
    // 阶段 1：loading
    mockIsLoading = true;
    mockMessages = [{ id: '1', role: 'user', content: 'hi' }];

    const { rerender } = await renderBanner();

    // 阶段 2：loading 结束 → Summary
    mockIsLoading = false;
    mockPromptMeta = { total_tokens_estimate: 4200 };
    mockStreamSummary = { inputTokens: 4200, outputTokens: 100 };

    const { StreamingPulseBanner: SB2 } = await import('../StreamingPulseBanner');
    rerender(<SB2 />);
    expect(screen.getByTestId('streaming-summary')).toBeTruthy();

    // 阶段 3：再次 loading → Pulse（streamSummary 已由 clearStreamSummary 清除）
    mockIsLoading = true;
    mockStreamSummary = null;

    const { StreamingPulseBanner: SB3 } = await import('../StreamingPulseBanner');
    rerender(<SB3 />);

    expect(screen.getByTestId('streaming-pulse')).toBeTruthy();
    expect(screen.queryByTestId('streaming-summary')).toBeNull();
  });
});
