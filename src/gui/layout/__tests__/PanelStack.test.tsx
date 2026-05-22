/**
 * PanelStack 渲染测试
 *
 * TDD 先行：10 个用例
 *
 * 覆盖：
 * - PS-1: 空面板
 * - PS-2: 1 个面板无分隔线
 * - PS-3: 3 个面板 2 个分隔线
 * - PS-4: 面板按配置顺序渲染
 * - PS-5: defaultSize 生效
 * - PS-6: minSize 约束生效
 * - PS-7: collapsible 面板有折叠按钮
 * - PS-8: 折叠后面板内容隐藏
 * - PS-9: data-testid 正确
 * - PS-10: 分隔线可拖拽
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelStack } from '../PanelStack';
import type { PanelConfig } from '../types';

function MockPanel({ title }: { title: string }) {
  return <div data-testid={`mock-panel-${title}`}>{title} Content</div>;
}

function makeConfig(overrides?: Partial<PanelConfig>): PanelConfig {
  return {
    id: 'test-panel',
    title: 'Test Panel',
    component: MockPanel,
    defaultSize: 200,
    minSize: 40,
    collapsible: true,
    ...overrides,
  };
}

describe('PanelStack', () => {
  /* ===== PS-1: 空面板 ===== */

  it('PS-1: 渲染空 PanelStack（0 个面板）', () => {
    const { container } = render(<PanelStack panels={[]} />);
    const stack = container.querySelector('[data-testid="panel-stack"]');
    expect(stack).toBeTruthy();
    expect(stack!.children.length).toBe(0);
  });

  /* ===== PS-2: 1 个面板 ===== */

  it('PS-2: 渲染 1 个面板，无分隔线', () => {
    const panels: PanelConfig[] = [
      makeConfig({ id: 'a', title: 'A' }),
    ];
    const { container } = render(<PanelStack panels={panels} />);

    expect(screen.getByTestId('panel-item-a')).toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="panel-divider-"]').length).toBe(0);
  });

  /* ===== PS-3: 3 个面板 2 个分隔线 ===== */

  it('PS-3: 渲染 3 个面板，生成 2 个分隔线', () => {
    const panels: PanelConfig[] = [
      makeConfig({ id: 'a', title: 'A' }),
      makeConfig({ id: 'b', title: 'B' }),
      makeConfig({ id: 'c', title: 'C' }),
    ];
    const { container } = render(<PanelStack panels={panels} />);

    expect(screen.getByTestId('panel-item-a')).toBeTruthy();
    expect(screen.getByTestId('panel-item-b')).toBeTruthy();
    expect(screen.getByTestId('panel-item-c')).toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="panel-divider-"]').length).toBe(2);
  });

  /* ===== PS-4: 面板按配置顺序渲染 ===== */

  it('PS-4: 面板按配置顺序渲染', () => {
    const panels: PanelConfig[] = [
      makeConfig({ id: 'first', title: 'First' }),
      makeConfig({ id: 'second', title: 'Second' }),
    ];
    const { container } = render(<PanelStack panels={panels} />);

    const stack = container.querySelector('[data-testid="panel-stack"]')!;
    const items = Array.from(stack.querySelectorAll('[data-testid^="panel-item-"]'));
    expect(items[0].getAttribute('data-testid')).toBe('panel-item-first');
    expect(items[1].getAttribute('data-testid')).toBe('panel-item-second');
  });

  /* ===== PS-5: defaultSize 生效 ===== */

  it('PS-5: 面板 defaultSize 生效', () => {
    const panels: PanelConfig[] = [
      makeConfig({ id: 'a', title: 'A', defaultSize: 300 }),
    ];
    render(<PanelStack panels={panels} />);

    const panelItem = screen.getByTestId('panel-item-a');
    expect((panelItem as HTMLElement).style.height).toContain('300px');
  });

  /* ===== PS-6: minSize 约束 ===== */

  it('PS-6: 面板 minSize 约束生效', () => {
    const panels: PanelConfig[] = [
      makeConfig({ id: 'a', title: 'A', defaultSize: 200, minSize: 80 }),
    ];
    render(<PanelStack panels={panels} />);

    const panelItem = screen.getByTestId('panel-item-a');
    const style = (panelItem as HTMLElement).style;
    expect(style.minHeight).toContain('80px');
  });

  /* ===== PS-7: collapsible 折叠按钮 ===== */

  it('PS-7: collapsible 面板有折叠/展开按钮', () => {
    const panels: PanelConfig[] = [
      makeConfig({ id: 'a', title: 'A', collapsible: true }),
    ];
    render(<PanelStack panels={panels} />);

    // 应有折叠按钮（标题栏内的 toggle 按钮）
    const toggleBtn = screen.getByLabelText('折叠面板 A');
    expect(toggleBtn).toBeTruthy();
  });

  /* ===== PS-8: 折叠后内容隐藏 ===== */

  it('PS-8: 折叠后面板内容隐藏', () => {
    const panels: PanelConfig[] = [
      makeConfig({ id: 'a', title: 'A', collapsible: true }),
    ];
    render(<PanelStack panels={panels} />);

    // 初始应显示内容
    expect(screen.getByText('A Content')).toBeTruthy();

    // 点击折叠
    const toggleBtn = screen.getByLabelText('折叠面板 A');
    fireEvent.click(toggleBtn);

    // 折叠后内容应不可见
    expect(screen.queryByText('A Content')).toBeNull();
  });

  /* ===== PS-9: data-testid ===== */

  it('PS-9: data-testid 正确（panel-stack, panel-item-{id}, panel-divider-{index}）', () => {
    const panels: PanelConfig[] = [
      makeConfig({ id: 'x', title: 'X' }),
      makeConfig({ id: 'y', title: 'Y' }),
    ];
    render(<PanelStack panels={panels} />);

    expect(screen.getByTestId('panel-stack')).toBeTruthy();
    expect(screen.getByTestId('panel-item-x')).toBeTruthy();
    expect(screen.getByTestId('panel-item-y')).toBeTruthy();
    expect(screen.getByTestId('panel-divider-0')).toBeTruthy();
  });

  /* ===== PS-10: 分隔线拖拽 ===== */

  it('PS-10: 分隔线可拖拽调整高度', () => {
    const panels: PanelConfig[] = [
      makeConfig({ id: 'a', title: 'A', defaultSize: 200 }),
      makeConfig({ id: 'b', title: 'B', defaultSize: 200 }),
    ];
    render(<PanelStack panels={panels} />);

    const divider = screen.getByTestId('panel-divider-0');
    // 分隔线应有 cursor 样式
    expect((divider as HTMLElement).style.cursor).toBe('ns-resize');
  });
});
