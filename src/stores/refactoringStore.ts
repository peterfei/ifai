/**
 * v0.3.0: 重构状态管理
 *
 * 管理重构预览和执行状态
 */

import { create } from 'zustand';
import { RefactoringPreview, refactoringService } from '../services/refactoring';

interface RefactoringState {
  // 当前预览
  currentPreview: RefactoringPreview | null;

  // 是否正在执行重构
  isExecuting: boolean;

  // 是否显示预览面板
  isPreviewOpen: boolean;

  // 执行错误
  error: string | null;

  // Actions
  previewRename: (options: {
    filePath: string;
    oldName: string;
    newName: string;
    kind: 'variable' | 'function' | 'class' | 'interface' | 'type' | 'enum' | 'namespace' | 'import';
  }) => Promise<boolean>;

  previewExtractFunction: (options: {
    filePath: string;
    range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    };
    functionName: string;
    parameters?: string[];
    returnType?: string;
  }) => Promise<boolean>;

  executeRefactoring: () => Promise<boolean>;

  clearPreview: () => void;

  setPreviewOpen: (open: boolean) => void;

  setError: (error: string | null) => void;
}

export const useRefactoringStore = create<RefactoringState>((set, get) => ({
  currentPreview: null,
  isExecuting: false,
  isPreviewOpen: false,
  error: null,

  previewRename: async (options) => {
    set({ isExecuting: true, error: null });

    try {
      const result = await refactoringService.previewRename(options);

      if (!result.success) {
        set({ error: result.error || '预览失败', isExecuting: false });
        return false;
      }

      set({
        currentPreview: result.preview,
        isPreviewOpen: true,
        isExecuting: false,
      });

      return true;
    } catch (error) {
      set({ error: String(error), isExecuting: false });
      return false;
    }
  },

  previewExtractFunction: async (options) => {
    set({ isExecuting: true, error: null });

    try {
      const result = await refactoringService.previewExtractFunction(options);

      if (!result.success) {
        set({ error: result.error || '预览失败', isExecuting: false });
        return false;
      }

      set({
        currentPreview: result.preview,
        isPreviewOpen: true,
        isExecuting: false,
      });

      return true;
    } catch (error) {
      set({ error: String(error), isExecuting: false });
      return false;
    }
  },

  executeRefactoring: async () => {
    const { currentPreview } = get();
    if (!currentPreview) return false;

    set({ isExecuting: true, error: null });

    try {
      // 应用所有编辑
      for (const edit of currentPreview.edits) {
        const { writeFileContent, readFileContent } = await import('../utils/fileSystem');

        const content = await readFileContent(edit.filePath);
        const lines = content.split('\n');

        // 处理编辑
        if (edit.range.startLineNumber === edit.range.endLineNumber) {
          // 单行编辑
          const line = lines[edit.range.startLineNumber - 1];
          const before = line.substring(0, edit.range.startColumn - 1);
          const after = line.substring(edit.range.endColumn - 1);

          // 检查是否是删除操作
          if (edit.newText === '') {
            lines[edit.range.startLineNumber - 1] = before + after;
          } else {
            lines[edit.range.startLineNumber - 1] = before + edit.newText + after;
          }
        } else if (edit.oldText === '') {
          // 插入操作（多行）
          const insertLine = edit.range.startLineNumber - 1;
          const newLines = edit.newText.split('\n');
          lines.splice(insertLine, 0, ...newLines);
        } else {
          // 多行替换
          const startLine = edit.range.startLineNumber - 1;
          const endLine = edit.range.endLineNumber - 1;
          const linesToRemove = endLine - startLine + 1;
          lines.splice(startLine, linesToRemove, edit.newText);
        }

        // 写回文件
        await writeFileContent(edit.filePath, lines.join('\n'));
      }

      // 清理预览
      set({
        currentPreview: null,
        isPreviewOpen: false,
        isExecuting: false,
        error: null,
      });

      return true;
    } catch (error) {
      set({ error: String(error), isExecuting: false });
      return false;
    }
  },

  clearPreview: () => {
    set({
      currentPreview: null,
      isPreviewOpen: false,
      error: null,
    });
  },

  setPreviewOpen: (open: boolean) => {
    set({ isPreviewOpen: open });
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));
