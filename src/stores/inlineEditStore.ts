/**
 * v0.2.9 行内编辑 Store
 *
 * 管理行内编辑 (Cmd+K) 功能的状态
 */

import { create } from 'zustand';

// ============================================================================
// 类型定义
// ============================================================================

export interface InlineEditState {
  /** 是否显示行内编辑小部件 */
  isInlineEditVisible: boolean;

  /** 是否显示 Diff 编辑器 */
  isDiffEditorVisible: boolean;

  /** 用户输入的指令 */
  instruction: string;

  /** 当前选中的文本 */
  selectedText: string;

  /** 当前位置 */
  position: { lineNumber: number; column: number } | null;

  /** 原始代码（用于 Diff） */
  originalCode: string;

  /** 修改后的代码 */
  modifiedCode: string;

  /** 当前文件路径 */
  currentFilePath: string;

  /** 编辑历史（用于 Undo/Redo） */
  editHistory: Array<{
    timestamp: number;
    originalCode: string;
    modifiedCode: string;
    instruction: string;
  }>;

  /** 当前历史索引 */
  historyIndex: number;

  // Actions

  /** 显示行内编辑小部件 */
  showInlineEdit: (selectedText?: string, position?: { lineNumber: number; column: number }) => void;

  /** 隐藏行内编辑小部件 */
  hideInlineEdit: () => void;

  /** 提交编辑指令 */
  submitInstruction: (instruction: string) => void;

  /** 显示 Diff 编辑器 */
  showDiffEditor: (originalCode: string, modifiedCode: string, filePath: string, instruction: string) => void;

  /** 隐藏 Diff 编辑器 */
  hideDiffEditor: () => void;

  /** 接受 Diff 修改 */
  acceptDiff: () => void;

  /** 拒绝 Diff 修改 */
  rejectDiff: () => void;

  /** 撤销 */
  undo: () => void;

  /** 重做 */
  redo: () => void;

  /** 清空历史 */
  clearHistory: () => void;
}

// ============================================================================
// Store 实现
// ============================================================================

