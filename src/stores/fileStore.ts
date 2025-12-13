import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { FileNode, OpenedFile } from './types';

interface FileState {
  fileTree: FileNode | null;
  openedFiles: OpenedFile[];
  activeFileId: string | null;
  
  setFileTree: (tree: FileNode) => void;
  openFile: (file: OpenedFile) => void;
  closeFile: (id: string) => void;
  setActiveFile: (id: string) => void;
  updateFileContent: (id: string, content: string) => void;
  setFileDirty: (id: string, isDirty: boolean) => void;
}

export const useFileStore = create<FileState>((set) => ({
  fileTree: null,
  openedFiles: [],
  activeFileId: null,

  setFileTree: (tree) => set({ fileTree: tree }),

  openFile: (file) => set((state) => {
    const existing = state.openedFiles.find(f => f.path === file.path);
    if (existing) {
      return { activeFileId: existing.id };
    }
    return {
      openedFiles: [...state.openedFiles, file],
      activeFileId: file.id,
    };
  }),

  closeFile: (id) => set((state) => {
    const newFiles = state.openedFiles.filter(f => f.id !== id);
    let newActiveId = state.activeFileId;
    if (state.activeFileId === id) {
      newActiveId = newFiles.length > 0 ? newFiles[newFiles.length - 1].id : null;
    }
    return {
      openedFiles: newFiles,
      activeFileId: newActiveId,
    };
  }),

  setActiveFile: (id) => set({ activeFileId: id }),

  updateFileContent: (id, content) => set((state) => ({
    openedFiles: state.openedFiles.map(f => 
      f.id === id ? { ...f, content, isDirty: true } : f
    ),
  })),

  setFileDirty: (id, isDirty) => set((state) => ({
    openedFiles: state.openedFiles.map(f => 
      f.id === id ? { ...f, isDirty } : f
    ),
  })),
}));
