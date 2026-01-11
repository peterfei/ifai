/**
 * v0.2.9 行内编辑 Store
 *
 * 管理行内编辑 (Cmd+K) 功能的状态
 *
 * 集成说明:
 * - 社区版: 使用 MockInlineEditor 提供模拟响应
 * - 商业版: 可配置为使用真实的 InlineEditorService
 */

import { create } from 'zustand';
import { MockInlineEditor } from '../core/mock-core/v0.2.9/MockInlineEditor';
import type { IInlineEditor, InlineEditorRequest } from '../core/interfaces/v0.2.9/IInlineEditor';

// ============================================================================
// 服务注入
// ============================================================================

/**
 * 创建默认的编辑器服务实例
 *
 * 社区版使用 MockInlineEditor，商业版可以替换为真实的 LLM 服务
 */
function createEditorService(): IInlineEditor {
  return new MockInlineEditor({ delay: 100 }); // 降低延迟以提升体验
}

// 默认服务实例
let editorService: IInlineEditor = createEditorService();

/**
 * 设置编辑器服务（用于依赖注入）
 */
export function setInlineEditorService(service: IInlineEditor): void {
  editorService = service;
  console.log('[inlineEditStore] Editor service set to:', service.getProviderInfo().name);
}

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

  /** 是否正在处理请求 */
  isProcessing: boolean;

  // Actions

  /** 显示行内编辑小部件 */
  showInlineEdit: (selectedText?: string, position?: { lineNumber: number; column: number }) => void;

  /** 隐藏行内编辑小部件 */
  hideInlineEdit: () => void;

  /** 提交编辑指令 */
  submitInstruction: (instruction: string) => Promise<void>;

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
  isProcessing: false,

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
      position: null, // 🔥 修复无限循环：隐藏时重置 position
    });
  },

  submitInstruction: async (instruction) => {
    console.log('[inlineEditStore] submitInstruction called with:', instruction);
    set({ instruction, isProcessing: true });

    // 获取当前编辑器内容
    const editor = (window as any).__activeEditor;
    if (!editor) {
      console.warn('[inlineEditStore] No active editor found');
      set({ isProcessing: false });
      return;
    }
    console.log('[inlineEditStore] Active editor found, getting content...');

    const originalContent = editor.getValue() || '';
    const state = get();

    // E2E 测试: dispatch 事件
    window.dispatchEvent(new CustomEvent('inline-edit-submit', {
      detail: { instruction, originalCode: originalContent }
    }));

    // 获取当前文件路径
    const filePath = state.currentFilePath || editor.getModel()?.uri || 'unknown';
    const language = detectLanguage(filePath);

    // 构建编辑请求
    const request: InlineEditorRequest = {
      instruction,
      code: originalContent,
      language,
      filePath: typeof filePath === 'string' ? filePath : String(filePath),
      selectedCode: state.selectedText || undefined,
      cursorPosition: state.position ? {
        line: state.position.lineNumber,
        column: state.position.column,
      } : undefined,
    };

    try {
      // 调用编辑器服务
      console.log('[inlineEditStore] Calling editor service...');
      const response = await editorService.applyEdit(request);

      if (!response.success) {
        console.error('[inlineEditStore] Editor service failed:', response.error);
        set({ isProcessing: false });
        return;
      }

      const modifiedContent = response.modifiedCode;

      console.log('[inlineEditStore] Editor service returned modified code, length:', modifiedContent.length);

      // 显示 Diff 编辑器
      get().showDiffEditor(originalContent, modifiedContent, filePath, instruction);
    } catch (error) {
      console.error('[inlineEditStore] Error calling editor service:', error);
      set({ isProcessing: false });
    }
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
      isProcessing: false,
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
// 辅助函数
// ============================================================================

/**
 * 根据文件路径检测编程语言
 */
function detectLanguage(filePath: string | { path?: string; toString(): string }): string {
  let pathStr: string;
  if (typeof filePath === 'string') {
    pathStr = filePath;
  } else if (filePath && typeof filePath.toString === 'function') {
    pathStr = filePath.toString();
    // 移除 Monaco Uri 的 scheme (如 "file://")
    pathStr = pathStr.replace(/^file:\/\//, '');
  } else {
    return 'typescript';
  }

  const ext = pathStr.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'go': 'go',
    'rs': 'rust',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'java': 'java',
    'kt': 'kotlin',
    'swift': 'swift',
    'rb': 'ruby',
    'php': 'php',
    'sql': 'sql',
    'sh': 'shell',
    'yaml': 'yaml',
    'yml': 'yaml',
    'json': 'json',
    'xml': 'xml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'md': 'markdown',
    'vue': 'vue',
    'svelte': 'svelte',
  };
  return languageMap[ext || ''] || 'typescript';
}

// ============================================================================
// E2E 测试辅助
// ============================================================================

if (typeof window !== 'undefined') {
  (window as any).__inlineEditStore = useInlineEditStore;
}
