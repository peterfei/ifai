/**
 * ApprovalCard 数据驱动决策测试
 *
 * 提案 Phase 2: ApprovalCard 从 Rust 获取可用决策选项，遍历渲染
 *
 * 测试覆盖：
 * - AC-1: available_decisions 返回选项 → 渲染对应按钮
 * - AC-2: "始终允许" → invoke add_rule + onAction approve
 * - AC-3: "本次会话允许" → invoke add_session_rule + onAction approve
 * - AC-4: "拒绝" → onAction reject
 * - AC-5: 无 toolName → 向后兼容固定按钮
 * - AC-6: 等待 Rust 返回期间显示加载态
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalCard } from '../ApprovalCard';
import type { ApprovalData } from '../../WORKFLOW_DSL';

/* ===== 本地 mock invoke — 覆盖全局 mock ===== */
// vi.hoisted 确保在 vi.mock hoist 前初始化
const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

/* ===== Mock 基础数据 ===== */

const BASE_DATA: ApprovalData = {
  type: 'code_review',
  title: '重构认证模块',
  description: '将 JWT 认证逻辑从 handlers 提取到独立模块',
  overallRisk: 'medium',
  files: [
    { path: 'src/auth/jwt.ts', change: '+42 -18', risk: 'low' },
    { path: 'src/handlers/login.ts', change: '+15 -30', risk: 'medium' },
  ],
  onApprove: 'continue',
  onReject: 'stop',
};

/** dangerous 级别: 3 个选项 */
const DECISIONS_DANGEROUS = JSON.stringify([
  { type: 'once',    label: '允许本次',         icon: '✅' },
  { type: 'session', label: '本次会话允许',     icon: '🔄' },
  { type: 'deny',    label: '拒绝',             icon: '✗' },
]);

/** destructive 级别: 4 个选项 */
const DECISIONS_DESTRUCTIVE = JSON.stringify([
  { type: 'once',    label: '允许本次',             icon: '✅' },
  { type: 'always',  label: '始终允许 "agent":*',  icon: '🔁' },
  { type: 'session', label: '本次会话允许',         icon: '🔄' },
  { type: 'deny',    label: '拒绝',                 icon: '✗' },
]);

/* ===== Test Suite ===== */

