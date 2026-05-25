/**
 * ToolApproval 审批生命周期测试 (TDD)
 *
 * 覆盖工具调用从 pending → approved → executing → completed 的状态流转：
 *
 * TA-1: pending 工具应渲染确认/拒绝按钮
 * TA-2: 点击确认按钮应调用 approveToolCall
 * TA-3: approveToolCall 应将状态更新为 executing
 * TA-4: chat:tool:completed 后状态应更新为 completed
 * TA-5: 非 pending 状态不应渲染确认/拒绝按钮
 * TA-6: 应该渲染审批流程组件（验证 ToolApproval 确实在 pending 时渲染）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------- Mock stores ----------

const mockApproveToolCall = vi.fn();
const mockRejectToolCall = vi.fn();

const storeState = {
  isLoading: false,
  messages: [],
  approveToolCall: mockApproveToolCall,
  rejectToolCall: mockRejectToolCall,
  rollbackToolCall: vi.fn(),
};

vi.mock('../../../stores/useChatStore', () => ({
  useChatStore: Object.assign(
    // 支持 selector 调用和无参调用（const chatStore = useChatStore()）
    (selector?: (s: any) => any) =>
      selector ? selector(storeState) : storeState,
    {
      getState: () => storeState,
      setState: vi.fn(),
    }
  ),
  ToolCall: {},
}));

const settingsState = {
  enableTypewriterEffect: false,
  transparencyLevel: 'normal',
  agentApprovalMode: 'manual',
  agentAutoApprove: false,
};

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: Object.assign(
    // 支持 selector 调用和无参调用（const settings = useSettingsStore()）
    (selector?: (s: any) => any) =>
      selector ? selector(settingsState) : settingsState,
    { getState: () => settingsState }
  ),
}));

vi.mock('../../../stores/layoutStore', () => ({
  useLayoutStore: () => ({ editorMode: 'standard' }),
}));

vi.mock('../../../stores/fileStore', () => ({
  useFileStore: { getState: () => ({ rootPath: '/test' }) },
}));

vi.mock('../../../stores/threadStore', () => ({
  useThreadStore: { getState: () => ({ activeThreadId: 'test-thread' }) },
}));

vi.mock('../../../stores/pivoStore', () => ({
  usePivoStore: () => ({ taskTrees: {}, activeMessageId: null }),
}));

vi.mock('../../../core/approval/store/useApprovalStore', () => ({
  useApprovalStore: () => ({ items: {} }),
}));

vi.mock('../../../core/approval/ToolApprovalRegistry', () => ({
  toolApprovalRegistry: {
    categorizeTool: () => 'safe',
    calculateRisk: () => 'low',
    isAggregatable: () => false,
  },
  RiskLevel: {},
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'toolApproval.status.pending': '等待中',
        'toolApproval.status.completed': '已完成',
        'toolApproval.status.approved': '已批准',
        'toolApproval.status.executing': '执行中',
        'toolApproval.status.failed': '失败',
        'toolApproval.status.rejected': '已拒绝',
        'toolApproval.status.generating': '生成中',
        'toolApproval.risk.low': '低风险',
        'toolApproval.risk.medium': '中风险',
        'toolApproval.risk.high': '高风险',
        'toolApproval.fileTree.write': '写入',
        'toolApproval.fileTree.access': '访问',
        'toolApproval.sections.parameters': '参数',
        'toolApproval.preview.directoryScanning': '正在扫描目录...',
        'toolApproval.status.generatingShort': '生成',
        'toolApproval.status.executingOperation': '正在执行操作...',
        'toolApproval.status.writingFile': '正在写入文件...',
        'toolApproval.result.title': '执行结果',
        'toolApproval.result.successStatus': '成功',
        'toolApproval.result.failedStatus': '失败',
        'toolApproval.result.failedTitle': '执行失败',
        'toolApproval.result.runningStatus': '运行中',
      };
      return map[key] || key;
    },
    i18n: { language: 'zh' },
  }),
}));

vi.mock('../../../utils/fileSystem', () => ({
  readFileContent: vi.fn().mockResolvedValue(''),
}));

vi.mock('ifainew-core', () => ({
  getToolLabel: (name: string) => name,
  getToolColor: () => 'bg-gray-700',
  parseToolCalls: (content: string) => ({ segments: [], toolCalls: [] }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// ---------- Helper ----------

function makeToolCall(overrides: Record<string, any> = {}) {
  return {
    id: 'tool-1',
    type: 'function',
    tool: 'agent_read_file',
    args: { path: '/test/file.ts' },
    function: { name: 'agent_read_file', arguments: '{"path":"/test/file.ts"}' },
    status: 'pending',
    isPartial: false,
    result: undefined,
    ...overrides,
  };
}

const defaultOnApprove = vi.fn();
const defaultOnReject = vi.fn();

async function renderToolApproval(toolCallOverrides: Record<string, any> = {}) {
  const { ToolApproval } = await import('../ToolApproval');
  const toolCall = makeToolCall(toolCallOverrides);
  const message = { id: 'msg-1', role: 'assistant', content: '', toolCalls: [toolCall] };

  const result = render(
    <ToolApproval
      toolCall={toolCall}
      onApprove={defaultOnApprove}
      onReject={defaultOnReject}
      message={message}
    />
  );

  return { ...result, toolCall };
}

// ---------- Tests ----------

describe('ToolApproval 审批生命周期', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TA-1: pending 工具应渲染确认/拒绝按钮
  it('TA-1: pending 工具应渲染确认/拒绝按钮', async () => {
    await renderToolApproval({ status: 'pending' });

    // 查找确认按钮
    const approveButtons = screen.getAllByRole('button');
    const approveBtn = approveButtons.find(btn => btn.textContent?.includes('确认执行'));
    const rejectBtn = approveButtons.find(btn => btn.textContent?.includes('拒绝'));

    expect(approveBtn).toBeTruthy();
    expect(rejectBtn).toBeTruthy();
  });

  // TA-2: 点击确认按钮应调用 useChatStore.getState().approveToolCall
  it('TA-2: 点击确认按钮应调用 approveToolCall (直调 store)', async () => {
    await renderToolApproval({ status: 'pending' });

    const approveButtons = screen.getAllByRole('button');
    const approveBtn = approveButtons.find(btn => btn.textContent?.includes('确认执行'));
    expect(approveBtn).toBeTruthy();

    fireEvent.click(approveBtn!);

    // ToolApproval 直调 useChatStore.getState().approveToolCall，不走 props
    expect(mockApproveToolCall).toHaveBeenCalledWith('msg-1', 'tool-1');
  });

  // TA-3: 点击拒绝按钮应调用 useChatStore.getState().rejectToolCall
  it('TA-3: 点击拒绝按钮应调用 rejectToolCall (直调 store)', async () => {
    await renderToolApproval({ status: 'pending' });

    const approveButtons = screen.getAllByRole('button');
    const rejectBtn = approveButtons.find(btn => btn.textContent?.includes('拒绝'));
    expect(rejectBtn).toBeTruthy();

    fireEvent.click(rejectBtn!);

    expect(mockRejectToolCall).toHaveBeenCalledWith('msg-1', 'tool-1');
  });

  // TA-4: completed 状态不应渲染确认/拒绝按钮
  it('TA-4: completed 状态不应渲染确认/拒绝按钮', async () => {
    await renderToolApproval({
      status: 'completed',
      result: JSON.stringify({ status: 'ok', content: 'file content' }),
    });

    const approveButtons = screen.getAllByRole('button');
    const approveBtn = approveButtons.find(btn => btn.textContent?.includes('确认执行'));
    const rejectBtn = approveButtons.find(btn => btn.textContent?.includes('拒绝'));

    expect(approveBtn).toBeFalsy();
    expect(rejectBtn).toBeFalsy();
  });

  // TA-5: executing 状态不应渲染确认/拒绝按钮
  it('TA-5: executing 状态不应渲染确认/拒绝按钮', async () => {
    await renderToolApproval({ status: 'executing' });

    const approveButtons = screen.getAllByRole('button');
    const approveBtn = approveButtons.find(btn => btn.textContent?.includes('确认执行'));
    const rejectBtn = approveButtons.find(btn => btn.textContent?.includes('拒绝'));

    expect(approveBtn).toBeFalsy();
    expect(rejectBtn).toBeFalsy();
  });

  // TA-6: pending 状态应显示"等待中"标签
  it('TA-6: pending 状态应显示"等待中"状态标签', async () => {
    await renderToolApproval({ status: 'pending' });

    const statusBadge = screen.getByTestId('status-badge');
    expect(statusBadge.textContent).toContain('等待中');
  });

  // TA-7: completed 状态应显示"已完成"标签
  it('TA-7: completed 状态应显示"已完成"状态标签', async () => {
    await renderToolApproval({
      status: 'completed',
      result: JSON.stringify({ status: 'ok' }),
    });

    const statusBadge = screen.getByTestId('status-badge');
    expect(statusBadge.textContent).toContain('已完成');
  });

  // TA-8: 验证 ToolApproval 组件在 pending 时整体渲染（data-testid）
  it('TA-8: pending 工具应渲染 ToolApproval 容器', async () => {
    const { container } = await renderToolApproval({ status: 'pending' });

    const cardEl = container.querySelector('[data-test-id="tool-approval-card"]');
    expect(cardEl).toBeTruthy();
  });
});
