import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MonacoEditor } from '../../src/components/Editor/MonacoEditor';
import { Statusbar } from '../../src/components/Layout/Statusbar';
import { useEditorStore } from '../../src/stores/editorStore';
import { useFileStore } from '../../src/stores/fileStore';
import { useLayoutStore } from '../../src/stores/layoutStore';
import * as tokenCounter from '../../src/utils/tokenCounter';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock Monaco Editor component
vi.mock('@monaco-editor/react', () => ({
  default: (props: any) => (
    <textarea 
      data-testid="mock-monaco" 
      onChange={(e) => props.onChange(e.target.value)}
      defaultValue={props.defaultValue}
    />
  ),
  loader: { config: vi.fn() }
}));

// Mock Token Counter utility
const estimateTokensSpy = vi.spyOn(tokenCounter, 'estimateTokens');

describe('Token Counting Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup initial state
    const fileId = 'test-file-id';
    useFileStore.getState().syncState({
      openedFiles: [{
        id: fileId,
        path: '/test.ts',
        name: 'test.ts',
        content: 'initial content',
        language: 'typescript',
        isDirty: false
      }],
      activeFileId: fileId
    });

    useLayoutStore.getState().syncState({
      activePaneId: 'pane-1',
      panes: [{ id: 'pane-1', fileId: fileId, size: 100, position: { x: 0, y: 0 } }]
    });

    useEditorStore.getState().setActiveFileTokenCount(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should update token count in statusbar after editor change with debounce', async () => {
    estimateTokensSpy.mockResolvedValue(42);

    render(
      <div>
        <MonacoEditor paneId="pane-1" />
        <Statusbar />
      </div>
    );

    // Initial check (from useEffect on mount)
    await act(async () => {
      vi.advanceTimersByTime(600); // Pass 500ms debounce
    });
    
    // Statusbar should show count (formatted via formatTokenCount)
    expect(screen.getByText(/Tokens: 42/)).toBeInTheDocument();

    // Simulate user typing
    const editor = screen.getByTestId('mock-monaco');
    estimateTokensSpy.mockResolvedValue(100);

    act(() => {
      fireEvent.change(editor, { target: { value: 'new content...' } });
    });

    // Should NOT update immediately due to debounce
    expect(screen.queryByText(/Tokens: 100/)).not.toBeInTheDocument();

    // Advance time
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByText(/Tokens: 100/)).toBeInTheDocument();
    expect(estimateTokensSpy).toHaveBeenCalledWith('new content...');
  });

  it('should handle race conditions: only latest request counts', async () => {
    // Mock sequential calls with inverted resolution order
    // Request 1: slow (200ms) -> returns 1000
    // Request 2: fast (50ms) -> returns 5
    
    let callCount = 0;
    estimateTokensSpy.mockImplementation(async (text) => {
      callCount++;
      const currentCall = callCount;
      if (text === 'slow') {
        await new Promise(r => setTimeout(r, 200));
        return 1000;
      } else {
        await new Promise(r => setTimeout(r, 50));
        return 5;
      }
    });

    render(<MonacoEditor paneId="pane-1" />);
    const editor = screen.getByTestId('mock-monaco');

    // Trigger first update
    await act(async () => {
      fireEvent.change(editor, { target: { value: 'slow' } });
      vi.advanceTimersByTime(501); // Trigger the async call
    });

    // Trigger second update immediately
    await act(async () => {
      fireEvent.change(editor, { target: { value: 'fast' } });
      vi.advanceTimersByTime(501); // Trigger the async call
    });

    // At this point, both promises are pending.
    // Resolution: 'fast' will resolve first (50ms), then 'slow' (200ms).
    
    await act(async () => {
      vi.advanceTimersByTime(300); // Let both resolve
    });

    // Even though 'slow' resolved last, its requestId was older.
    // The store should hold the result of 'fast' (5).
    expect(useEditorStore.getState().activeFileTokenCount).toBe(5);
  });
});
