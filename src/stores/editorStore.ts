import { create } from 'zustand';
import { editor } from 'monaco-editor';

interface EditorState {
  editorInstance: editor.IStandaloneCodeEditor | null;
  theme: 'vs-dark' | 'light';
  
  setEditorInstance: (instance: editor.IStandaloneCodeEditor) => void;
  setTheme: (theme: 'vs-dark' | 'light') => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  editorInstance: null,
  theme: 'vs-dark', // Default to dark theme

  setEditorInstance: (instance) => set({ editorInstance: instance }),
  setTheme: (theme) => set({ theme }),
}));
