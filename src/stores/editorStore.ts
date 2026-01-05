import { create } from 'zustand';
import { editor, Selection } from 'monaco-editor';

interface InlineEditState {
  isVisible: boolean;
  position: { lineNumber: number; column: number } | null;
  selection: Selection | null;
}

interface EditorInstance {
  instance: editor.IStandaloneCodeEditor;
  paneId: string;
  lastAccessed: number;
}

interface EditorState {
  editorInstances: Map<string, EditorInstance>;
  activeEditorId: string | null;
  theme: 'vs-dark' | 'light';
  inlineEdit: InlineEditState;
  activeFileTokenCount: number;

  setEditorInstance: (paneId: string, instance: editor.IStandaloneCodeEditor) => void;
  getEditorInstance: (paneId: string) => editor.IStandaloneCodeEditor | null;
  removeEditorInstance: (paneId: string) => void;
  setActiveEditor: (paneId: string) => void;
  setTheme: (theme: 'vs-dark' | 'light') => void;
  setInlineEdit: (state: Partial<InlineEditState>) => void;
  closeInlineEdit: () => void;
  getActiveEditor: () => editor.IStandaloneCodeEditor | null;
  evictLRU: () => void;
  setActiveFileTokenCount: (count: number) => void;
}

const MAX_EDITOR_INSTANCES = 4;

export const useEditorStore = create<EditorState>((set, get) => ({
  editorInstances: new Map(),
  activeEditorId: null,
  theme: 'vs-dark',
  inlineEdit: {
    isVisible: false,
    position: null,
    selection: null,
  },
  activeFileTokenCount: 0,

  setEditorInstance: (paneId, instance) => {
    const state = get();
    const newInstances = new Map(state.editorInstances);

    // 如果达到最大实例数，淘汰最久未使用的
    if (newInstances.size >= MAX_EDITOR_INSTANCES) {
      get().evictLRU();
    }

    newInstances.set(paneId, {
      instance,
      paneId,
      lastAccessed: Date.now(),
    });

    set({
      editorInstances: newInstances,
      activeEditorId: paneId,
    });
  },

  getEditorInstance: (paneId) => {
    const state = get();
    const editorData = state.editorInstances.get(paneId);

    if (editorData) {
      // 更新最后访问时间
      const newInstances = new Map(state.editorInstances);
      newInstances.set(paneId, {
        ...editorData,
        lastAccessed: Date.now(),
      });
      set({ editorInstances: newInstances });
      return editorData.instance;
    }

    return null;
  },

  removeEditorInstance: (paneId) => {
    const state = get();
    const editorData = state.editorInstances.get(paneId);

    if (editorData) {
      // 销毁编辑器实例
      editorData.instance.dispose();
      const newInstances = new Map(state.editorInstances);
      newInstances.delete(paneId);

      set({
        editorInstances: newInstances,
        activeEditorId: state.activeEditorId === paneId ? null : state.activeEditorId,
      });
    }
  },

  setActiveEditor: (paneId) => {
    set({ activeEditorId: paneId });
  },

  setTheme: (theme) => set({ theme }),

  setInlineEdit: (newState) => set((state) => ({
    inlineEdit: { ...state.inlineEdit, ...newState }
  })),

  closeInlineEdit: () => set((state) => ({
    inlineEdit: { ...state.inlineEdit, isVisible: false }
  })),

  getActiveEditor: () => {
    const state = get();
    if (!state.activeEditorId) return null;

    const activeEditor = state.editorInstances.get(state.activeEditorId);
    return activeEditor ? activeEditor.instance : null;
  },

  evictLRU: () => {
    const state = get();
    if (state.editorInstances.size === 0) return;

    // 找到最久未使用的实例（排除当前活动的）
    let lruPaneId: string | null = null;
    let oldestTime = Date.now();

    state.editorInstances.forEach((editorData, paneId) => {
      if (paneId !== state.activeEditorId && editorData.lastAccessed < oldestTime) {
        oldestTime = editorData.lastAccessed;
        lruPaneId = paneId;
      }
    });

    // 如果没有找到非活动实例，淘汰第一个
    if (!lruPaneId && state.editorInstances.size > 0) {
      lruPaneId = state.editorInstances.keys().next().value;
    }

    if (lruPaneId) {
      get().removeEditorInstance(lruPaneId);
    }
  },

  setActiveFileTokenCount: (count) => set({ activeFileTokenCount: count }),
}));
