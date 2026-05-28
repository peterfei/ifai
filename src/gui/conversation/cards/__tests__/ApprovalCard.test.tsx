/**
 * ApprovalCard 测试
 *
 * 测试覆盖：
 * - AC-1: 渲染头部（PM 头像 + 审批徽章 + 风险标签）
 * - AC-2: 渲染描述文本
 * - AC-3: 渲染受影响文件列表
 * - AC-4: 渲染操作按钮（确认执行 / 拒绝）
 * - AC-5: approve 后显示已批准状态
 * - AC-6: reject 后显示已拒绝状态
 * - AC-7: 等待指示器
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalCard } from '../ApprovalCard';
import type { ApprovalData } from '../../WORKFLOW_DSL';

const APPROVAL_DATA: ApprovalData = {
  type: 'code_review',
  title: '重构认证模块',
  description: '将 JWT 认证逻辑从 handlers 提取到独立模块',
  overallRisk: 'medium',
  files: [
    { path: 'src/auth/jwt.ts', change: '+42 -18', risk: 'low' },
    { path: 'src/handlers/login.ts', change: '+15 -30', risk: 'medium' },
    { path: 'src/config/auth.ts', change: '+8 -2', risk: 'high' },
  ],
  onApprove: { action: 'apply_changes' },
  onReject: { action: 'discard' },
};

describe('ApprovalCard', () => {
  it('AC-1: 渲染头部（PM 头像 + 审批徽章 + 风险标签）', () => {
    render(<ApprovalCard message={{ data: APPROVAL_DATA, id: 'test-1' }} />);
    // PM 头像
    expect(screen.getByText('PM')).toBeTruthy();
    // 审批徽章
    expect(screen.getByText('需要审批')).toBeTruthy();
    // 风险标签
    expect(screen.getByText('中风险')).toBeTruthy();
  });

  it('AC-2: 渲染描述文本', () => {
    render(<ApprovalCard message={{ data: APPROVAL_DATA, id: 'test-2' }} />);
    expect(screen.getByText('将 JWT 认证逻辑从 handlers 提取到独立模块')).toBeTruthy();
    expect(screen.getByText('重构认证模块')).toBeTruthy();
  });

  it('AC-3: 渲染受影响文件列表', () => {
    render(<ApprovalCard message={{ data: APPROVAL_DATA, id: 'test-3' }} />);
    expect(screen.getByText('src/auth/jwt.ts')).toBeTruthy();
    expect(screen.getByText('src/handlers/login.ts')).toBeTruthy();
    expect(screen.getByText('src/config/auth.ts')).toBeTruthy();
    expect(screen.getByText('+42 -18')).toBeTruthy();
    expect(screen.getByText('+15 -30')).toBeTruthy();
    expect(screen.getByText('+8 -2')).toBeTruthy();
  });

  it('AC-4: 渲染操作按钮（确认执行 / 拒绝）', () => {
    render(<ApprovalCard message={{ data: APPROVAL_DATA, id: 'test-4' }} />);
    expect(screen.getByText('✅ 确认执行')).toBeTruthy();
    expect(screen.getByText('❌ 拒绝')).toBeTruthy();
    expect(screen.getByText('查看详情')).toBeTruthy();
  });

  it('AC-5: approve 后显示已批准状态，onAction 被调用', () => {
    const onAction = vi.fn();
    render(<ApprovalCard message={{ data: APPROVAL_DATA, id: 'test-5' }} onAction={onAction} />);

    fireEvent.click(screen.getByText('✅ 确认执行'));

    expect(screen.getByText('✓已批准')).toBeTruthy();
    expect(screen.getByText('已批准 · 自动继续')).toBeTruthy();
    expect(onAction).toHaveBeenCalledWith('approve', { toolCallId: 'test-5' });
  });

  it('AC-6: reject 后显示已拒绝状态', () => {
    const onAction = vi.fn();
    render(<ApprovalCard message={{ data: APPROVAL_DATA, id: 'test-6' }} onAction={onAction} />);

    fireEvent.click(screen.getByText('❌ 拒绝'));

    expect(screen.getByText('✗已拒绝')).toBeTruthy();
    expect(screen.getByText('已拒绝 · 工作流已暂停')).toBeTruthy();
    expect(onAction).toHaveBeenCalledWith('reject', { toolCallId: 'test-6' });
  });

  it('AC-7: 等待指示器', () => {
    render(<ApprovalCard message={{ data: APPROVAL_DATA, id: 'test-7' }} />);
    expect(screen.getByText('等待您的审批决定...')).toBeTruthy();
  });

  it('AC-8: approve 后等待指示器消失', () => {
    render(<ApprovalCard message={{ data: APPROVAL_DATA, id: 'test-8' }} />);
    fireEvent.click(screen.getByText('✅ 确认执行'));
    expect(screen.queryByText('等待您的审批决定...')).toBeNull();
  });

  it('AC-9: approve 后按钮消失，二次点击不可能', () => {
    const onAction = vi.fn();
    render(<ApprovalCard message={{ data: APPROVAL_DATA, id: 'test-9' }} onAction={onAction} />);

    // 第一次点击 approve
    fireEvent.click(screen.getByText('✅ 确认执行'));

    // approve 后 ✅ 确认执行按钮被替换为 ✓已批准
    expect(screen.getByText('✓已批准')).toBeTruthy();
    expect(screen.queryByText('✅ 确认执行')).toBeNull();
    // onAction 只被调用了 1 次
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
