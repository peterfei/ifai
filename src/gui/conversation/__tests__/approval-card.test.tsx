/**
 * ApprovalCard 渲染测试
 *
 * 测试覆盖：
 * - 渲染审批卡片完整 UI
 * - 风险等级颜色标签
 * - 受影响文件列表
 * - compact 模式
 * - 注：确认/拒绝按钮已移至 MessageItem 底部操作栏（见 hasApprovalCard 守卫）
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApprovalCard } from '../cards/ApprovalCard';
import { MOCK_APPROVAL_DATA, MOCK_APPROVAL_DATA_HIGH_RISK } from '../WORKFLOW_DSL';

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

  it('compact 模式应渲染', () => {
    const msg = makeMessage(MOCK_APPROVAL_DATA);
    const { container } = render(<ApprovalCard message={msg} compact={true} />);

    // 容器应存在
    expect(container.firstChild).toBeTruthy();
    // 标题仍应显示
    expect(screen.getByText(MOCK_APPROVAL_DATA.title)).toBeTruthy();
  });
});
