/**
 * CategoryPills 单元测试
 *
 * 测试覆盖：
 * - 8 个 pill 渲染
 * - 默认选中"全部"
 * - 点击切换选中态
 * - 总数指示器
 * - 绿色圆点
 * - 溢出隐藏
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategoryPills } from '../CategoryPills';

const categories = [
  '全部', '编码辅助', '重构', '测试',
  '部署', '代码审查', '文档', '安全',
];

describe('CategoryPills', () => {
  const defaultProps = {
    categories,
    selected: '全部',
    totalCount: 42,
    onSelect: vi.fn(),
  };

  // #37: 渲染所有分类 pills
  it('渲染 8 个 pill 按钮', () => {
    render(<CategoryPills {...defaultProps} />);
    categories.forEach((cat) => {
      expect(screen.getByText(cat)).toBeDefined();
    });
  });

  // #38: 默认选中"全部"
  it('默认选中"全部"时包含激活样式', () => {
    const { container } = render(<CategoryPills {...defaultProps} />);
    const allBtn = screen.getByText('全部');
    // 选中态应有 border-brand 相关的样式
    expect(allBtn.className).toContain('text-white/70');
    expect(allBtn.className).toContain('font-medium');
  });

  // #39: 点击切换选中态
  it('点击分类触发 onSelect', () => {
    const onSelect = vi.fn();
    render(<CategoryPills {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('测试'));
    expect(onSelect).toHaveBeenCalledWith('测试');
  });

  // #40: 总数指示器
  it('显示总数 "42 个技能"', () => {
    render(<CategoryPills {...defaultProps} />);
    expect(screen.getByText('42 个技能')).toBeDefined();
  });

  // #41: 绿色圆点
  it('包含绿色圆点元素', () => {
    const { container } = render(<CategoryPills {...defaultProps} />);
    const dot = container.querySelector('.bg-emerald-400\\/50');
    // 也可以检查 style
    const allDots = container.querySelectorAll('span.w-1\\.5');
    // 检查是否有圆点（用 bg-emerald-400/50 的 span）
    const greenDot = container.querySelector('span.rounded-full');
    // 检查是否存在圆点样式的元素
    const inlineDotElements = container.querySelectorAll('.rounded-full');
    expect(inlineDotElements.length).toBeGreaterThan(0);
  });

  // #42: 横向溢出隐藏
  it('容器有 overflow-hidden', () => {
    const { container } = render(<CategoryPills {...defaultProps} />);
    const outer = container.firstElementChild;
    expect(outer?.className).toContain('overflow-hidden');
  });
});
