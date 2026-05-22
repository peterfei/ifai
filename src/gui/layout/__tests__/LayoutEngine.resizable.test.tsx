/**
 * LayoutEngine 拖拽集成测试
 *
 * LR-8 ~ LR-14: conversation 模式三栏拖拽
 * 使用与 registrations.tsx 一致的 pane ID
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock layoutStore
const mockState: Record<string, any> = {
  guiMode: 'conversation',
  conversationLeftWidth: 260,
  conversationRightWidth: 300,
  leftPanelMode: 'task',
};

vi.mock('../../../stores/layoutStore', () => ({
  useLayoutStore: (selector: (s: any) => any) => selector(mockState),
}));

// Mock layout-registry — 与 registrations.tsx 一致的 pane ID
vi.mock('../layout-registry', () => ({
  layoutRegistry: {
    get: (mode: string) => {
      if (mode === 'conversation') {
        return {
          mode: 'conversation',
          panes: [
            { id: 'conversation-list', width: 260 },
            { id: 'conversation', flex: 1 },
            { id: 'conversation-detail', width: 300 },
          ],
        };
      }
      if (mode === 'editor') {
        return { mode: 'editor', panes: [{ id: 'editor', flex: 1 }] };
      }
      if (mode === 'split') {
        return {
          mode: 'split',
          panes: [
            { id: 'conversation', flex: 1 },
            { id: 'editor', flex: 1 },
          ],
        };
      }
      return undefined;
    },
  },
}));

describe('LayoutEngine resizable', () => {
  beforeEach(() => {
    mockState.guiMode = 'conversation';
    mockState.conversationLeftWidth = 260;
    mockState.conversationRightWidth = 300;
    mockState.leftPanelMode = 'task';
  });

  async function renderEngine(mode: string) {
    mockState.guiMode = mode;
    const { LayoutEngine } = await import('../LayoutEngine');
    return render(
      <LayoutEngine
        mode={mode as any}
        paneRenderer={(id) => <div data-pane-content={id}>Pane: {id}</div>}
      />
    );
  }

  // LR-8: conversation 渲染 2 个 PaneResizer
  it('LR-8: conversation 渲染 2 个拖拽分隔线', async () => {
    const { container } = await renderEngine('conversation');
    const resizers = container.querySelectorAll('[data-testid="pane-resizer"]');
    expect(resizers.length).toBe(2);
  });

  // LR-9: 从 layoutStore 读取初始宽度（左栏）
  it('LR-9: 左栏使用 conversationLeftWidth', async () => {
    const { container } = await renderEngine('conversation');
    const leftPane = container.querySelector('[data-pane-id="conversation-list"]');
    expect(leftPane).toBeTruthy();
    expect(leftPane!.parentElement!.style.width).toBe('260px');
  });

  // LR-10: 右栏使用 conversationRightWidth
  it('LR-10: 右栏使用 conversationRightWidth', async () => {
    const { container } = await renderEngine('conversation');
    const rightPane = container.querySelector('[data-pane-id="conversation-detail"]');
    expect(rightPane).toBeTruthy();
    expect(rightPane!.parentElement!.style.width).toBe('300px');
  });

  // LR-11: 中间栏 flex 填充剩余空间
  it('LR-11: 中间栏 flex 填充剩余空间', async () => {
    const { container } = await renderEngine('conversation');
    const centerPane = container.querySelector('[data-pane-id="conversation"]');
    expect(centerPane).toBeTruthy();
    const parent = centerPane!.parentElement;
    // flex 应该被设置
    expect(parent?.style.flex).toBeTruthy();
  });

  // LR-12: editor 模式无 PaneResizer
  it('LR-12: editor 模式无拖拽分隔线', async () => {
    const { container } = await renderEngine('editor');
    const resizers = container.querySelectorAll('[data-testid="pane-resizer"]');
    expect(resizers.length).toBe(0);
  });

  // LR-13: split 模式无 PaneResizer
  it('LR-13: split 模式无拖拽分隔线', async () => {
    const { container } = await renderEngine('split');
    const resizers = container.querySelectorAll('[data-testid="pane-resizer"]');
    expect(resizers.length).toBe(0);
  });

  // LR-14: store 宽度变化后 PaneShell 更新
  it('LR-14: store 宽度变化后 PaneShell 更新', async () => {
    const { container, rerender } = await renderEngine('conversation');

    let leftPane = container.querySelector('[data-pane-id="conversation-list"]');
    expect(leftPane?.parentElement?.style.width).toBe('260px');

    // 模拟 store 变化
    mockState.conversationLeftWidth = 350;

    const { LayoutEngine } = await import('../LayoutEngine');
    rerender(
      <LayoutEngine
        mode="conversation"
        paneRenderer={(id) => <div data-pane-content={id}>Pane: {id}</div>}
      />
    );

    leftPane = container.querySelector('[data-pane-id="conversation-list"]');
    expect(leftPane?.parentElement?.style.width).toBe('350px');
  });
});
