/**
 * EmptyConversationState 空对话占位测试
 *
 * EC-1 ~ EC-3: compact 模式空消息占位渲染
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { EmptyConversationState } from '../EmptyConversationState';

describe('EmptyConversationState', () => {
  // EC-1: 渲染占位文本
  it('EC-1: 渲染"开始新对话"占位文本', () => {
    render(<EmptyConversationState />);

    expect(screen.getByTestId('empty-state')).toBeTruthy();
    expect(screen.getByText('开始新对话')).toBeTruthy();
    expect(screen.getByText(/在下方输入框输入消息/)).toBeTruthy();
  });

  // EC-2: 使用 muted 灰色
  it('EC-2: 占位文本使用 muted 灰色', () => {
    const { container } = render(<EmptyConversationState />);

    const text = container.querySelector('[data-testid="empty-state-text"]');
    expect(text).toBeTruthy();
    // jsdom 保留原始 hex 值
    const color = (text as HTMLElement).style.color;
    expect(color).toBeTruthy();
    expect(color === '#9CA3AF' || color === 'rgb(156, 163, 175)').toBe(true);
  });

  // EC-3: 居中布局
  it('EC-3: 占位区域居中布局', () => {
    const { container } = render(<EmptyConversationState />);

    const wrapper = container.querySelector('[data-testid="empty-state"]');
    expect(wrapper).toBeTruthy();
    const style = (wrapper as HTMLElement).style;
    expect(style.display).toBe('flex');
    expect(style.alignItems).toBe('center');
    expect(style.justifyContent).toBe('center');
  });
});
