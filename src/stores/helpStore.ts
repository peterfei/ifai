/**
 * v0.3.0: 帮助弹窗状态管理
 *
 * 管理键盘快捷键弹窗和关于页面的全局状态
 */

import { create } from 'zustand';

interface HelpState {
  isKeyboardShortcutsOpen: boolean;
  isAboutOpen: boolean;
  openKeyboardShortcuts: () => void;
  closeKeyboardShortcuts: () => void;
  openAbout: () => void;
  closeAbout: () => void;
}

export const useHelpStore = create<HelpState>((set) => ({
  isKeyboardShortcutsOpen: false,
  isAboutOpen: false,

  openKeyboardShortcuts: () => set({ isKeyboardShortcutsOpen: true }),
  closeKeyboardShortcuts: () => set({ isKeyboardShortcutsOpen: false }),

  openAbout: () => set({ isAboutOpen: true }),
  closeAbout: () => set({ isAboutOpen: false }),
}));
