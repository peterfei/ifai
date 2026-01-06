import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface KeyBinding {
  id: string;
  commandId: string;
  keys: string; // e.g. "Mod+s", "Mod+Shift+p"
  label: string;
  description?: string;
  category?: string;
  scheme?: 'ifai' | 'vscode' | 'intellij'; // Add scheme property
}

export interface ShortcutState {
  keybindings: KeyBinding[];
  activeScheme: 'ifai' | 'vscode' | 'intellij'; // New state variable
  
  // Actions
  registerShortcut: (binding: KeyBinding) => void;
  updateShortcut: (id: string, newKeys: string) => string | boolean;
  resetShortcuts: () => void;
  setScheme: (scheme: 'ifai' | 'vscode' | 'intellij') => void; // New action
  importKeybindings: (newBindings: KeyBinding[]) => boolean;
  exportKeybindings: () => KeyBinding[];
  getKeybinding: (commandId: string) => string | undefined;
  hasConflict: (keys: string, excludeId?: string) => string | undefined; // Returns id of conflicting shortcut or undefined
}

const IFAI_DEFAULT_KEYBINDINGS: KeyBinding[] = [
  { id: 'file.save', commandId: 'file.save', keys: 'Mod+s', label: 'Save File', category: 'File', scheme: 'ifai' },
  { id: 'editor.find', commandId: 'editor.find', keys: 'Mod+f', label: 'Find', category: 'Editor', scheme: 'ifai' },
  { id: 'view.toggleChat', commandId: 'view.toggleChat', keys: 'Mod+l', label: 'Toggle Chat', category: 'View', scheme: 'ifai' },
  { id: 'view.commandPalette', commandId: 'view.commandPalette', keys: 'Mod+p', label: 'Command Palette', category: 'View', scheme: 'ifai' },
  { id: 'view.toggleTerminal', commandId: 'view.toggleTerminal', keys: 'Mod+j', label: 'Toggle Terminal', category: 'View', scheme: 'ifai' },
  { id: 'view.togglePerformanceMonitor', commandId: 'view.togglePerformanceMonitor', keys: 'Mod+Alt+p', label: 'Toggle Performance Monitor', category: 'View', scheme: 'ifai' },
  { id: 'perf.toggleCacheStats', commandId: 'perf.toggleCacheStats', keys: 'Mod+Shift+c', label: 'Toggle Cache Stats', category: 'Developer', scheme: 'ifai' },
  { id: 'layout.splitVertical', commandId: 'layout.splitVertical', keys: 'Mod+Shift+\\', label: 'Split Vertical', category: 'Layout', scheme: 'ifai' },
  { id: 'layout.splitHorizontal', commandId: 'layout.splitHorizontal', keys: 'Mod+\\', label: 'Split Horizontal', category: 'Layout', scheme: 'ifai' },
  { id: 'layout.closePane', commandId: 'layout.closePane', keys: 'Mod+w', label: 'Close Pane', category: 'Layout', scheme: 'ifai' },
  { id: 'layout.focusPane1', commandId: 'layout.focusPane1', keys: 'Mod+1', label: 'Focus Pane 1', category: 'Layout', scheme: 'ifai' },
  { id: 'layout.focusPane2', commandId: 'layout.focusPane2', keys: 'Mod+2', label: 'Focus Pane 2', category: 'Layout', scheme: 'ifai' },
  { id: 'layout.focusPane3', commandId: 'layout.focusPane3', keys: 'Mod+3', label: 'Focus Pane 3', category: 'Layout', scheme: 'ifai' },
  { id: 'layout.focusPane4', commandId: 'layout.focusPane4', keys: 'Mod+4', label: 'Focus Pane 4', category: 'Layout', scheme: 'ifai' },
  { id: 'layout.toggleSidebar', commandId: 'layout.toggleSidebar', keys: 'Mod+b', label: 'Toggle Sidebar', category: 'Layout', scheme: 'ifai' },
];

