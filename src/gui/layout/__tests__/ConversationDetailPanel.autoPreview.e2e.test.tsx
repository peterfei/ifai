/**
 * ConversationDetailPanel 自动预览 E2E 测试
 *
 * 高保真还原完整链路：
 *   chat:tool:completed → computeArtifacts → evaluateTriggers
 *   → auto:open → setSelectedFile + setActiveTab('preview')
 *
 * APE2E-1 ~ APE2E-5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// =============================================================
// Mocks for non-UI dependencies
// =============================================================

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class {
    label: string;
    constructor(label: string) { this.label = label; }
    async close() {}
  },
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalSize: vi.fn(),
}));

vi.mock('../../../stores/fileStore', () => ({
  useFileStore: (selector?: any) => {
    const state = { rootPath: '/home/user/project' };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: Object.assign(
    (selector?: any) => selector ? selector({ currentModel: 'gpt-4' }) : { currentModel: 'gpt-4' },
    { getState: () => ({ currentModel: 'gpt-4' }) }
  ),
}));

// Mock tokenCounter to avoid complex dependencies
vi.mock('../../../utils/tokenCounter', () => ({
  getModelMaxTokens: () => 128000,
  formatTokenCount: (n: number) => `${n}`,
  calculateTokenUsagePercentage: () => 0,
}));

// =============================================================
// Test helpers
// =============================================================

/** 创建 toolCall 结构（匹配 StoreMapper 写入 store 后的格式） */
function makeToolCall(overrides: {
  id?: string;
  tool: string;
  result: string;
  name: string;
  path: string;
}) {
  const id = overrides.id || `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    type: 'function',
    tool: overrides.tool,
    args: '{}',
    function: { name: overrides.tool, arguments: '{}' },
    status: 'completed',
    result: overrides.result,
    isPartial: false,
    batchId: 'batch-1',
  };
}

/** 创建 agent_write_file 的 result JSON */
function writeFileResult(path: string, content: string) {
  return JSON.stringify({
    filePath: path,
    newContent: content,
    originalContent: '',
  });
}

/** 创建 write_file 的 result 字符串 */
function writeFileLegacyResult(path: string, lines: number) {
  return `wrote to file: ${path}\n${lines} lines written`;
}

// =============================================================
// Test
// =============================================================

describe('ConversationDetailPanel 自动预览 E2E', () => {
  let chatEventBus: any;
  let useChatStore: any;
  let ConversationDetailPanel: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // 重置模块
    const modules = [
      '../../../stores/chat/eventBus/ChatEventBus',
      '../../../stores/useChatStore',
      '../../../stores/threadStore',
      '../../../stores/conversationStore',
    ];
    for (const mod of modules) {
      const m = await import(mod);
      // 重置 zustand store
      if (m.useChatStore) {
        useChatStore = m.useChatStore;
        useChatStore.setState({
          messages: [],
          isLoading: false,
          activeThreadId: null,
          chatStatus: 'idle',
        } as any);
      }
      if (m.useThreadStore) {
        m.useThreadStore.setState({
          threads: {},
          activeThreadId: null,
        } as any);
      }
      if (m.useConversationStore) {
        m.useConversationStore.setState({
          tokenStats: null,
        } as any);
      }
    }

    const eventBusModule = await import('../../../stores/chat/eventBus/ChatEventBus');
    chatEventBus = eventBusModule.chatEventBus;

    const panelModule = await import('../ConversationDetailPanel');
    ConversationDetailPanel = panelModule.ConversationDetailPanel;
  });

  afterEach(() => {
    // 清理渲染
    document.body.innerHTML = '';
  });

  // APE2E-1: chat:tool:completed 事件 → 自动预览 HTML 文件
  it('APE2E-1: chat:tool:completed → 自动预览 HTML 文件', async () => {
    useChatStore.setState({
      messages: [{
        id: 'msg-1',
        role: 'assistant',
        content: '',
        toolCalls: [makeToolCall({
          tool: 'agent_write_file',
          path: '/home/user/project/index.html',
          result: writeFileResult('/home/user/project/index.html', '<html><body>Hello</body></html>'),
          name: 'agent_write_file',
        })],
        timestamp: Date.now(),
      }],
    });

    render(React.createElement(ConversationDetailPanel));

    // 初始状态应该是 'log' tab
    const fileTab = screen.getByText('预览');
    expect(fileTab).toBeTruthy();

    // 触发 chat:tool:completed — 这应该触发自动预览
    chatEventBus.emit('chat:tool:completed', {
      correlationId: 'corr-1',
      sessionId: 'session-1',
      timestamp: Date.now(),
      toolId: 'tc-1',
      result: writeFileResult('/home/user/project/index.html', '<html><body>Hello</body></html>'),
    });

    // 等待 React 状态更新
    await vi.waitFor(() => {
      // 预览标签应处于激活态（parent button 应有 text-white class）
      const previewBtn = screen.getByText('预览').closest('button');
      expect(previewBtn?.className).toContain('text-white');
    }, { timeout: 2000 });
  });

  // APE2E-2: 非 HTML 文件不触发自动预览
  it('APE2E-2: 非 HTML 工具结果不触发自动预览', async () => {
    useChatStore.setState({
      messages: [{
        id: 'msg-2',
        role: 'assistant',
        content: '',
        toolCalls: [makeToolCall({
          tool: 'agent_write_file',
          path: '/home/user/project/src/app.ts',
          result: writeFileResult('/home/user/project/src/app.ts', 'const x = 1;'),
          name: 'agent_write_file',
        })],
        timestamp: Date.now(),
      }],
    });

    render(React.createElement(ConversationDetailPanel));

    chatEventBus.emit('chat:tool:completed', {
      correlationId: 'corr-2',
      sessionId: 'session-1',
      timestamp: Date.now(),
      toolId: 'tc-2',
      result: writeFileResult('/home/user/project/src/app.ts', 'const x = 1;'),
    });

    // 等待一小段时间确保 React 更新
    await new Promise((r) => setTimeout(r, 500));

    // 预览标签应不处于激活态（初始 tab 是 'log'）
    const previewBtn = screen.getByText('预览').closest('button');
    expect(previewBtn?.className).not.toContain('text-white');
  });

  // APE2E-3: workflow:completed 作为 fallback 触发自动预览
  it('APE2E-3: workflow:completed fallback 触发预览', async () => {
    // 先写入 store，模拟 tool result 已在 messages 中
    useChatStore.setState({
      messages: [{
        id: 'msg-3',
        role: 'assistant',
        content: '',
        toolCalls: [makeToolCall({
          tool: 'write_file',
          path: '/home/user/project/game.html',
          result: writeFileLegacyResult('/home/user/project/game.html', 200),
          name: 'write_file',
        })],
        timestamp: Date.now(),
      }],
    });

    render(React.createElement(ConversationDetailPanel));

    // 触发 workflow:completed
    chatEventBus.emit('workflow:completed' as any, {
      workflow_id: 'wf-1',
      status: 'completed',
      started_at: Date.now() - 5000,
      completed_at: Date.now(),
    });

    await vi.waitFor(() => {
      const previewBtn = screen.getByText('预览').closest('button');
      expect(previewBtn?.className).toContain('text-white');
    }, { timeout: 5000 });
  });

  // APE2E-4: 重复触发只预览一次（已预览的文件不重复触发）
  it('APE2E-4: 重复触发不重复预览', async () => {
    useChatStore.setState({
      messages: [{
        id: 'msg-4',
        role: 'assistant',
        content: '',
        toolCalls: [makeToolCall({
          tool: 'agent_write_file',
          path: '/home/user/project/page.html',
          result: writeFileResult('/home/user/project/page.html', '<html></html>'),
          name: 'agent_write_file',
        })],
        timestamp: Date.now(),
      }],
    });

    const { rerender } = render(React.createElement(ConversationDetailPanel));

    // 第一次触发
    chatEventBus.emit('chat:tool:completed', {
      correlationId: 'corr-4',
      sessionId: 'session-1',
      timestamp: Date.now(),
      toolId: 'tc-4',
      result: writeFileResult('/home/user/project/page.html', '<html></html>'),
    });

    await vi.waitFor(() => {
      const previewBtn = screen.getByText('预览').closest('button');
      expect(previewBtn?.className).toContain('text-white');
    }, { timeout: 2000 });

    // 手动切回 log tab
    const logBtn = screen.getByText('工作日志').closest('button')!;
    logBtn.click();
    await new Promise((r) => setTimeout(r, 100));
    expect(logBtn.className).toContain('text-white');

    // 第二次用相同 HTML 触发 — 不应再切到 preview
    chatEventBus.emit('chat:tool:completed', {
      correlationId: 'corr-4b',
      sessionId: 'session-1',
      timestamp: Date.now(),
      toolId: 'tc-4b',
      result: writeFileResult('/home/user/project/page.html', '<html></html>'),
    });

    await new Promise((r) => setTimeout(r, 500));
    // 应该仍在 log tab
    expect(logBtn.className).toContain('text-white');
  });

  // APE2E-5: 无 toolCalls 时 events 不触发预览
  it('APE2E-5: 无 toolCalls 不触发预览', async () => {
    useChatStore.setState({
      messages: [{
        id: 'msg-5',
        role: 'assistant',
        content: '只是一段文本回复',
        toolCalls: [],
        timestamp: Date.now(),
      }],
    });

    render(React.createElement(ConversationDetailPanel));

    chatEventBus.emit('chat:tool:completed', {
      correlationId: 'corr-5',
      sessionId: 'session-1',
      timestamp: Date.now(),
      toolId: 'tc-5',
      result: 'some result',
    });

    await new Promise((r) => setTimeout(r, 500));

    const previewBtn = screen.getByText('预览').closest('button');
    expect(previewBtn?.className).not.toContain('text-white');
  });

  // APE2E-6: 组件卸载后事件不报错
  it('APE2E-6: 组件卸载后事件不报错', async () => {
    useChatStore.setState({
      messages: [{
        id: 'msg-6',
        role: 'assistant',
        content: '',
        toolCalls: [makeToolCall({
          tool: 'agent_write_file',
          path: '/home/user/project/index.html',
          result: writeFileResult('/home/user/project/index.html', '<html></html>'),
          name: 'agent_write_file',
        })],
        timestamp: Date.now(),
      }],
    });

    const { unmount } = render(React.createElement(ConversationDetailPanel));
    unmount();

    // 卸载后 emit 不应 throw
    expect(() => {
      chatEventBus.emit('chat:tool:completed', {
        correlationId: 'corr-6',
        sessionId: 'session-1',
        timestamp: Date.now(),
        toolId: 'tc-6',
        result: writeFileResult('/home/user/project/index.html', '<html></html>'),
      });
    }).not.toThrow();
  });
});
