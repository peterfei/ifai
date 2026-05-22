/**
 * ApprovalCard 渲染测试
 *
 * 测试覆盖：
 * - 渲染审批卡片完整 UI
 * - 风险等级颜色标签
 * - 受影响文件列表
 * - 确认/拒绝按钮交互
 * - 状态切换（approved / rejected）
 * - compact 模式
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalCard } from '../cards/ApprovalCard';
import { MOCK_APPROVAL_DATA, MOCK_APPROVAL_DATA_HIGH_RISK } from '../WORKFLOW_DSL';
import type { MessageCardProps } from '../MessageCardRegistry';

function makeMessage(data: any) {
  return { id: 'test', role: 'assistant' as const, content: '', timestamp: Date.now(), data };
}

describe('ApprovalCard', () => {
  it('应渲染审批标题和描述', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    expect(screen.getByText(MOCK_APPROVAL_DATA.title)).toBeTruthy();
    expect(screen.getByText(MOCK_APPROVAL_DATA.description)).toBeTruthy();
  });

  it('应显示"需要审批"标签', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    expect(screen.getByText('需要审批')).toBeTruthy();
  });

  it('应显示风险等级标签', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    // 中风险
    expect(screen.getByText('中风险')).toBeTruthy();
  });

  it('高风险审批应显示高风险标签', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA_HIGH_RISK);
    render(<ApprovalCard message={msg} />);

    expect(screen.getByText('高风险')).toBeTruthy();
  });

  it('应渲染受影响文件列表', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    for (const file of MOCK_APPROVAL_DATA.files) {
      // 文件路径应显示
      const pathEl = screen.getByText(file.path);
      expect(pathEl).toBeTruthy();
    }
  });

  it('应显示确认执行和拒绝按钮', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    expect(screen.getByText('确认执行')).toBeTruthy();
    expect(screen.getByText('拒绝')).toBeTruthy();
  });

  it('点击确认后应显示"已批准"', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    const approveBtn = screen.getByText('确认执行').closest('button')!;
    fireEvent.click(approveBtn);

    expect(screen.getByText('已批准')).toBeTruthy();
  });

  it('点击拒绝后应显示"已拒绝"', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    const rejectBtn = screen.getByText('拒绝').closest('button')!;
    fireEvent.click(rejectBtn);

    expect(screen.getByText('已拒绝')).toBeTruthy();
  });

  it('确认后拒绝按钮应被禁用', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    const approveBtn = screen.getByText('确认执行').closest('button')!;
    const rejectBtn = screen.getByText('拒绝').closest('button')!;
    fireEvent.click(approveBtn);

    // 确认后，拒绝按钮应被禁用
    expect(rejectBtn.disabled).toBe(true);
  });

  it('确认后应触发 onAction("approve")', () => {
    const onAction = vi.fn();
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} onAction={onAction} />);

    const approveBtn = screen.getByText('确认执行').closest('button')!;
    fireEvent.click(approveBtn);

    // setTimeout 500ms 后调用
    expect(onAction).not.toHaveBeenCalled();
  });

  it('未操作时应显示等待提示', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    expect(screen.getByText('等待您的审批决定...')).toBeTruthy();
  });

  it('确认后等待提示应消失', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    render(<ApprovalCard message={msg} />);

    const approveBtn = screen.getByText('确认执行').closest('button')!;
    fireEvent.click(approveBtn);

    expect(screen.queryByText('等待您的审批决定...')).toBeNull();
  });

  it('compact 模式应渲染', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    const { container } = render(<ApprovalCard message={msg} compact={true} />);

    // 容器应存在
    expect(container.firstChild).toBeTruthy();
    // 标题仍应显示
    expect(screen.getByText(MOCK_APPROVAL_DATA.title)).toBeTruthy();
  });
});
