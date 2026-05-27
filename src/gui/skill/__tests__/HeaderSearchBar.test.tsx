/**
 * HeaderSearchBar 单元测试
 *
 * 测试覆盖：
 * - 搜索输入框 + 图标
 * - ⌘K 快捷键提示
 * - 300ms 防抖
 * - focus-within 边框样式
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeaderSearchBar } from '../HeaderSearchBar';

describe('HeaderSearchBar', () => {
  // #43: 搜索输入框 + 图标
  it('渲染搜索输入框和搜索图标', () => {
    render(<HeaderSearchBar onSearch={vi.fn()} />);
    const input = screen.getByPlaceholderText('搜索技能...');
    expect(input).toBeDefined();
    // 检查 🔍 图标
    expect(screen.getByText('🔍')).toBeDefined();
  });

  // #44: ⌘K 快捷键提示
  it('显示 ⌘K 快捷键提示', () => {
    render(<HeaderSearchBar onSearch={vi.fn()} />);
    expect(screen.getByText('⌘K')).toBeDefined();
  });

  // #45: 300ms 防抖
  it('快速输入在 300ms 防抖后只调用一次 onSearch', async () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(<HeaderSearchBar onSearch={onSearch} />);
    const input = screen.getByPlaceholderText('搜索技能...');

    // 快速输入 3 个字符
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.change(input, { target: { value: 'abc' } });

    // 防抖未触发前，不应调用
    expect(onSearch).not.toHaveBeenCalled();

    // 推进时间超过 300ms
    vi.advanceTimersByTime(350);

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('abc');

    vi.useRealTimers();
  });

  // #46: 输入框容器有 focus-within 相关的类
  it('容器具有 focus-within 交互类', () => {
    const { container } = render(<HeaderSearchBar onSearch={vi.fn()} />);
    // 容器应包含 focus-within 相关类
    const searchContainer = container.firstElementChild;
    expect(searchContainer?.className).toContain('focus-within');
  });
});
