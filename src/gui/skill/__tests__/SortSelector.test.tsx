/**
 * SortSelector 单元测试
 *
 * 测试覆盖：
 * - 3 个排序选项渲染
 * - 点击切换
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SortSelector } from '../SortSelector';

describe('SortSelector', () => {
  // #47: 3 个排序选项
  it('渲染 3 个排序选项：热门 / 最新 / 评分', () => {
    render(<SortSelector sortBy="popular" onChange={vi.fn()} />);
    expect(screen.getByText('热门')).toBeDefined();
    expect(screen.getByText('最新')).toBeDefined();
    expect(screen.getByText('评分')).toBeDefined();
  });

  it('包含"排序:"标签', () => {
    render(<SortSelector sortBy="popular" onChange={vi.fn()} />);
    expect(screen.getByText('排序:')).toBeDefined();
  });

  // #48: 点击触发 onChange
  it('点击选项触发 onChange', () => {
    const onChange = vi.fn();
    render(<SortSelector sortBy="popular" onChange={onChange} />);
    fireEvent.click(screen.getByText('最新'));
    expect(onChange).toHaveBeenCalledWith('newest');
  });

  it('选中项有高亮样式', () => {
    const { container } = render(
      <SortSelector sortBy="rating" onChange={vi.fn()} />
    );
    // 选中项应有 text-white/40
    const spans = container.querySelectorAll('span');
    const selectedSpan = Array.from(spans).find(
      (s) => s.textContent === '评分'
    );
    expect(selectedSpan?.className).toContain('text-white/40');
  });
});
