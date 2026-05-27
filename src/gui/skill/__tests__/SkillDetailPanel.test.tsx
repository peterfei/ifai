/**
 * SkillDetailPanel 单元测试
 *
 * 测试覆盖：
 * - 选中时渲染详情
 * - System Prompt 可折叠
 * - 无选中时隐藏
 * - 安装按钮
 * - 关闭回调
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillDetailPanel } from '../SkillDetailPanel';

const mockSkill = {
  id: 'test-skill',
  name: '测试技能',
  description: '这是一个测试技能的详细描述',
  version: '1.0.0',
  systemPrompt: '你是一个测试助手，专门用于测试。\n- 功能1\n- 功能2',
  tags: ['test', 'e2e'],
  rating: 4.5,
  downloads: 6234,
};

describe('SkillDetailPanel', () => {
  const defaultProps = {
    skill: mockSkill,
    onClose: vi.fn(),
    onInstall: vi.fn(),
    onUninstall: vi.fn(),
  };

  // #52: 选中时渲染详情
  it('选中技能时显示名称、版本和描述', () => {
    render(<SkillDetailPanel {...defaultProps} />);
    expect(screen.getByText('测试技能')).toBeDefined();
    expect(screen.getByText(/1\.0\.0/)).toBeDefined();
    expect(
      screen.getByText('这是一个测试技能的详细描述')
    ).toBeDefined();
  });

  // #53: System Prompt 可折叠
  it('System Prompt 可点击折叠/展开', () => {
    render(<SkillDetailPanel {...defaultProps} />);
    const toggle = screen.getByText('System Prompt');
    fireEvent.click(toggle);
    // 展开后内容应可见
    expect(screen.getByText(/你是一个测试助手/)).toBeDefined();
  });

  // #54: 无选中时隐藏
  it('skill 为 null 时 panel 不渲染', () => {
    const { container } = render(
      <SkillDetailPanel {...defaultProps} skill={null} />
    );
    expect(container.innerHTML).toBe('');
  });

  // #55: 安装按钮存在
  it('底部显示安装按钮', () => {
    render(<SkillDetailPanel {...defaultProps} />);
    expect(screen.getByText('安装')).toBeDefined();
  });

  // #56: 关闭回调
  it('点击关闭按钮触发 onClose', () => {
    const onClose = vi.fn();
    render(<SkillDetailPanel {...defaultProps} onClose={onClose} />);
    const closeBtn = screen.getByText('✕');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
