import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GuiLayoutSwitcher } from '../GuiLayoutSwitcher';
import { useLayoutStore } from '../../../stores/layoutStore';

describe('GuiLayoutSwitcher', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      guiMode: 'split',
      layoutMode: 'default',
      editorMode: 'vibe',
    });
  });

  it('渲染 3 个模式按钮', () => {
    render(<GuiLayoutSwitcher />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(3);
  });

  it('当前模式按钮被标记为 pressed', () => {
    useLayoutStore.setState({ guiMode: 'editor' });
    render(<GuiLayoutSwitcher />);
    const editorBtn = screen.getByTestId('gui-mode-editor');
    expect(editorBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('点击切换 guiMode', () => {
    render(<GuiLayoutSwitcher />);
    const editorBtn = screen.getByTestId('gui-mode-editor');
    fireEvent.click(editorBtn);
    expect(useLayoutStore.getState().guiMode).toBe('editor');
  });

  it('初始状态为 split', () => {
    render(<GuiLayoutSwitcher />);
    const splitBtn = screen.getByTestId('gui-mode-split');
    expect(splitBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('data-testid 容器存在', () => {
    render(<GuiLayoutSwitcher />);
    expect(screen.getByTestId('gui-layout-switcher')).toBeTruthy();
  });

  it('切换 guiMode 不影响现有 layoutMode/editorMode', () => {
    useLayoutStore.setState({ layoutMode: 'custom', editorMode: 'spec' });
    render(<GuiLayoutSwitcher />);
    const editorBtn = screen.getByTestId('gui-mode-editor');
    fireEvent.click(editorBtn);
    expect(useLayoutStore.getState().layoutMode).toBe('custom');
    expect(useLayoutStore.getState().editorMode).toBe('spec');
  });
});