const VSCODE_KEYBINDINGS: KeyBinding[] = [
  { id: 'file.save', commandId: 'file.save', keys: 'Mod+s', label: 'Save File', category: 'File', scheme: 'vscode' },
  { id: 'editor.find', commandId: 'editor.find', keys: 'Mod+f', label: 'Find', category: 'Editor', scheme: 'vscode' },
  { id: 'view.toggleChat', commandId: 'view.toggleChat', keys: 'Mod+l', label: 'Toggle Chat', category: 'View', scheme: 'vscode' },
  { id: 'view.commandPalette', commandId: 'view.commandPalette', keys: 'Mod+Shift+p', label: 'Command Palette', category: 'View', scheme: 'vscode' }, // Different binding
  { id: 'view.toggleTerminal', commandId: 'view.toggleTerminal', keys: 'Ctrl+`', label: 'Toggle Terminal', category: 'View', scheme: 'vscode' }, // Different binding
  { id: 'view.togglePerformanceMonitor', commandId: 'view.togglePerformanceMonitor', keys: 'Mod+Alt+p', label: 'Toggle Performance Monitor', category: 'View', scheme: 'vscode' },
  { id: 'perf.toggleCacheStats', commandId: 'perf.toggleCacheStats', keys: 'Mod+Shift+c', label: 'Toggle Cache Stats', category: 'Developer', scheme: 'vscode' },
  { id: 'layout.splitVertical', commandId: 'layout.splitVertical', keys: 'Mod+Shift+\\', label: 'Split Vertical', category: 'Layout', scheme: 'vscode' },
  { id: 'layout.splitHorizontal', commandId: 'layout.splitHorizontal', keys: 'Mod+`', label: 'Split Horizontal', category: 'Layout', scheme: 'vscode' }, // Different binding
  { id: 'layout.closePane', commandId: 'layout.closePane', keys: 'Mod+w', label: 'Close Pane', category: 'Layout', scheme: 'vscode' },
  { id: 'layout.focusPane1', commandId: 'layout.focusPane1', keys: 'Mod+1', label: 'Focus Pane 1', category: 'Layout', scheme: 'vscode' },
  { id: 'layout.focusPane2', commandId: 'layout.focusPane2', keys: 'Mod+2', label: 'Focus Pane 2', category: 'Layout', scheme: 'vscode' },
  { id: 'layout.focusPane3', commandId: 'layout.focusPane3', keys: 'Mod+3', label: 'Focus Pane 3', category: 'Layout', scheme: 'vscode' },
  { id: 'layout.focusPane4', commandId: 'layout.focusPane4', keys: 'Mod+4', label: 'Focus Pane 4', category: 'Layout', scheme: 'vscode' },
  { id: 'layout.toggleSidebar', commandId: 'layout.toggleSidebar', keys: 'Mod+b', label: 'Toggle Sidebar', category: 'Layout', scheme: 'vscode' },
];

