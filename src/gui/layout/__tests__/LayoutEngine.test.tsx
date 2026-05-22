import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { LayoutEngine } from '../LayoutEngine';
import { layoutRegistry } from '../layout-registry';
import type { LayoutDescriptor } from '../types';

describe('LayoutEngine', () => {
  beforeEach(() => {
    // 重置 registry 确保测试隔离
    layoutRegistry.clear();
    // 注册三种布局描述
    layoutRegistry.register('conversation', {
      mode: 'conversation',
      panes: [{ id: 'conversation', flex: 1 }],
    });
    layoutRegistry.register('editor', {
      mode: 'editor',
      panes: [{ id: 'editor', flex: 1 }],
    });
    layoutRegistry.register('split', {
      mode: 'split',
      panes: [
        { id: 'conversation', flex: 1 },
        { id: 'editor', flex: 1 },
      ],
    });
  });

  it('split 模式渲染 2 个面板', () => {
    const { container } = render(
      <LayoutEngine mode="split" paneRenderer={(id) => <div>{id}</div>} />
    );
    const panes = container.querySelectorAll('[data-pane-id]');
    expect(panes.length).toBe(2);
  });

  it('conversation 模式渲染 1 个面板', () => {
    const { container } = render(
      <LayoutEngine mode="conversation" paneRenderer={(id) => <div>{id}</div>} />
    );
    const panes = container.querySelectorAll('[data-pane-id]');
    expect(panes.length).toBe(1);
  });

  it('editor 模式渲染 1 个面板', () => {
    const { container } = render(
      <LayoutEngine mode="editor" paneRenderer={(id) => <div>{id}</div>} />
    );
    const panes = container.querySelectorAll('[data-pane-id]');
    expect(panes.length).toBe(1);
  });

  it('paneRenderer 接收到正确的 pane id', () => {
    const { container } = render(
      <LayoutEngine mode="editor" paneRenderer={(id) => <div>pane:{id}</div>} />
    );
    expect(container.textContent).toContain('pane:editor');
  });

  it('未注册的 mode 渲染空状态', () => {
    layoutRegistry.clear();
    const { container } = render(
      <LayoutEngine mode="unknown" paneRenderer={(id) => <div>{id}</div>} />
    );
    expect(container.textContent).toContain('Unknown layout');
  });

  it('data-testid 正确设置', () => {
    const { container } = render(
      <LayoutEngine mode="split" paneRenderer={(id) => <div>{id}</div>} />
    );
    expect(container.querySelector('[data-testid="layout-engine"]')).toBeTruthy();
  });
});
