/**
 * ApprovalCard 增强测试 — approve/reject 交互
 *
 * 测试覆盖：
 * - 确认/拒绝按钮渲染
 * - approve/reject 交互 → onAction 回调
 * - 已批准/已拒绝 状态显示
 * - 动画 class 存在
 * - 等待指示器
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ApprovalCard } from '../cards/ApprovalCard';
import { MOCK_APPROVAL_DATA } from '../WORKFLOW_DSL';

function makeMessage(data: any) {
  return {
    id: 'test-msg-1',
    role: 'assistant' as const,
    content: '',
    timestamp: Date.now(),
    data,
  };
}

describe('ApprovalCard 增强', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  /* ===== 按钮渲染 ===== */

  it('应渲染确认执行按钮', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);
    expect(screen.getByText('确认执行', { exact: false })).toBeTruthy();
  });

  it('应渲染拒绝按钮', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);
    expect(screen.getByText('拒绝', { exact: false })).toBeTruthy();
  });

  /* ===== onAction 回调 ===== */

  it('点击确认执行 → onAction("approve") 被调用', () => {
    const onAction = vi.fn();
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} onAction={onAction} />);

    fireEvent.click(screen.getByText('确认执行', { exact: false }));
    expect(onAction).toHaveBeenCalledWith('approve', {
      toolCallId: 'test-msg-1',
    });
  });

  it('点击拒绝 → onAction("reject") 被调用', () => {
    const onAction = vi.fn();
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} onAction={onAction} />);

    fireEvent.click(screen.getByText('拒绝', { exact: false }));
    expect(onAction).toHaveBeenCalledWith('reject', {
      toolCallId: 'test-msg-1',
    });
  });

  /* ===== 已批准状态 ===== */

  it('确认执行后显示"已批准"文本', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    fireEvent.click(screen.getByText('确认执行', { exact: false }));
    expect(screen.getByText('✓已批准')).toBeTruthy();
  });

  it('确认执行后徽章变为"✅已批准"', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    fireEvent.click(screen.getByText('确认执行', { exact: false }));
    // 徽章中 emoji 和文本分属两个 span，分别检查
    expect(screen.getByText('✅')).toBeTruthy();
    expect(screen.getByText('已批准')).toBeTruthy();
  });

  it('确认执行后显示时间戳"已批准 · 自动继续"', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    fireEvent.click(screen.getByText('确认执行', { exact: false }));
    expect(screen.getByText('已批准 · 自动继续')).toBeTruthy();
  });

  /* ===== 已拒绝状态 ===== */

  it('拒绝后显示"✗已拒绝"文本', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    fireEvent.click(screen.getByText('拒绝', { exact: false }));
    expect(screen.getByText('✗已拒绝')).toBeTruthy();
  });

  it('拒绝后徽章变为"⛔已拒绝"', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    fireEvent.click(screen.getByText('拒绝', { exact: false }));
    expect(screen.getByText('⛔')).toBeTruthy();
    expect(screen.getByText('已拒绝')).toBeTruthy();
  });

  it('拒绝后显示时间戳"已拒绝 · 工作流已暂停"', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    fireEvent.click(screen.getByText('拒绝', { exact: false }));
    expect(screen.getByText('已拒绝 · 工作流已暂停')).toBeTruthy();
  });

  /* ===== 按钮状态 ===== */

  it('确认后按钮不可重复点击', () => {
    const onAction = vi.fn();
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} onAction={onAction} />);

    fireEvent.click(screen.getByText('确认执行', { exact: false }));
    // 再次点击确认按钮（已变为"✓已批准"）
    fireEvent.click(screen.getByText('✓已批准'));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('拒绝后按钮不可重复点击', () => {
    const onAction = vi.fn();
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} onAction={onAction} />);

    fireEvent.click(screen.getByText('拒绝', { exact: false }));
    fireEvent.click(screen.getByText('✗已拒绝'));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  /* ===== 等待指示器 ===== */

  it('未操作时显示等待指示器文本', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    expect(screen.getByText('等待您的审批决定...')).toBeTruthy();
  });

  it('确认后等待指示器消失', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    fireEvent.click(screen.getByText('确认执行', { exact: false }));
    expect(screen.queryByText('等待您的审批决定...')).toBeNull();
  });

  /* ===== 动画 class ===== */

  it('确认后容器包含 animate-approval-approved class', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    const { container } = render(<ApprovalCard message={msg} />);

    fireEvent.click(screen.getByText('确认执行', { exact: false }));
    expect(container.firstChild).toHaveClass('animate-approval-approved');
  });

  it('拒绝后容器包含 animate-approval-rejected class', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    const { container } = render(<ApprovalCard message={msg} />);

    fireEvent.click(screen.getByText('拒绝', { exact: false }));
    expect(container.firstChild).toHaveClass('animate-approval-rejected');
  });

  it('容器包含 animate-approval-slide class（入场动画）', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    const { container } = render(<ApprovalCard message={msg} />);

    expect(container.firstChild).toHaveClass('animate-approval-slide');
  });
});
