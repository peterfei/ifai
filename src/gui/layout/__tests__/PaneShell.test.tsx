import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { PaneShell } from '../PaneShell';

describe('PaneShell', () => {
  it('渲染子内容', () => {
    const { container } = render(
      <PaneShell>hello</PaneShell>
    );
    expect(container.textContent).toBe('hello');
  });

  it('应用固定宽度样式', () => {
    const { container } = render(
      <PaneShell width={300}>content</PaneShell>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('300px');
  });

  it('应用 flex 样式', () => {
    const { container } = render(
      <PaneShell flex={1}>content</PaneShell>
    );
    const el = container.firstChild as HTMLElement;
    // 浏览器将 flex:'1' 展开为 '1 1 0%'
    expect(el.style.flex).toContain('1');
  });

  it('width 和 flex 同时设置时均生效', () => {
    const { container } = render(
      <PaneShell width={200} flex={1}>content</PaneShell>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('200px');
    expect(el.style.flex).toContain('1');
  });

  it('无子内容时渲染占位提示', () => {
    const { container } = render(
      <PaneShell />
    );
    expect(container.textContent).toContain('Empty Pane');
  });

  it('data-testid 正确传递', () => {
    const { container } = render(
      <PaneShell data-testid="test-pane">content</PaneShell>
    );
    expect(container.querySelector('[data-testid="test-pane"]')).toBeTruthy();
  });
});
