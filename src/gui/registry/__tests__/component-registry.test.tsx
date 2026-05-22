import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { componentRegistry } from '../component-registry';

const MockPanel = () => <div>mock-panel</div>;
const MockPanel2 = () => <div>mock-panel-2</div>;

describe('componentRegistry', () => {
  beforeEach(() => {
    componentRegistry.clear();
  });

  it('注册 React 组件 + 查询', () => {
    componentRegistry.register('conversation', MockPanel);
    const Comp = componentRegistry.get('conversation');
    expect(Comp).toBe(MockPanel);
  });

  it('查询不存在的组件返回 undefined', () => {
    const Comp = componentRegistry.get('nonexistent');
    expect(Comp).toBeUndefined();
  });

  it('覆盖已注册的组件', () => {
    componentRegistry.register('test', MockPanel);
    componentRegistry.register('test', MockPanel2);
    const Comp = componentRegistry.get('test');
    expect(Comp).toBe(MockPanel2);
  });

  it('entries 列出所有已注册组件', () => {
    componentRegistry.register('a', MockPanel);
    componentRegistry.register('b', MockPanel2);
    const entries = componentRegistry.entries();
    expect(entries.length).toBe(2);
    const types = entries.map(([key]) => key);
    expect(types).toContain('a');
    expect(types).toContain('b');
  });

  it('注册的组件可正常渲染', () => {
    componentRegistry.register('conversation', MockPanel);
    const Comp = componentRegistry.get('conversation')!;
    const { container } = render(<Comp />);
    expect(container.textContent).toBe('mock-panel');
  });

  it('clear 后查询返回 undefined', () => {
    componentRegistry.register('test', MockPanel);
    componentRegistry.clear();
    expect(componentRegistry.get('test')).toBeUndefined();
  });
});
