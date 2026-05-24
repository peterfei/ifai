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
      getThread: (id: string) => mockThreads[id],
      updateThread: vi.fn(),
    }),
}));

vi.mock('../../../stores/useChatStore', () => ({
  switchThread: vi.fn(),
}));

// Mock ThreadManager
vi.mock('../../../stores/threadManager', () => ({
  ThreadManager: {
    create: vi.fn((opts: any) => 'new-thread-id'),
    switch: vi.fn(),
    updateTitle: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    initReactI18next: { type: '3rdParty', init: () => {} },
    useTranslation: () => ({
      t: (key: string, fallback: string) => fallback,
    }),
  };
});

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
    // active → info → #3B82F6
    expect((statusLabel as HTMLElement).style.backgroundColor).toBe('#3B82F6');
  });

  // CLP-5: completed 状态映射到 idle，颜色用 STATUS_PALETTE.idle
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
    // completed 被映射为 idle
    const statusLabel = container.querySelector('[data-status="idle"]');

    expect(statusLabel).toBeTruthy();
    // completed → idle → neutral → #6B7280
    expect((statusLabel as HTMLElement).style.backgroundColor).toBe('#6B7280');
  });

  // CLP-6: pending 状态映射到 idle，颜色用 STATUS_PALETTE.idle
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
    // pending 被映射为 idle
    const statusLabel = container.querySelector('[data-status="idle"]');

    expect(statusLabel).toBeTruthy();
    // pending → idle → neutral → #6B7280
    expect((statusLabel as HTMLElement).style.backgroundColor).toBe('#6B7280');
  });

  // CLP-7: 状态标签中文（活跃/空闲）
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
      title: 'Working',
      status: 'working',
      messageCount: 0,
      updatedAt: Date.now(),
      agentTasks: [],
    };

    render(<ConversationListPanel />);

    // active → '活跃'
    expect(screen.getByText('活跃')).toBeTruthy();
    // completed 映射到 idle → '空闲'
    expect(screen.getByText('空闲')).toBeTruthy();
    // working → '工作中'
    expect(screen.getByText('工作中')).toBeTruthy();
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

    // 应该使用 inline style，active 状态是蓝色 #3B82F6
    expect((statusLabel as HTMLElement).style.backgroundColor).toBe('#3B82F6');
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
  it('CLP-13: 对话卡片点击调用 ThreadManager.switch', async () => {
    const { ThreadManager } = await import('../../../stores/threadManager');
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
    expect(ThreadManager.switch).toHaveBeenCalledWith('t1');
  });
});
