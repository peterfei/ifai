/**
 * PaneCollapseToggle 组件测试
 *
 * PCT-1 ~ PCT-7: 折叠/展开触发按钮
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PaneCollapseToggle } from '../PaneCollapseToggle';
import { useLayoutStore } from '../../../stores/layoutStore';

describe('PaneCollapseToggle', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      guiMode: 'conversation',
      conversationLeftCollapsed: false,
      conversationRightCollapsed: false,
    });
  });

  // PCT-1: 渲染左按钮
  it('PCT-1: 渲染 data-testid="pane-collapse-left"', () => {
    render(<PaneCollapseToggle side="left" />);
    expect(screen.getByTestId('pane-collapse-left')).toBeTruthy();
  });

  // PCT-2: 渲染右按钮
  it('PCT-2: 渲染 data-testid="pane-collapse-right"', () => {
    render(<PaneCollapseToggle side="right" />);
    expect(screen.getByTestId('pane-collapse-right')).toBeTruthy();
  });

  // PCT-3: 点击左按钮 toggle collapsed
  it('PCT-3: 点击左按钮 toggle conversationLeftCollapsed', () => {
    render(<PaneCollapseToggle side="left" />);
    fireEvent.click(screen.getByTestId('pane-collapse-left'));
    expect(useLayoutStore.getState().conversationLeftCollapsed).toBe(true);
  });

  // PCT-4: 点击右按钮 toggle collapsed
  it('PCT-4: 点击右按钮 toggle conversationRightCollapsed', () => {
    render(<PaneCollapseToggle side="right" />);
    fireEvent.click(screen.getByTestId('pane-collapse-right'));
    expect(useLayoutStore.getState().conversationRightCollapsed).toBe(true);
  });

  // PCT-5: collapsed 时 aria-label 含"展开"
  it('PCT-5: collapsed 时 aria-label 含展开', () => {
    useLayoutStore.setState({ conversationLeftCollapsed: true });
    render(<PaneCollapseToggle side="left" />);
    expect(screen.getByTestId('pane-collapse-left').getAttribute('aria-label')).toContain('展开');
  });

  // PCT-6: expanded 时 aria-label 含"收起"
  it('PCT-6: expanded 时 aria-label 含收起', () => {
    useLayoutStore.setState({ conversationLeftCollapsed: false });
    render(<PaneCollapseToggle side="left" />);
    expect(screen.getByTestId('pane-collapse-left').getAttribute('aria-label')).toContain('收起');
  });

  // PCT-7: 非 conversation 模式不渲染
  it('PCT-7: 非 conversation 模式不渲染', () => {
    useLayoutStore.setState({ guiMode: 'editor' });
    const { container } = render(<PaneCollapseToggle side="left" />);
    expect(container.firstChild).toBeNull();
  });
});
