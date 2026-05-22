/**
 * LayoutShortcuts 测试
 *
 * LS-1 ~ LS-7: Cmd+1/2/3 切换 GUI 布局模式
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutStore } from '../../../stores/layoutStore';
import { useLayoutShortcuts } from '../LayoutShortcuts';

describe('LayoutShortcuts', () => {
  beforeEach(() => {
    useLayoutStore.setState({ guiMode: 'split' });
  });

  // LS-1: useLayoutShortcuts 注册 keydown 监听
  it('LS-1: useLayoutShortcuts 注册 keydown 监听', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useLayoutShortcuts());
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    addSpy.mockRestore();
  });

  // LS-2: Cmd+1 → setGuiMode('conversation')
  it('LS-2: Cmd+1 切换到 conversation', () => {
    renderHook(() => useLayoutShortcuts());
    const event = new KeyboardEvent('keydown', { key: '1', metaKey: true } as any);
    window.dispatchEvent(event);
    expect(useLayoutStore.getState().guiMode).toBe('conversation');
  });

  // LS-3: Cmd+2 → setGuiMode('editor')
  it('LS-3: Cmd+2 切换到 editor', () => {
    renderHook(() => useLayoutShortcuts());
    const event = new KeyboardEvent('keydown', { key: '2', metaKey: true } as any);
    window.dispatchEvent(event);
    expect(useLayoutStore.getState().guiMode).toBe('editor');
  });

  // LS-4: Cmd+3 → setGuiMode('split')
  it('LS-4: Cmd+3 切换到 split', () => {
    useLayoutStore.setState({ guiMode: 'editor' });
    renderHook(() => useLayoutShortcuts());
    const event = new KeyboardEvent('keydown', { key: '3', metaKey: true } as any);
    window.dispatchEvent(event);
    expect(useLayoutStore.getState().guiMode).toBe('split');
  });

  // LS-5: 输入框中不触发
  it('LS-5: 输入框中不触发', () => {
    renderHook(() => useLayoutShortcuts());
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = new KeyboardEvent('keydown', { key: '1', metaKey: true, bubbles: true } as any);
    Object.defineProperty(event, 'target', { value: input });
    window.dispatchEvent(event);
    expect(useLayoutStore.getState().guiMode).toBe('split');
    document.body.removeChild(input);
  });

  // LS-6: 无 Cmd 时不触发
  it('LS-6: 无 Cmd 时不触发', () => {
    renderHook(() => useLayoutShortcuts());
    const event = new KeyboardEvent('keydown', { key: '1' } as any);
    window.dispatchEvent(event);
    expect(useLayoutStore.getState().guiMode).toBe('split');
  });

  // LS-7: Ctrl+1 也能触发（Windows/Linux）
  it('LS-7: Ctrl+1 也能触发', () => {
    renderHook(() => useLayoutShortcuts());
    const event = new KeyboardEvent('keydown', { key: '1', ctrlKey: true } as any);
    window.dispatchEvent(event);
    expect(useLayoutStore.getState().guiMode).toBe('conversation');
  });
});
