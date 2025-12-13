import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { FileNode, OpenedFile } from './types';

interface FileState {
  fileTree: FileNode | null;
  rootPath: string | null;
  openedFiles: OpenedFile[];
  activeFileId: string | null;
  
  setFileTree: (tree: FileNode) => void;
  setRootPath: (path: string | null) => void;
  openFile: (file: OpenedFile) => void;
  closeFile: (id: string) => void;
  setActiveFile: (id: string) => void;
  updateFileContent: (id: string, content: string) => void;
  setFileDirty: (id: string, isDirty: boolean) => void;
}

export const useFileStore = create<FileState>()(
  persist(
    (set) => ({
      fileTree: null,
      rootPath: null,
      openedFiles: [],
      activeFileId: null,

      setFileTree: (tree) => set({ fileTree: tree, rootPath: tree.path }),
      setRootPath: (path) => set({ rootPath: path }),

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
    }),
    {
      name: 'file-storage',
      partialize: (state) => ({ 
        openedFiles: state.openedFiles, 
        activeFileId: state.activeFileId,
        rootPath: state.rootPath 
      }),
    }
  )
);
