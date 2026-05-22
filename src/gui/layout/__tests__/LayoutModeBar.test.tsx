/**
 * LayoutModeBar 组件测试
 *
 * LMB-1 ~ LMB-7: conversation 模式底部模式切换栏
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { LayoutModeBar } from '../LayoutModeBar';
import { useLayoutStore } from '../../../stores/layoutStore';

describe('LayoutModeBar', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      guiMode: 'conversation',
    });
  });

  // LMB-1: conversation 底部渲染 LayoutModeBar
  it('LMB-1: conversation 底部渲染 LayoutModeBar', () => {
    render(<LayoutModeBar />);
    expect(screen.getByTestId('layout-mode-bar')).toBeTruthy();
  });

  // LMB-2: 显示"编辑器"按钮
  it('LMB-2: 显示编辑器按钮', () => {
    render(<LayoutModeBar />);
    expect(screen.getByText('编辑器')).toBeTruthy();
  });

  // LMB-3: 显示"分屏"按钮
  it('LMB-3: 显示分屏按钮', () => {
    render(<LayoutModeBar />);
    expect(screen.getByText('分屏')).toBeTruthy();
  });

  // LMB-4: 点击编辑器按钮 → setGuiMode('editor')
  it('LMB-4: 点击编辑器切换到 editor', () => {
    render(<LayoutModeBar />);
    fireEvent.click(screen.getByText('编辑器'));
    expect(useLayoutStore.getState().guiMode).toBe('editor');
  });

  // LMB-5: 点击分屏按钮 → setGuiMode('split')
  it('LMB-5: 点击分屏切换到 split', () => {
    render(<LayoutModeBar />);
    fireEvent.click(screen.getByText('分屏'));
    expect(useLayoutStore.getState().guiMode).toBe('split');
  });

  // LMB-6: editor/split 模式不渲染
  it('LMB-6: editor 模式不渲染', () => {
    useLayoutStore.setState({ guiMode: 'editor' });
    const { container } = render(<LayoutModeBar />);
    expect(container.firstChild).toBeNull();
  });

  // LMB-7: split 模式不渲染
  it('LMB-7: split 模式不渲染', () => {
    useLayoutStore.setState({ guiMode: 'split' });
    const { container } = render(<LayoutModeBar />);
    expect(container.firstChild).toBeNull();
  });
});