describe('ApprovalCard 数据驱动决策', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    // 默认: dangerous 级别返回 3 个选项
    mockInvoke.mockResolvedValue(DECISIONS_DANGEROUS);
  });

  /* ===== AC-1: 从 Rust 获取决策列表并渲染 ===== */

  it('AC-1: available_decisions 返回 3 个选项 → 渲染 3 个按钮', async () => {
    const data: ApprovalData & { toolName?: string; toolCategory?: string } = {
      ...BASE_DATA,
      toolName: 'agent_write_file',
      toolCategory: 'dangerous',
    };
    render(<ApprovalCard message={{ data, id: 'test-ac1' }} />);

    expect(await screen.findByText('允许本次', { exact: false })).toBeTruthy();
    expect(await screen.findByText('本次会话允许', { exact: false })).toBeTruthy();
    expect(await screen.findByText('拒绝', { exact: false })).toBeTruthy();
  });

  it('AC-1b: destructive 级别返回 4 个选项 → 包含始终允许', async () => {
    mockInvoke.mockResolvedValue(DECISIONS_DESTRUCTIVE);

    const data: ApprovalData & { toolName?: string; toolCategory?: string } = {
      ...BASE_DATA,
      toolName: 'agent_bash',
      toolCategory: 'destructive',
    };
    render(<ApprovalCard message={{ data, id: 'test-ac1b' }} />);

    expect(await screen.findByText('允许本次', { exact: false })).toBeTruthy();
    expect(await screen.findByText('始终允许', { exact: false })).toBeTruthy();
    expect(await screen.findByText('本次会话允许', { exact: false })).toBeTruthy();
    expect(await screen.findByText('拒绝', { exact: false })).toBeTruthy();
  });

  /* ===== AC-2: "始终允许" → add_rule ===== */

  it('AC-2: 点击始终允许 → invoke add_rule + onAction approve', async () => {
    mockInvoke.mockResolvedValue(DECISIONS_DESTRUCTIVE);

    const onAction = vi.fn();
    const data: ApprovalData & { toolName?: string; toolCategory?: string; argsPreview?: string } = {
      ...BASE_DATA,
      toolName: 'agent_bash',
      toolCategory: 'destructive',
      argsPreview: 'git diff',
    };
    render(<ApprovalCard message={{ data, id: 'test-ac2' }} onAction={onAction} />);

    expect(await screen.findByText('始终允许', { exact: false })).toBeTruthy();

    // 清除 invoke 调用记录（第一次调用是 available_decisions）
    mockInvoke.mockClear();
    fireEvent.click(screen.getByText('始终允许', { exact: false }));

    // add_rule 被调用
    expect(mockInvoke).toHaveBeenCalledWith(
      'permission_invoke',
      { action: 'add_rule', payload: expect.stringContaining('agent_bash') },
    );
    // 同时批准
    expect(onAction).toHaveBeenCalledWith('approve', { toolCallId: 'test-ac2' });
  });

  /* ===== AC-3: "本次会话允许" → add_session_rule ===== */

  it('AC-3: 点击本次会话允许 → invoke add_session_rule + onAction approve', async () => {
    const onAction = vi.fn();
    const data: ApprovalData & { toolName?: string } = {
      ...BASE_DATA,
      toolName: 'agent_bash',
    };
    render(<ApprovalCard message={{ data, id: 'test-ac3' }} onAction={onAction} />);

    expect(await screen.findByText('本次会话允许', { exact: false })).toBeTruthy();

    // 清除 invoke 调用记录
    mockInvoke.mockClear();
    fireEvent.click(screen.getByText('本次会话允许', { exact: false }));

    expect(mockInvoke).toHaveBeenCalledWith(
      'permission_invoke',
      { action: 'add_session_rule', payload: expect.any(String) },
    );
    expect(onAction).toHaveBeenCalledWith('approve', { toolCallId: 'test-ac3' });
  });

  /* ===== AC-4: "拒绝" → onAction reject ===== */

  it('AC-4: 点击拒绝 → onAction reject', async () => {
    const onAction = vi.fn();
    const data: ApprovalData & { toolName?: string } = {
      ...BASE_DATA,
      toolName: 'agent_write_file',
    };
    render(<ApprovalCard message={{ data, id: 'test-ac4' }} onAction={onAction} />);

    expect(await screen.findByText('拒绝', { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByText('拒绝', { exact: false }));

    expect(onAction).toHaveBeenCalledWith('reject', { toolCallId: 'test-ac4' });
  });

  /* ===== AC-5: 没有 toolName → 向后兼容固定按钮 ===== */

  it('AC-5: 无 toolName → 渲染硬编码的默认按钮', () => {
    render(<ApprovalCard message={{ data: BASE_DATA, id: 'test-ac5' }} />);

    // 硬编码按钮仍然显示
    expect(screen.getByText('✅ 确认执行')).toBeTruthy();
    expect(screen.getByText('❌ 拒绝')).toBeTruthy();
    // invoke 未被调用（因为没有 toolName）
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  /* ===== AC-6: 加载中状态 ===== */

  it('AC-6: 等待 Rust 返回期间显示加载态文本', () => {
    // 返回永不 resolve 的 Promise
    mockInvoke.mockReturnValue(new Promise(() => {}));

    const data: ApprovalData & { toolName?: string } = {
      ...BASE_DATA,
      toolName: 'agent_bash',
    };
    render(<ApprovalCard message={{ data, id: 'test-ac6' }} />);

    // 加载态文本出现（可能在按钮行和等待指示器等位置多次出现）
    const loadingEls = screen.getAllByText('获取审批选项...');
    expect(loadingEls.length).toBeGreaterThanOrEqual(1);
    // 加载时不显示固定按钮
    expect(screen.queryByText('✅ 确认执行')).toBeNull();
    expect(screen.queryByText('❌ 拒绝')).toBeNull();
  });

  /* ===== invoke 调用参数验证 ===== */

  it('AC-6b: toolName 存在时调用 available_decisions 参数正确', async () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(DECISIONS_DANGEROUS);

    const data: ApprovalData & { toolName?: string; argsPreview?: string; toolCategory?: string } = {
      ...BASE_DATA,
      toolName: 'agent_write_file',
      argsPreview: 'src/main.ts',
      toolCategory: 'dangerous',
    };
    render(<ApprovalCard message={{ data, id: 'test-ac6b' }} />);

    expect(await screen.findByText('允许本次', { exact: false })).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledWith('permission_invoke', {
      action: 'available_decisions',
      payload: expect.stringContaining('agent_write_file'),
    });
  });
});
