/**
 * TimeDivider 组件测试
 *
 * TD-1 ~ TD-3: 时间分组标题渲染
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TimeDivider } from '../TimeDivider';

describe('TimeDivider', () => {
  // TD-1: 渲染"今天"文字
  it('TD-1: 渲染"今天"文字', () => {
    render(<TimeDivider label="今天" />);
    expect(screen.getByText('今天')).toBeTruthy();
  });

  // TD-2: 渲染"昨天"文字
  it('TD-2: 渲染"昨天"文字', () => {
    render(<TimeDivider label="昨天" />);
    expect(screen.getByText('昨天')).toBeTruthy();
  });

  // TD-3: data-testid="time-divider"
  it('TD-3: data-testid="time-divider"', () => {
    render(<TimeDivider label="今天" />);
    expect(screen.getByTestId('time-divider')).toBeTruthy();
  });

  // TD-4: 两侧有分隔线元素
  it('TD-4: 两侧有分隔线', () => {
    const { container } = render(<TimeDivider label="今天" />);
    const divider = container.querySelector('[data-testid="time-divider"]');
    // 应包含 2 个分隔线 span（左右各一个）
    const lines = divider!.querySelectorAll('[data-divider-line]');
    expect(lines.length).toBe(2);
  });

  // TD-5: 不同标签渲染不同文字
  it('TD-5: 渲染"更早"文字', () => {
    render(<TimeDivider label="更早" />);
    expect(screen.getByText('更早')).toBeTruthy();
  });
});
