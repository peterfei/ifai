/**
 * v0.2.9 inlineEditStore 单元测试
 *
 * 测试行内编辑 Store 的状态管理功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useInlineEditStore } from '../../../src/stores/inlineEditStore';

// Mock 模拟 Monaco Editor
const mockEditor = {
  getValue: () => 'const originalCode = "test";',
  setValue: (value: string) => {
    (mockEditor as any).value = value;
  },
  getModel: () => ({
    uri: '/test/file.ts',
  }),
};

describe('inlineEditStore', () => {
  beforeEach(() => {
    // 重置 store 状态
    useInlineEditStore.setState({
      isInlineEditVisible: false,
      isDiffEditorVisible: false,
      instruction: '',
      selectedText: '',
      position: null,
      originalCode: '',
      modifiedCode: '',
      currentFilePath: '',
      editHistory: [],
      historyIndex: -1,
      isProcessing: false,
    });

    // 设置模拟编辑器
    (window as any).__activeEditor = mockEditor;
  });

  describe('EDT-UNIT-01: showInlineEdit 应该设置正确的状态', () => {
    it('应该显示行内编辑小部件', () => {
      const { showInlineEdit } = useInlineEditStore.getState();

      showInlineEdit();

      expect(useInlineEditStore.getState().isInlineEditVisible).toBe(true);
    });

    it('应该保存选中的文本', () => {
      const { showInlineEdit } = useInlineEditStore.getState();
      const selectedText = 'selected code';

      showInlineEdit(selectedText);

      expect(useInlineEditStore.getState().selectedText).toBe(selectedText);
    });

    it('应该保存光标位置', () => {
      const { showInlineEdit } = useInlineEditStore.getState();
      const position = { lineNumber: 5, column: 10 };

      showInlineEdit('text', position);

      expect(useInlineEditStore.getState().position).toEqual(position);
    });

    it('应该使用默认值如果没有传入参数', () => {
      const { showInlineEdit } = useInlineEditStore.getState();

      showInlineEdit();

      expect(useInlineEditStore.getState().selectedText).toBe('');
      expect(useInlineEditStore.getState().position).toBeNull();
    });
  });

  describe('EDT-UNIT-02: hideInlineEdit 应该清除输入和状态', () => {
    it('应该隐藏行内编辑小部件', () => {
      const { showInlineEdit, hideInlineEdit } = useInlineEditStore.getState();

      showInlineEdit('test');
      expect(useInlineEditStore.getState().isInlineEditVisible).toBe(true);

      hideInlineEdit();

      expect(useInlineEditStore.getState().isInlineEditVisible).toBe(false);
    });

    it('应该清除指令输入', () => {
      const { showInlineEdit, hideInlineEdit } = useInlineEditStore.getState();

      useInlineEditStore.setState({ instruction: 'test instruction' });
      hideInlineEdit();

      expect(useInlineEditStore.getState().instruction).toBe('');
    });

    it('应该清除选中的文本', () => {
      const { showInlineEdit, hideInlineEdit } = useInlineEditStore.getState();

      showInlineEdit('selected text');
      hideInlineEdit();

      expect(useInlineEditStore.getState().selectedText).toBe('');
    });
  });

  describe('EDT-UNIT-03: submitInstruction 应该调用 editor 服务', () => {
    it('应该保存指令到状态', async () => {
      const { submitInstruction } = useInlineEditStore.getState();
      const instruction = 'Add logging';

      // 设置监听器来验证事件
      const eventSpy = vi.fn();
      window.addEventListener('inline-edit-submit', eventSpy);

      await submitInstruction(instruction);

      expect(useInlineEditStore.getState().instruction).toBe(instruction);

      // 应该触发 inline-edit-submit 事件
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            instruction,
          }),
        })
      );

      window.removeEventListener('inline-edit-submit', eventSpy);
    });

    it('应该在编辑器不可用时不抛出错误', async () => {
      (window as any).__activeEditor = null;

      const { submitInstruction } = useInlineEditStore.getState();

      // 不应该抛出错误
      await expect(submitInstruction('test instruction')).resolves.toBeUndefined();
    });

    it('应该在编辑器可用时触发事件', async () => {
      (window as any).__activeEditor = mockEditor;

      const { submitInstruction } = useInlineEditStore.getState();

      const eventSpy = vi.fn();
      window.addEventListener('inline-edit-submit', eventSpy);

      await submitInstruction('test');

      expect(eventSpy).toHaveBeenCalled();

      window.removeEventListener('inline-edit-submit', eventSpy);
    });
  });

  describe('EDT-UNIT-04: showDiffEditor 应该保存历史记录', () => {
    it('应该保存初始状态到历史记录', () => {
      const { showDiffEditor } = useInlineEditStore.getState();

      showDiffEditor('original', 'modified', '/test/file.ts', 'instruction');

      const state = useInlineEditStore.getState();

      expect(state.editHistory.length).toBeGreaterThan(0);
      expect(state.isDiffEditorVisible).toBe(true);
    });

    it('应该保存原始代码和修改后的代码', () => {
      const { showDiffEditor } = useInlineEditStore.getState();
      const originalCode = 'original code';
      const modifiedCode = 'modified code';

      showDiffEditor(originalCode, modifiedCode, '/test/file.ts', 'instruction');

      const state = useInlineEditStore.getState();

      expect(state.originalCode).toBe(originalCode);
      expect(state.modifiedCode).toBe(modifiedCode);
    });

    it('应该追加新的历史记录而不是替换', () => {
      const { showDiffEditor } = useInlineEditStore.getState();

      showDiffEditor('code1', 'modified1', '/test/file1.ts', 'instruction1');
      const historyLength1 = useInlineEditStore.getState().editHistory.length;

      showDiffEditor('code2', 'modified2', '/test/file2.ts', 'instruction2');
      const historyLength2 = useInlineEditStore.getState().editHistory.length;

      expect(historyLength2).toBeGreaterThan(historyLength1);
    });

    it('应该更新 historyIndex', () => {
      const { showDiffEditor } = useInlineEditStore.getState();

      showDiffEditor('original', 'modified', '/test/file.ts', 'instruction');

      const state = useInlineEditStore.getState();

      expect(state.historyIndex).toBe(state.editHistory.length - 1);
    });

    it('应该保存指令', () => {
      const { showDiffEditor } = useInlineEditStore.getState();
      const instruction = 'Add error handling';

      showDiffEditor('original', 'modified', '/test/file.ts', instruction);

      expect(useInlineEditStore.getState().instruction).toBe(instruction);
    });
  });

  describe('EDT-UNIT-05: undo 应该恢复到上一个状态', () => {
    beforeEach(() => {
      // 设置历史记录
      useInlineEditStore.setState({
        editHistory: [
          {
            timestamp: Date.now(),
            originalCode: 'original1',
            modifiedCode: 'original1',
            instruction: '',
          },
          {
            timestamp: Date.now(),
            originalCode: 'original1',
            modifiedCode: 'modified1',
            instruction: 'instruction1',
          },
          {
            timestamp: Date.now(),
            originalCode: 'original2',
            modifiedCode: 'modified2',
            instruction: 'instruction2',
          },
        ],
        historyIndex: 2,
        originalCode: 'original2',
        modifiedCode: 'modified2',
      });
    });

    it('应该将 historyIndex 减 1', () => {
      const { undo } = useInlineEditStore.getState();
      const currentIndex = useInlineEditStore.getState().historyIndex;

      undo();

      expect(useInlineEditStore.getState().historyIndex).toBe(currentIndex - 1);
    });

    it('应该恢复到上一个状态的代码', () => {
      const { undo } = useInlineEditStore.getState();

      undo();

      const state = useInlineEditStore.getState();

      expect(state.originalCode).toBe('original1');
      expect(state.modifiedCode).toBe('modified1');
    });

    it('应该在 historyIndex 为 0 时不再撤销', () => {
      useInlineEditStore.setState({ historyIndex: 0 });

      const { undo } = useInlineEditStore.getState();
      const beforeIndex = useInlineEditStore.getState().historyIndex;

      undo();

      expect(useInlineEditStore.getState().historyIndex).toBe(beforeIndex);
    });

    it('应该触发 inline-edit-undo 事件', () => {
      const eventSpy = vi.fn();
      window.addEventListener('inline-edit-undo', eventSpy);

      const { undo } = useInlineEditStore.getState();

      undo();

      expect(eventSpy).toHaveBeenCalled();
      window.removeEventListener('inline-edit-undo', eventSpy);
    });
  });

  describe('EDT-UNIT-06: redo 应该前进到下一个状态', () => {
    beforeEach(() => {
      // 设置历史记录
      useInlineEditStore.setState({
        editHistory: [
          {
            timestamp: Date.now(),
            originalCode: 'original1',
            modifiedCode: 'original1',
            instruction: '',
          },
          {
            timestamp: Date.now(),
            originalCode: 'original1',
            modifiedCode: 'modified1',
            instruction: 'instruction1',
          },
          {
            timestamp: Date.now(),
            originalCode: 'original2',
            modifiedCode: 'modified2',
            instruction: 'instruction2',
          },
        ],
        historyIndex: 0,
        originalCode: 'original1',
        modifiedCode: 'modified1',
      });
    });

    it('应该将 historyIndex 加 1', () => {
      const { redo } = useInlineEditStore.getState();
      const currentIndex = useInlineEditStore.getState().historyIndex;

      redo();

      expect(useInlineEditStore.getState().historyIndex).toBe(currentIndex + 1);
    });

    it('应该恢复到下一个状态的代码', () => {
      const { redo } = useInlineEditStore.getState();

      redo();

      const state = useInlineEditStore.getState();

      // historyIndex 从 0 移动到 1，应该显示 editHistory[1] 的内容
      expect(state.originalCode).toBe('original1');
      expect(state.modifiedCode).toBe('modified1');
    });

    it('应该在 historyIndex 到达末尾时不再重做', () => {
      useInlineEditStore.setState({
        historyIndex: useInlineEditStore.getState().editHistory.length - 1,
      });

      const { redo } = useInlineEditStore.getState();
      const beforeIndex = useInlineEditStore.getState().historyIndex;

      redo();

      expect(useInlineEditStore.getState().historyIndex).toBe(beforeIndex);
    });

    it('应该触发 inline-edit-redo 事件', () => {
      const eventSpy = vi.fn();
      window.addEventListener('inline-edit-redo', eventSpy);

      const { redo } = useInlineEditStore.getState();

      redo();

      expect(eventSpy).toHaveBeenCalled();
      window.removeEventListener('inline-edit-redo', eventSpy);
    });
  });

  describe('其他功能测试', () => {
    it('hideDiffEditor 应该隐藏 Diff 编辑器', () => {
      const { showDiffEditor, hideDiffEditor } = useInlineEditStore.getState();

      showDiffEditor('original', 'modified', '/test/file.ts', 'instruction');
      expect(useInlineEditStore.getState().isDiffEditorVisible).toBe(true);

      hideDiffEditor();

      expect(useInlineEditStore.getState().isDiffEditorVisible).toBe(false);
    });

    it('acceptDiff 应该隐藏 Diff 编辑器', () => {
      const { showDiffEditor, acceptDiff } = useInlineEditStore.getState();

      showDiffEditor('original', 'modified', '/test/file.ts', 'instruction');
      expect(useInlineEditStore.getState().isDiffEditorVisible).toBe(true);

      acceptDiff();

      expect(useInlineEditStore.getState().isDiffEditorVisible).toBe(false);
    });

    it('acceptDiff 应该触发 inline-edit-accept 事件', () => {
      const eventSpy = vi.fn();
      window.addEventListener('inline-edit-accept', eventSpy);

      const { showDiffEditor, acceptDiff } = useInlineEditStore.getState();

      showDiffEditor('original', 'modified', '/test/file.ts', 'instruction');
      acceptDiff();

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            originalCode: 'original',
            modifiedCode: 'modified',
          }),
        })
      );

      window.removeEventListener('inline-edit-accept', eventSpy);
    });

    it('rejectDiff 应该隐藏 Diff 编辑器', () => {
      const { showDiffEditor, rejectDiff } = useInlineEditStore.getState();

      showDiffEditor('original', 'modified', '/test/file.ts', 'instruction');
      expect(useInlineEditStore.getState().isDiffEditorVisible).toBe(true);

      rejectDiff();

      expect(useInlineEditStore.getState().isDiffEditorVisible).toBe(false);
    });

    it('clearHistory 应该清空历史记录', () => {
      const { showDiffEditor, clearHistory } = useInlineEditStore.getState();

      showDiffEditor('original', 'modified', '/test/file.ts', 'instruction');
      expect(useInlineEditStore.getState().editHistory.length).toBeGreaterThan(0);

      clearHistory();

      expect(useInlineEditStore.getState().editHistory).toEqual([]);
      expect(useInlineEditStore.getState().historyIndex).toBe(-1);
    });
  });
});