const INTELLIJ_KEYBINDINGS: KeyBinding[] = [
  { id: 'file.save', commandId: 'file.save', keys: 'Mod+s', label: 'Save File', category: 'File', scheme: 'intellij' },
  { id: 'editor.find', commandId: 'editor.find', keys: 'Mod+f', label: 'Find', category: 'Editor', scheme: 'intellij' },
  { id: 'view.toggleChat', commandId: 'view.toggleChat', keys: 'Mod+l', label: 'Toggle Chat', category: 'View', scheme: 'intellij' },
  { id: 'view.commandPalette', commandId: 'view.commandPalette', keys: 'Shift+Shift', label: 'Search Everywhere', category: 'View', scheme: 'intellij' }, // Example different binding
  { id: 'view.toggleTerminal', commandId: 'view.toggleTerminal', keys: 'Alt+F12', label: 'Toggle Terminal', category: 'View', scheme: 'intellij' }, // Example different binding
  { id: 'layout.splitVertical', commandId: 'layout.splitVertical', keys: 'Mod+Shift+v', label: 'Split Vertical', category: 'Layout', scheme: 'intellij' }, // Different binding
  { id: 'layout.splitHorizontal', commandId: 'layout.splitHorizontal', keys: 'Mod+Alt+h', label: 'Split Horizontal', category: 'Layout', scheme: 'intellij' }, // Different binding
  { id: 'layout.closePane', commandId: 'layout.closePane', keys: 'Mod+Shift+f4', label: 'Close Pane', category: 'Layout', scheme: 'intellij' }, // Different binding
  { id: 'layout.focusPane1', commandId: 'layout.focusPane1', keys: 'Alt+1', label: 'Focus Pane 1', category: 'Layout', scheme: 'intellij' }, // Different binding
  { id: 'layout.focusPane2', commandId: 'layout.focusPane2', keys: 'Alt+2', label: 'Focus Pane 2', category: 'Layout', scheme: 'intellij' }, // Different binding
  { id: 'layout.focusPane3', commandId: 'layout.focusPane3', keys: 'Alt+3', label: 'Focus Pane 3', category: 'Layout', scheme: 'intellij' }, // Different binding
  { id: 'layout.focusPane4', commandId: 'layout.focusPane4', keys: 'Alt+4', label: 'Focus Pane 4', category: 'Layout', scheme: 'intellij' }, // Different binding
  { id: 'layout.toggleSidebar', commandId: 'layout.toggleSidebar', keys: 'Mod+b', label: 'Toggle Sidebar', category: 'Layout', scheme: 'intellij' },
];

const PRESET_SCHEMES = {
  'ifai': IFAI_DEFAULT_KEYBINDINGS,
  'vscode': VSCODE_KEYBINDINGS,
  'intellij': INTELLIJ_KEYBINDINGS,
};

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set, get) => ({
      keybindings: IFAI_DEFAULT_KEYBINDINGS, // Use new default
      activeScheme: 'ifai', // Set initial active scheme

      registerShortcut: (binding) => set((state) => {
        if (state.keybindings.find(k => k.id === binding.id)) return state;
        return { keybindings: [...state.keybindings, binding] };
      }),

      updateShortcut: (id, newKeys) => {
        const conflictingId = get().hasConflict(newKeys, id);
        if (conflictingId) {
          return conflictingId; // Return the ID of the conflicting shortcut
        }

        set((state) => ({
          keybindings: state.keybindings.map(kb => 
            kb.id === id ? { ...kb, keys: newKeys } : kb
          )
        }));
        return true; // Indicate success
      },

      resetShortcuts: () => {
        const currentScheme = get().activeScheme;
        set({ keybindings: PRESET_SCHEMES[currentScheme] });
      },

      setScheme: (scheme) => {
        set({ activeScheme: scheme, keybindings: PRESET_SCHEMES[scheme] });
      },

      importKeybindings: (newBindings: KeyBinding[]) => {
        if (!Array.isArray(newBindings)) return false;
        
        // Basic validation
        const isValid = newBindings.every(b => b.id && b.commandId && b.keys);
        if (!isValid) return false;

        set({ keybindings: newBindings });
        return true;
      },

      exportKeybindings: () => get().keybindings,

      getKeybinding: (commandId) => {
        return get().keybindings.find(kb => kb.commandId === commandId)?.keys;
      },

      hasConflict: (keys: string, excludeId?: string) => {
        const normalizedKeys = keys.toLowerCase();
        return get().keybindings.find(kb => 
          kb.id !== excludeId && kb.keys.toLowerCase() === normalizedKeys
        )?.id;
      }
    }),
    {
      name: 'shortcut-storage',
      version: 1,
      migrate: (persistedState: any, version: number) => {
        console.log(`[ShortcutStore] Migrating from version ${version} to 1`);
        return persistedState;
      },
    }
  )
);