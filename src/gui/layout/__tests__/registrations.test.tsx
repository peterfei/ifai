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

  it('conversation 模式有 1 个面板', () => {
    const desc = layoutRegistry.get('conversation')!;
    expect(desc.panes.length).toBe(1);
    expect(desc.panes[0].id).toBe('conversation');
  });

  it('split 模式有 2 个面板', () => {
    const desc = layoutRegistry.get('split')!;
    expect(desc.panes.length).toBe(2);
    expect(desc.panes[0].id).toBe('conversation');
    expect(desc.panes[1].id).toBe('editor');
  });

  it('面板组件均可渲染', () => {
    const ConversationComp = componentRegistry.get('conversation')!;
    const EditorComp = componentRegistry.get('editor')!;

    const { container: c1 } = render(<ConversationComp />);
    expect(c1.textContent).toBeTruthy();

    const { container: c2 } = render(<EditorComp />);
    expect(c2.textContent).toBeTruthy();
  });
});
