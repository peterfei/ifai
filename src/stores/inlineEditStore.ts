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
import { PivoStage } from './types';
import { GhostTask } from '../components/InlineEdit/GhostTaskList';
import { MockInlineEditor } from '../core/mock-core/v0.2.9/MockInlineEditor';
import { RealInlineEditor } from '../core/real-core/v0.2.9/RealInlineEditor';
import type { IInlineEditor, InlineEditorRequest } from '../core/interfaces/v0.2.9/IInlineEditor';
import { IS_COMMERCIAL } from '../config/edition';

// ============================================================================
// 服务注入
// ============================================================================

/**
 * 创建默认的编辑器服务实例
 *
 * 🔥 版本区分：
 * - 社区版: 使用 MockInlineEditor（模拟响应）
 * - 商业版: 使用 RealInlineEditor（真实 LLM API）
 */
function createEditorService(): IInlineEditor {
  if (IS_COMMERCIAL) {
    console.log('[inlineEditStore] 🏢 Commercial edition: Using RealInlineEditor with LLM API');
    return new RealInlineEditor();
  } else {
    console.log('[inlineEditStore] 🆓 Community edition: Using MockInlineEditor');
    return new MockInlineEditor({ delay: 100 });
  }
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

  /** 是否正在加载 */
  isLoading: boolean;

  /** 当前 Pivo 阶段 */
  pivoStage: PivoStage;

  /** 当前任务列表 */
  pivoTasks: GhostTask[];

  /** 已修改的文件列表 */
  modifiedFiles: string[];

  // Actions

  /** 显示行内编辑小部件 */
  showInlineEdit: (selectedText?: string, position?: { lineNumber: number; column: number }) => void;

  /** 隐藏行内编辑小部件 */
  hideInlineEdit: () => void;

  /** 提交编辑指令 */
  submitInstruction: (instruction: string) => Promise<void>;

  /** 设置 Pivo 状态 */
  setPivoState: (stage: PivoStage, tasks?: GhostTask[], files?: string[]) => void;

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
  pivoStage: 'idle',
  pivoTasks: [],
  modifiedFiles: [],
  editHistory: [],
  historyIndex: -1,
  isProcessing: false,
  isLoading: false,
showInlineEdit: (selectedText = '', position) => {
  console.log('[inlineEditStore] showInlineEdit called, setting isInlineEditVisible to true');

  // 🔥 v0.3.7: 唤起保底清理，确保每次都是全新开始
  set({
    pivoStage: 'idle',
    pivoTasks: [],
    modifiedFiles: [],
    isLoading: false,
    selectedText,
    position: position || null,
  });

  const editor = (window as any).__activeEditor;
  const model = editor?.getModel();
  const filePath = model?.uri.fsPath || model?.uri.path || '';

  set({
    isInlineEditVisible: true,
    currentFilePath: filePath, 
  });
  console.log('[inlineEditStore] After set, state:', get());
},

  hideInlineEdit: () => {
    console.log('[inlineEditStore] hideInlineEdit called');
    set({ 
      isInlineEditVisible: false,
      // 🔥 v0.3.7: 彻底重置状态，防止重开时残留
      pivoStage: 'idle',
      pivoTasks: [],
      modifiedFiles: [],
      isLoading: false,
      instruction: '',
      selectedText: '',
      position: null, // 🔥 修复无限循环：隐藏时重置 position
    });
  },

  submitInstruction: async (instruction) => {
    console.log('[inlineEditStore] submitInstruction (Agent 2.0) called:', instruction);
    
    const editor = (window as any).__activeEditor;
    const originalCode = editor?.getValue() || '';
    
    set({ 
      instruction, 
      isProcessing: true, 
      pivoStage: 'plan', 
      pivoTasks: [],
      originalCode // 🔥 记录快照
    });

    if (!editor) {
      set({ isProcessing: false });
      return;
    }

    const model = editor.getModel();
    const filePath = model?.uri.fsPath || model?.uri.path || 'unknown';
    
    // 🔥 v0.3.7: 优化上下文构造逻辑 (基于本地模板和 i18n)
    import('./useChatStore').then(async ({ useChatStore }) => {
      const { currentProviderId, currentModel } = (window as any).__settingsStore?.getState() || {};
      const { selectedText } = get();
      const language = detectLanguage(filePath);
      
      // 1. 获取国际化指令 (从 i18next)
      // 注意：我们在 App.tsx 已经将 i18n 暴露到 window.i18n
      const i18n = (window as any).i18n;
      const t = (key: string) => i18n?.t(key) || key;

      // 2. 构造上下文块
      let contextSection = '';
      if (selectedText) {
        contextSection = `**${t('editor.inlineWidget.prompt.selectedCode')} (TARGET FOR MODIFICATION):**
      \`\`\`${language}
      ${selectedText}
      \`\`\`

      **${t('editor.inlineWidget.prompt.surroundingContext')} (READ-ONLY REFERENCE, DO NOT MODIFY):**
      \`\`\`${language}
      ${getVisibleContext(editor, 20)}
      \`\`\``;
      }
 else {
        contextSection = `**${t('editor.inlineWidget.prompt.cursorContext')}**
\`\`\`${language}
${getVisibleContext(editor, 50)}
\`\`\``;
      }

      // 3. 读取本地 Prompt 模板
      let template = '';
      try {
        const { readFileContent } = await import('../utils/fileSystem');
        template = await readFileContent('.ifai/prompts/inline-edit.md');
      } catch (e) {
        console.warn('[inlineEditStore] Failed to load local prompt template, using fallback');
        // 回退模板 (与文件内容一致)
        template = `### 🤖 {{title}}
**File:** \`{{filePath}}\`
**Instruction:** {{instruction}}

{{contextSection}}

**CRITICAL DIRECTIVE:**
1. {{directive1}}
2. {{directive2}}
3. {{directive3}}
4. {{directive4}}
5. {{directive5}}`;
      }

      // 4. 填充占位符
      const fullPrompt = template
        .replace('{{title}}', t('editor.inlineWidget.prompt.title'))
        .replace('{{filePath}}', filePath)
        .replace('{{instruction}}', instruction)
        .replace('{{contextSection}}', contextSection)
        .replace('{{directive1}}', t('editor.inlineWidget.prompt.directive1'))
        .replace('{{directive2}}', t('editor.inlineWidget.prompt.directive2'))
        .replace('{{directive3}}', t('editor.inlineWidget.prompt.directive3'))
        .replace('{{directive4}}', t('editor.inlineWidget.prompt.directive4'))
        .replace('{{directive5}}', t('editor.inlineWidget.prompt.directive5'));
      
      // 构造给用户看的简洁信息
      const selectionPreview = selectedText 
        ? `\n\n**${t('editor.inlineWidget.prompt.selectedCode')}**\n\`\`\`${language}\n${selectedText.length > 500 ? selectedText.substring(0, 500) + '...' : selectedText}\n\`\`\``
        : '';
      
      const displayInfo = `🎨 ${t('editor.inlineWidget.prompt.title')}: ${instruction}${selectionPreview}`;
      
      // 发送消息，并标记为 Inline 任务以便 ChatStore 特殊处理
      (useChatStore.getState() as any).sendMessage(fullPrompt, currentProviderId, currentModel, {
        // @ts-ignore - 自定义属性用于 UI 过滤
        isInlineTask: true,
        displayLabel: displayInfo
      });
    });
  },

  setPivoState: (stage, tasks, files) => {
    set((state) => ({
      pivoStage: stage,
      pivoTasks: tasks || state.pivoTasks,
      modifiedFiles: files || state.modifiedFiles
    }));
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
    const state = get();
    console.log('[inlineEditStore] rejectDiff (Undo) called, originalCode length:', state.originalCode.length);
    
    // 🔥 物理还原
    if (state.originalCode) {
      window.dispatchEvent(new CustomEvent('inline-edit-undo', {
        detail: {
          code: state.originalCode,
          filePath: state.currentFilePath,
        },
      }));
    }

    set({
      isDiffEditorVisible: false,
      pivoStage: 'idle',
      pivoTasks: [],
      isInlineEditVisible: false
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
 * 获取光标附近的上下文代码
 * @param editor 编辑器实例
 * @param range 范围（前后行数，默认 50）
 */
function getVisibleContext(editor: any, range: number = 50): string {
  const model = editor.getModel();
  if (!model) return '';
  
  const position = editor.getPosition();
  if (!position) return '';

  const startLine = Math.max(1, position.lineNumber - range);
  const endLine = Math.min(model.getLineCount(), position.lineNumber + range);
  
  return model.getValueInRange({
    startLineNumber: startLine,
    startColumn: 1,
    endLineNumber: endLine,
    endColumn: model.getLineMaxColumn(endLine)
  });
}

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
// E2E 测试辅助与全局事件同步
// ============================================================================

if (typeof window !== 'undefined') {
  (window as any).__inlineEditStore = useInlineEditStore;

  // 🏆 PIVO 3.0: 监听全局事件并同步到 Store (用于高保真集成和 E2E 测试)
  
  // 1. 监听 PIVO 阶段变化
  window.addEventListener('pivo_stage', (e: any) => {
    const { stage, tasks, files } = e.detail || {};
    console.log('[inlineEditStore] Received pivo_stage event:', stage);
    useInlineEditStore.getState().setPivoState(stage, tasks, files);
  });

  // 2. 监听 Agent 状态
  window.addEventListener('agent:status', (e: any) => {
    const { status, tool } = e.detail || {};
    console.log('[inlineEditStore] Received agent:status event:', status);
    if (status === 'running' && (tool === 'agent_write_file' || tool === 'agent_replace')) {
      useInlineEditStore.getState().setPivoState('implement');
    }
  });

  // 3. 监听任务列表更新
  window.addEventListener('agent:tasks', (e: any) => {
    const { tasks } = e.detail || {};
    if (Array.isArray(tasks)) {
      useInlineEditStore.getState().setPivoState(useInlineEditStore.getState().pivoStage, tasks as GhostTask[]);
    }
  });
}
