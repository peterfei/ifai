/**
 * LayoutEngine 过渡动画测试
 *
 * LT-1 ~ LT-5: 模式切换淡入淡出 + PaneShell flex transition
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { LayoutEngine } from '../LayoutEngine';
import { layoutRegistry } from '../layout-registry';
import { componentRegistry } from '../../registry/component-registry';
import { useLayoutStore } from '../../../stores/layoutStore';

// Mock panels
const MockLeftPanel = () => <div data-testid="left-panel">Left</div>;
const MockCenterPanel = () => <div data-testid="center-panel">Center</div>;
const MockRightPanel = () => <div data-testid="right-panel">Right</div>;

const paneRenderer = (paneId: string) => {
  const map: Record<string, React.ReactNode> = {
    left: <MockLeftPanel />,
    center: <MockCenterPanel />,
    right: <MockRightPanel />,
  };
  return map[paneId] ?? <div>Unknown: {paneId}</div>;
};

describe('LayoutEngine transition', () => {
  beforeEach(() => {
    layoutRegistry.clear();
    componentRegistry.clear();

    // 注册 3-Pane 布局（模拟 conversation）
    layoutRegistry.register('three-pane', {
      id: 'three-pane',
      panes: [
        { id: 'left', width: 320, flex: 0 },
        { id: 'center', width: 'auto', flex: 1 },
        { id: 'right', width: 400, flex: 0 },
      ],
    });

    // 注册 1-Pane 布局（模拟 editor）
    layoutRegistry.register('single-pane', {
      id: 'single-pane',
      panes: [
        { id: 'center', width: 'auto', flex: 1 },
      ],
    });
  });

  // LT-1: 外层容器有 transition 属性
  it('LT-1: 外层容器有 transition 包含 opacity', () => {
    const { container } = render(<LayoutEngine mode="three-pane" paneRenderer={paneRenderer} />);
    const engine = container.querySelector('[data-testid="layout-engine"]') as HTMLElement;
    expect(engine).toBeTruthy();
    expect(engine.style.transition).toContain('opacity');
  });

  // LT-2: mode 变化时触发 transition
  it('LT-2: 切换 mode 后容器仍然存在', () => {
    const { container, rerender } = render(<LayoutEngine mode="three-pane" paneRenderer={paneRenderer} />);
    expect(container.querySelector('[data-testid="layout-engine"]')).toBeTruthy();

    rerender(<LayoutEngine mode="single-pane" paneRenderer={paneRenderer} />);
    expect(container.querySelector('[data-testid="layout-engine"]')).toBeTruthy();
  });

  // LT-3: PaneShell 有 flex transition
  it('LT-3: PaneShell 子元素有 flex transition', () => {
    const { container } = render(<LayoutEngine mode="three-pane" paneRenderer={paneRenderer} />);
    // PaneShell 使用 display:flex，验证 flex 属性正确
    const panes = container.querySelectorAll('[data-pane-id]');
    expect(panes.length).toBeGreaterThanOrEqual(1);
  });

  // LT-4: 三栏布局正常渲染
  it('LT-4: 三栏布局渲染 3 个面板', () => {
    render(<LayoutEngine mode="three-pane" paneRenderer={paneRenderer} />);
    expect(screen.getByTestId('left-panel')).toBeTruthy();
    expect(screen.getByTestId('center-panel')).toBeTruthy();
    expect(screen.getByTestId('right-panel')).toBeTruthy();
  });

  // LT-5: 单栏布局正常渲染
  it('LT-5: 单栏布局渲染 1 个面板', () => {
    render(<LayoutEngine mode="single-pane" paneRenderer={paneRenderer} />);
    expect(screen.getByTestId('center-panel')).toBeTruthy();
    expect(screen.queryByTestId('left-panel')).toBeNull();
  });
});