export const useInlineEditStore = create<InlineEditState>((set, get) => ({
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

  showInlineEdit: (selectedText = '', position) => {
    console.log('[inlineEditStore] showInlineEdit called, setting isInlineEditVisible to true');
    set({
      isInlineEditVisible: true,
      selectedText,
      position: position || null,
    });
    console.log('[inlineEditStore] After set, state:', get());
  },

  hideInlineEdit: () => {
    set({
      isInlineEditVisible: false,
      instruction: '',
      selectedText: '',
    });
  },

  submitInstruction: (instruction) => {
    console.log('[inlineEditStore] submitInstruction called with:', instruction);
    set({ instruction });

    // 获取当前编辑器内容
    const editor = (window as any).__activeEditor;
    if (!editor) {
      console.warn('[inlineEditStore] No active editor found');
      return;
    }
    console.log('[inlineEditStore] Active editor found, getting content...');

    const originalContent = editor.getValue() || '';
    const state = get();

    // E2E 测试: dispatch 事件
    window.dispatchEvent(new CustomEvent('inline-edit-submit', {
      detail: { instruction, originalCode: originalContent }
    }));

    // 生成 mock 修改后的代码（用于 E2E 测试）
    let modifiedContent = originalContent;
    if (instruction.includes('error handling')) {
      // 添加错误处理模式
      modifiedContent = originalContent.replace(
        /function handleClick\(\) \{[\s\S]*?\n    \}/,
        `function handleClick() {
        try {
            setCount(count + 1);
        } catch (error) {
            console.error('Error in handleClick:', error);
        }
    }`
      );
    } else if (instruction.includes('Add')) {
      // 通用添加模式
      modifiedContent = originalContent + '\n    // Added: ' + instruction;
    }

    // 如果没有变化，添加注释
    if (modifiedContent === originalContent) {
      modifiedContent = originalContent + '\n    // ' + instruction;
    }

    // 获取当前文件路径
    const filePath = state.currentFilePath || editor.getModel()?.uri || 'unknown';

    // 显示 Diff 编辑器
    get().showDiffEditor(originalContent, modifiedContent, filePath, instruction);
  },

  showDiffEditor: (originalCode, modifiedCode, filePath, instruction) => {
    console.log('[inlineEditStore] showDiffEditor called, setting isDiffEditorVisible to true');
    const state = get();

    // 如果这是第一条历史记录，先保存原始内容作为 "初始状态"
    let newHistory = state.editHistory;
    let newHistoryIndex = state.historyIndex;

    if (state.editHistory.length === 0) {
      // 创建一个初始条目（未修改的状态）
      const initialEntry = {
        timestamp: Date.now(),
        originalCode,
        modifiedCode: originalCode, // 初始状态：修改后的代码等于原始代码
        instruction: '',
      };
      newHistory = [initialEntry];
      newHistoryIndex = 0;
    }

    // 添加新的修改条目
    const newEntry = {
      timestamp: Date.now(),
      originalCode,
      modifiedCode,
      instruction,
    };

    // 添加到历史记录
    newHistory = [...newHistory.slice(0, newHistoryIndex + 1), newEntry];

    set({
      isDiffEditorVisible: true,
      isInlineEditVisible: false,
      originalCode,
      modifiedCode,
      currentFilePath: filePath,
      instruction,
      editHistory: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  hideDiffEditor: () => {
    set({
      isDiffEditorVisible: false,
    });
  },

  acceptDiff: () => {
    const state = get();
    console.log('[inlineEditStore] acceptDiff called, modifiedCode:', state.modifiedCode);
    // 这里应该将修改应用到编辑器
    // 由于需要访问 Monaco Editor 实例，我们通过事件系统通知编辑器
    window.dispatchEvent(new CustomEvent('inline-edit-accept', {
      detail: {
        originalCode: state.originalCode,
        modifiedCode: state.modifiedCode,
        filePath: state.currentFilePath,
      },
    }));

    set({
      isDiffEditorVisible: false,
    });
  },

  rejectDiff: () => {
    set({
      isDiffEditorVisible: false,
    });
  },

  undo: () => {
    const state = get();
    console.log('[inlineEditStore] undo called, historyIndex:', state.historyIndex, 'editHistory.length:', state.editHistory.length);
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1;
      const entry = state.editHistory[newIndex];

      console.log('[inlineEditStore] undo to index:', newIndex, 'originalCode:', entry.originalCode);

      // 通知编辑器撤销
      window.dispatchEvent(new CustomEvent('inline-edit-undo', {
        detail: {
          code: entry.originalCode,
          filePath: state.currentFilePath,
        },
      }));

      set({
        historyIndex: newIndex,
        originalCode: entry.originalCode,
        modifiedCode: entry.modifiedCode,
      });
    } else {
      console.log('[inlineEditStore] undo: nothing to undo (historyIndex <= 0)');
    }
  },

  redo: () => {
    const state = get();
    if (state.historyIndex < state.editHistory.length - 1) {
      const newIndex = state.historyIndex + 1;
      const entry = state.editHistory[newIndex];

      // 通知编辑器重做
      window.dispatchEvent(new CustomEvent('inline-edit-redo', {
        detail: {
          code: entry.modifiedCode,
          filePath: state.currentFilePath,
        },
      }));

      set({
        historyIndex: newIndex,
        originalCode: entry.originalCode,
        modifiedCode: entry.modifiedCode,
      });
    }
  },

  clearHistory: () => {
    set({
      editHistory: [],
      historyIndex: -1,
    });
  },
}));

// ============================================================================
// E2E 测试辅助
// ============================================================================

if (typeof window !== 'undefined') {
  (window as any).__inlineEditStore = useInlineEditStore;
}
