/**
 * ConversationDetailPanel 集成测试
 *
 * CDP-1 ~ CDP-7: 验证 Tab 并排布局 + 真实数据
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock threadStore
vi.mock('../../../stores/threadStore', () => ({
  useThreadStore: (selector: (s: any) => any) =>
    selector({
      activeThreadId: 'thread-1',
      threads: {
        'thread-1': { messageCount: 5 },
      },
    }),
}));

// Mock useChatStore (for sub-panels)
vi.mock('../../../stores/useChatStore', () => ({
  useChatStore: (selector: (s: any) => any) =>
    selector({ messages: [] }),
}));

// Mock sub-panel hooks
vi.mock('../panels/useWorkLogData', () => ({
  useWorkLogData: () => [],
}));
vi.mock('../panels/useArtifactData', () => ({
  useArtifactData: () => [],
}));

describe('ConversationDetailPanel', () => {
  async function renderPanel() {
    const { ConversationDetailPanel } = await import('../ConversationDetailPanel');
    return render(<ConversationDetailPanel />);
  }

  // CDP-1: 渲染三个 Tab 按钮
  it('CDP-1: 渲染三个 Tab 按钮（并排）', async () => {
    await renderPanel();

    expect(screen.getByText('工作日志')).toBeTruthy();
    expect(screen.getByText('产出物')).toBeTruthy();
    expect(screen.getByText('预览')).toBeTruthy();
  });

  // CDP-2: Tab 切换功能正常
  it('CDP-2: Tab 切换功能正常', async () => {
    await renderPanel();

    // 默认显示工作日志
    expect(screen.getByTestId('work-log-panel')).toBeTruthy();

    // 切换到产出物
    fireEvent.click(screen.getByText('产出物'));
    expect(screen.getByTestId('artifacts-panel')).toBeTruthy();

    // 切换到预览
    fireEvent.click(screen.getByText('预览'));
    expect(screen.getByTestId('preview-panel')).toBeTruthy();
  });

  // CDP-3: 激活 Tab 有蓝色底线
  it('CDP-3: 激活 Tab 有蓝色底线', async () => {
    const { container } = await renderPanel();

    const activeIndicators = container.querySelectorAll('.bg-\\[\\#3B82F6\\]');
    // 应该有 1 个激活的蓝色底线
    expect(activeIndicators.length).toBeGreaterThanOrEqual(1);
  });

  // CDP-4: 无 MOCK_LOGS 引用
  it('CDP-4: 无 MOCK_LOGS 引用', async () => {
    const module = await import('../ConversationDetailPanel');
    expect((module as any).MOCK_LOGS).toBeUndefined();
  });

  // CDP-5: 无 AGENT_COLORS 手动映射
  it('CDP-5: 无 AGENT_COLORS 手动映射', async () => {
    const module = await import('../ConversationDetailPanel');
    expect((module as any).AGENT_COLORS).toBeUndefined();
  });

  // CDP-6: 底部状态栏仍对接 threadStore
  it('CDP-6: 底部状态栏仍对接 threadStore', async () => {
    await renderPanel();

    expect(screen.getByText(/对话：5条/)).toBeTruthy();
  });

  // CDP-7: data-testid="conversation-detail-panel" 兼容
  it('CDP-7: data-testid="conversation-detail-panel" 兼容', async () => {
    await renderPanel();

    expect(screen.getByTestId('conversation-detail-panel')).toBeTruthy();
  });
});
