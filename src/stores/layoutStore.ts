import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Pane {
  id: string;
  fileId?: string;
  size: number; // 百分比 (0-100)
  position: { x: number; y: number };
}

import { useFileStore } from './fileStore'; // Import fileStore

export interface LayoutState {
  // 现有 UI 状态
  isChatOpen: boolean;
  isCommandPaletteOpen: boolean;
  isTerminalOpen: boolean;
  isSettingsOpen: boolean;
  isPromptManagerOpen: boolean;
  chatWidth: number;

  // v0.2.6 新增：侧边栏状态
  isSidebarOpen: boolean;
  sidebarPosition: 'left' | 'right';
  sidebarWidth: number;
  sidebarActiveTab: 'explorer' | 'search' | 'snippets';  // 侧边栏活动标签页

  // 分屏状态
  panes: Pane[];
  activePaneId: string | null;
  splitDirection: 'horizontal' | 'vertical';

  // 操作函数
  setChatOpen: (isOpen: boolean) => void;
  toggleChat: () => void;
  setPromptManagerOpen: (isOpen: boolean) => void;
  togglePromptManager: () => void;
  setCommandPaletteOpen: (isOpen: boolean) => void;
  toggleCommandPalette: () => void;
  setTerminalOpen: (isOpen: boolean) => void;
  toggleTerminal: () => void;
  setSettingsOpen: (isOpen: boolean) => void;
  toggleSettings: () => void;
  setChatWidth: (width: number) => void;

  // v0.2.6 新增：侧边栏操作
  setSidebarOpen: (isOpen: boolean) => void;
  toggleSidebar: () => void;
  setSidebarPosition: (position: 'left' | 'right') => void;
  setSidebarWidth: (width: number) => void;
  setSidebarActiveTab: (tab: 'explorer' | 'search' | 'snippets') => void;

  // 分屏操作
  splitPane: (direction: 'horizontal' | 'vertical', targetPaneId?: string) => void;
  closePane: (paneId: string) => void;
  setActivePane: (paneId: string) => void;
  resizePane: (paneId: string, newSize: number) => void;
  assignFileToPane: (paneId: string, fileId: string) => void;
  resetLayout: () => void;
  validateLayout: () => void; // New action
  syncState: (state: Partial<LayoutState>) => void;
}

