import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore } from '../../../stores/layoutStore';

describe('layoutStore guiMode 扩展', () => {
  beforeEach(() => {
    useLayoutStore.setState({
      guiMode: 'split',
      guiConversationSnapshot: null,
      guiEditorSnapshot: null,
    });
  });

  describe('guiMode 状态', () => {
    it('默认值为 split（兼容现有行为）', () => {
      expect(useLayoutStore.getState().guiMode).toBe('split');
    });

    it('setGuiMode 可切换到 conversation', () => {
      useLayoutStore.getState().setGuiMode('conversation');
      expect(useLayoutStore.getState().guiMode).toBe('conversation');
    });

    it('setGuiMode 可切换到 editor', () => {
      useLayoutStore.getState().setGuiMode('editor');
      expect(useLayoutStore.getState().guiMode).toBe('editor');
    });

    it('setGuiMode 在三个模式间循环切换', () => {
      const { setGuiMode } = useLayoutStore.getState();
      setGuiMode('conversation');
      expect(useLayoutStore.getState().guiMode).toBe('conversation');
      setGuiMode('editor');
      expect(useLayoutStore.getState().guiMode).toBe('editor');
      setGuiMode('split');
      expect(useLayoutStore.getState().guiMode).toBe('split');
    });
  });

  describe('状态快照', () => {
    it('切换到 conversation 时保存 editor 快照', () => {
      useLayoutStore.setState({ guiMode: 'editor' });
      useLayoutStore.getState().setGuiMode('conversation');
      const snapshot = useLayoutStore.getState().guiEditorSnapshot;
      expect(snapshot).toBeDefined();
      expect(snapshot).not.toBeNull();
    });

    it('切换到 editor 时保存 conversation 快照', () => {
      useLayoutStore.setState({ guiMode: 'conversation' });
      useLayoutStore.getState().setGuiMode('editor');
      const snapshot = useLayoutStore.getState().guiConversationSnapshot;
      expect(snapshot).toBeDefined();
      expect(snapshot).not.toBeNull();
    });
  });

  describe('向后兼容', () => {
    it('guiMode 不影响现有 layoutMode', () => {
      useLayoutStore.setState({ layoutMode: 'default' });
      useLayoutStore.getState().setGuiMode('conversation');
      expect(useLayoutStore.getState().layoutMode).toBe('default');
    });

    it('guiMode 不影响现有 editorMode', () => {
      useLayoutStore.setState({ editorMode: 'vibe' });
      useLayoutStore.getState().setGuiMode('conversation');
      expect(useLayoutStore.getState().editorMode).toBe('vibe');
    });
  });
});
