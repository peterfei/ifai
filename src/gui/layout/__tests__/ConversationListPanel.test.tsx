/**
 * ConversationListPanel 测试
 *
 * CLP-1 ~ CLP-13: 左栏面板完善
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationListPanel } from '../ConversationListPanel';

// Mock threadStore
const mockThreads: Record<string, any> = {};
let mockActiveThreadId: string | null = null;
const mockCreateThread = vi.fn((opts: any) => 'new-thread-id');

vi.mock('../../../stores/threadStore', () => ({
  useThreadStore: (selector: (s: any) => any) =>
    selector({
      threads: mockThreads,
      activeThreadId: mockActiveThreadId,
      searchQuery: '',
      setSearchQuery: vi.fn(),
      createThread: mockCreateThread,
    }),
}));

vi.mock('../../../stores/useChatStore', () => ({
  switchThread: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback,
  }),
}));

describe('ConversationListPanel', () => {
  beforeEach(() => {
    // 清空并重置 mock 数据
    Object.keys(mockThreads).forEach((k) => delete mockThreads[k]);
    mockActiveThreadId = null;
    mockCreateThread.mockClear();
  });

  // CLP-1: Agent 数量从 thread.agentTasks.length 获取
  it('CLP-1: Agent 数量从 thread.agentTasks.length 获取', () => {
    mockThreads['t1'] = {
      id: 't1',
      title: 'Test Thread',
      status: 'active',
      messageCount: 5,
      updatedAt: Date.now(),
      agentTasks: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
    };

    render(<ConversationListPanel />);

    expect(screen.getByText('3个Agent')).toBeTruthy();
  });

  // CLP-2: 3 个 agentTasks 时显示 "3个Agent"
  it('CLP-2: 3 个 agentTasks 时显示 "3个Agent"', () => {
    mockThreads['t1'] = {
      id: 't1',
      title: 'Test',
      status: 'active',
      messageCount: 0,
      updatedAt: Date.now(),
      agentTasks: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
    };

    render(<ConversationListPanel />);

    expect(screen.getByText('3个Agent')).toBeTruthy();
  });

  // CLP-3: 0 个 agentTasks 时不显示 Agent 数量
  it('CLP-3: 0 个 agentTasks 时不显示 Agent 数量', () => {
    mockThreads['t1'] = {
      id: 't1',
      title: 'Test',
      status: 'active',
      messageCount: 0,
      updatedAt: Date.now(),
      agentTasks: [],
    };

    render(<ConversationListPanel />);

    expect(screen.queryByText(/Agent/)).toBeNull();
  });

  // CLP-4: active 状态颜色用 STATUS_PALETTE.active
  it('CLP-4: active 状态颜色用 inline style 来自 STATUS_PALETTE', () => {
    mockThreads['t1'] = {
      id: 't1',
      title: 'Test',
      status: 'active',
      messageCount: 0,
      updatedAt: Date.now(),
      agentTasks: [],
    };

    const { container } = render(<ConversationListPanel />);
    const statusLabel = container.querySelector('[data-status="active"]');

    expect(statusLabel).toBeTruthy();
    // active → success → #10B981
    expect((statusLabel as HTMLElement).style.backgroundColor).toBe('#10B981');
  });

  // CLP-5: completed 状态颜色用 STATUS_PALETTE.completed
  it('CLP-5: completed 状态颜色用 inline style 来自 STATUS_PALETTE', () => {
    mockThreads['t1'] = {
      id: 't1',
      title: 'Test',
      status: 'completed',
      messageCount: 0,
      updatedAt: Date.now(),
      agentTasks: [],
    };

    const { container } = render(<ConversationListPanel />);
    const statusLabel = container.querySelector('[data-status="completed"]');

    expect(statusLabel).toBeTruthy();
    // completed → neutral → #6B7280
    expect((statusLabel as HTMLElement).style.backgroundColor).toBe('#6B7280');
  });

  // CLP-6: pending 状态颜色用 STATUS_PALETTE.pending
  it('CLP-6: pending 状态颜色用 inline style 来自 STATUS_PALETTE', () => {
    mockThreads['t1'] = {
      id: 't1',
      title: 'Test',
      status: 'pending',
      messageCount: 0,
      updatedAt: Date.now(),
      agentTasks: [],
    };

    const { container } = render(<ConversationListPanel />);
    const statusLabel = container.querySelector('[data-status="pending"]');

    expect(statusLabel).toBeTruthy();
    // pending → warning → #F59E0B
    expect((statusLabel as HTMLElement).style.backgroundColor).toBe('#F59E0B');
  });

  // CLP-7: 状态标签中文（工作中/已完成/待处理）
  it('CLP-7: 状态标签中文', () => {
    mockThreads['t1'] = {
      id: 't1',
      title: 'Active',
      status: 'active',
      messageCount: 0,
      updatedAt: Date.now(),
      agentTasks: [],
    };
    mockThreads['t2'] = {
      id: 't2',
      title: 'Completed',
      status: 'completed',
      messageCount: 0,
      updatedAt: Date.now(),
      agentTasks: [],
    };
    mockThreads['t3'] = {
      id: 't3',
      title: 'Pending',
      status: 'pending',
      messageCount: 0,
      updatedAt: Date.now(),
      agentTasks: [],
    };

    render(<ConversationListPanel />);

    expect(screen.getByText('工作中')).toBeTruthy();
    expect(screen.getByText('已完成')).toBeTruthy();
    expect(screen.getByText('待处理')).toBeTruthy();
  });

  // CLP-8: STATUS_PALETTE ColorQuad → inline style
  it('CLP-8: 状态颜色使用 inline style 而非 Tailwind 动态 class', () => {
    mockThreads['t1'] = {
      id: 't1',
      title: 'Test',
      status: 'active',
      messageCount: 0,
      updatedAt: Date.now(),
      agentTasks: [],
    };

    const { container } = render(<ConversationListPanel />);
    const statusLabel = container.querySelector('[data-status="active"]');

    // 应该使用 inline style
    expect((statusLabel as HTMLElement).style.backgroundColor).toBe('#10B981');
    // 不应该有 bg-[xxx] 的 Tailwind 类
    expect((statusLabel as HTMLElement).className).not.toContain('bg-[');
  });

  // CLP-9: 删除 MOCK_AGENT_COUNT（验证模块不导出）
  it('CLP-9: 模块不导出 MOCK_AGENT_COUNT', async () => {
    const module = await import('../ConversationListPanel');
    expect((module as any).MOCK_AGENT_COUNT).toBeUndefined();
  });

  // CLP-10: 删除 STATUS_STYLE（验证模块不导出）
  it('CLP-10: 模块不导出 STATUS_STYLE', async () => {
    const module = await import('../ConversationListPanel');
    expect((module as any).STATUS_STYLE).toBeUndefined();
  });

  // CLP-11: 搜索功能正常
  it('CLP-11: 渲染搜索输入框', () => {
    render(<ConversationListPanel />);

    expect(screen.getByPlaceholderText('搜索对话...')).toBeTruthy();
  });

  // CLP-12: 新建对话按钮正常
  it('CLP-12: 新建对话按钮正常', () => {
    render(<ConversationListPanel />);

    const btn = screen.getByText('新建对话');
    expect(btn).toBeTruthy();
  });

  // CLP-13: 对话卡片点击切换正常
  it('CLP-13: 对话卡片点击调用 switchThread', async () => {
    const { switchThread } = await import('../../../stores/useChatStore');
    mockThreads['t1'] = {
      id: 't1',
      title: 'Clickable Thread',
      status: 'active',
      messageCount: 1,
      updatedAt: Date.now(),
      agentTasks: [],
    };

    render(<ConversationListPanel />);

    fireEvent.click(screen.getByText('Clickable Thread'));
    expect(switchThread).toHaveBeenCalledWith('t1');
  });
});
