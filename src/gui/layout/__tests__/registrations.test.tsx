import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { layoutRegistry } from '../layout-registry';
import { componentRegistry } from '../../registry/component-registry';
import { registerLayouts } from '../registrations';

describe('Layout registrations', () => {
  beforeAll(() => {
    registerLayouts();
  });

  it('三种模式均已注册', () => {
    expect(layoutRegistry.has('conversation')).toBe(true);
    expect(layoutRegistry.has('editor')).toBe(true);
    expect(layoutRegistry.has('split')).toBe(true);
  });

  it('conversation 模式有三栏面板', () => {
    const desc = layoutRegistry.get('conversation')!;
    expect(desc.panes.length).toBe(3);
    expect(desc.panes[0].id).toBe('conversation-list');
    expect(desc.panes[0].width).toBe(260);
    expect(desc.panes[1].id).toBe('conversation');
    expect(desc.panes[1].flex).toBe(1);
    expect(desc.panes[2].id).toBe('conversation-detail');
    expect(desc.panes[2].width).toBe(300);
  });

  it('editor 模式有 1 个面板', () => {
    const desc = layoutRegistry.get('editor')!;
    expect(desc.panes.length).toBe(1);
    expect(desc.panes[0].id).toBe('editor');
  });

  it('split 模式有 2 个面板', () => {
    const desc = layoutRegistry.get('split')!;
    expect(desc.panes.length).toBe(2);
    expect(desc.panes[0].id).toBe('conversation');
    expect(desc.panes[1].id).toBe('editor');
  });

  it('所有面板组件均已注册且可渲染', () => {
    const ids = ['conversation-list', 'conversation', 'conversation-detail', 'editor'];
    for (const id of ids) {
      const Comp = componentRegistry.get(id);
      expect(Comp, `Component "${id}" should be registered`).toBeDefined();
      if (Comp) {
        const Element = Comp;
        const { container } = render(<Element />);
        expect(container.textContent).toBeTruthy();
      }
    }
  });
});
