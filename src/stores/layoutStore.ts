import { create } from 'zustand';

interface LayoutState {
  isChatOpen: boolean;
  isCommandPaletteOpen: boolean;
  isTerminalOpen: boolean;
  isSettingsOpen: boolean;
  setChatOpen: (isOpen: boolean) => void;
  toggleChat: () => void;
  setCommandPaletteOpen: (isOpen: boolean) => void;
  toggleCommandPalette: () => void;
  setTerminalOpen: (isOpen: boolean) => void;
  toggleTerminal: () => void;
  setSettingsOpen: (isOpen: boolean) => void;
  toggleSettings: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  isChatOpen: true, // Default open
  isCommandPaletteOpen: false,
  isTerminalOpen: false,
  isSettingsOpen: false,
  setChatOpen: (isOpen) => set({ isChatOpen: isOpen }),
  toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
  setCommandPaletteOpen: (isOpen) => set({ isCommandPaletteOpen: isOpen }),
  toggleCommandPalette: () => set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
  setTerminalOpen: (isOpen) => set({ isTerminalOpen: isOpen }),
  toggleTerminal: () => set((state) => ({ isTerminalOpen: !state.isTerminalOpen })),
  setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
}));