const MAX_PANES = 4;
const MIN_PANE_SIZE = 20; // 最小窗格大小 (百分比)

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      // 现有 UI 状态
      isChatOpen: true,
      isCommandPaletteOpen: false,
      isTerminalOpen: false,
      isSettingsOpen: false,
      isPromptManagerOpen: false,
      chatWidth: 384,

      // v0.2.6 新增：侧边栏初始状态
      isSidebarOpen: true,
      sidebarPosition: 'left',
      sidebarWidth: 250,
      sidebarActiveTab: 'explorer',

      // 分屏状态
      panes: [
        {
          id: 'pane-1',
          fileId: undefined,
          size: 100,
          position: { x: 0, y: 0 },
        },
      ],
      activePaneId: 'pane-1',
      splitDirection: 'horizontal',

      syncState: (newState) => set((state) => ({ ...state, ...newState })),

      // 现有操作函数
      setChatOpen: (isOpen) => set({ isChatOpen: isOpen }),
      toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
      setPromptManagerOpen: (isOpen) => set({ isPromptManagerOpen: isOpen }),
      togglePromptManager: () => set((state) => ({ isPromptManagerOpen: !state.isPromptManagerOpen })),
      setCommandPaletteOpen: (isOpen) => set({ isCommandPaletteOpen: isOpen }),
      toggleCommandPalette: () => set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
      setTerminalOpen: (isOpen) => set({ isTerminalOpen: isOpen }),
      toggleTerminal: () => set((state) => ({ isTerminalOpen: !state.isTerminalOpen })),
      setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
      toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
      setChatWidth: (width) => set({ chatWidth: width }),

      // v0.2.6 新增：侧边栏操作函数
      setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarPosition: (position) => set({ sidebarPosition: position }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(150, Math.min(500, width)) }),
      setSidebarActiveTab: (tab) => set({ sidebarActiveTab: tab }),

      // 分屏操作
      splitPane: (direction, targetPaneId) => {
        const state = get();
        const targetId = targetPaneId || state.activePaneId;

        if (!targetId) return;
        if (state.panes.length >= MAX_PANES) {
          console.warn('已达到最大窗格数量限制');
          return;
        }

        const targetPane = state.panes.find(p => p.id === targetId);
        if (!targetPane) return;

        const newPaneId = `pane-${Date.now()}`;
        const newSize = targetPane.size / 2;

        const updatedPanes = state.panes.map(p => {
          if (p.id === targetId) {
            return { ...p, size: newSize };
          }
          return p;
        });

        const newPane: Pane = {
          id: newPaneId,
          fileId: undefined, // 新窗格为空
          size: newSize,
          position: { x: targetPane.position.x, y: targetPane.position.y },
        };

        set({
          panes: [...updatedPanes, newPane],
          activePaneId: newPaneId,
          splitDirection: direction,
        });
      },

      closePane: (paneId) => {
        const state = get();
        if (state.panes.length <= 1) {
          console.warn('至少需要保留一个窗格');
          return;
        }

        const paneToRemove = state.panes.find(p => p.id === paneId);
        if (!paneToRemove) return;

        const remainingPanes = state.panes.filter(p => p.id !== paneId);
        const newPaneCount = remainingPanes.length;

        // 重新分配大小
        const equalSize = 100 / newPaneCount;
        const normalizedPanes = remainingPanes.map((p, index) => ({
          ...p,
          size: equalSize,
        }));

        const newActivePane = normalizedPanes[0].id;

        set({
          panes: normalizedPanes,
          activePaneId: newActivePane,
        });
      },

      setActivePane: (paneId) => {
        set({ activePaneId: paneId });
      },

      resizePane: (paneId, newSize) => {
        const state = get();
        const clampedSize = Math.max(MIN_PANE_SIZE, Math.min(100 - MIN_PANE_SIZE, newSize));

        const paneIndex = state.panes.findIndex(p => p.id === paneId);
        if (paneIndex === -1) return;

        const oldSize = state.panes[paneIndex].size;
        const sizeDelta = clampedSize - oldSize;

        // 简单实现：调整相邻窗格的大小
        const updatedPanes = [...state.panes];
        updatedPanes[paneIndex].size = clampedSize;

        // 调整下一个窗格的大小（如果有）
        const nextPaneIndex = (paneIndex + 1) % updatedPanes.length;
        if (nextPaneIndex !== paneIndex) {
          const nextNewSize = Math.max(MIN_PANE_SIZE, updatedPanes[nextPaneIndex].size - sizeDelta);
          updatedPanes[nextPaneIndex].size = nextNewSize;

          // 归一化确保总和为100%
          const totalSize = updatedPanes.reduce((sum, p) => sum + p.size, 0);
          if (totalSize !== 100) {
            const scaleFactor = 100 / totalSize;
            updatedPanes.forEach(p => {
              p.size = Math.round(p.size * scaleFactor * 10) / 10;
            });
          }
        }

        set({ panes: updatedPanes });
      },

      assignFileToPane: (paneId, fileId) => {
        const state = get();
        const updatedPanes = state.panes.map(p => {
          if (p.id === paneId) {
            return { ...p, fileId };
          }
          return p;
        });
        set({ panes: updatedPanes, activePaneId: paneId });
      },

      resetLayout: () => {
        set({
          panes: [
            {
              id: 'pane-1',
              fileId: undefined,
              size: 100,
              position: { x: 0, y: 0 },
            },
          ],
          activePaneId: 'pane-1',
          splitDirection: 'horizontal',
        });
      },

      validateLayout: () => {
        const state = get();
        const { openedFiles } = useFileStore.getState();
        const validFileIds = new Set(openedFiles.map(f => f.id));

        const validatedPanes = state.panes.map(pane => {
          if (pane.fileId && !validFileIds.has(pane.fileId)) {
            return { ...pane, fileId: undefined };
          }
          return pane;
        });

        // Only update if changes were made
        if (JSON.stringify(validatedPanes) !== JSON.stringify(state.panes)) {
            set({ panes: validatedPanes });
        }
      },
    }),
    {
      name: 'layout-storage',
      partialize: (state) => ({
        panes: state.panes,
        activePaneId: state.activePaneId,
        splitDirection: state.splitDirection,
        chatWidth: state.chatWidth,
        sidebarActiveTab: state.sidebarActiveTab,
        // v0.2.6 新增：持久化侧边栏状态
        isSidebarOpen: state.isSidebarOpen,
        sidebarPosition: state.sidebarPosition,
        sidebarWidth: state.sidebarWidth,
      }),
    }
  )
);