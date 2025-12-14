import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SettingsState {
  // Appearance
  theme: 'vs-dark' | 'light';
  fontSize: number;
  showMinimap: boolean;
  showLineNumbers: boolean;
  
  // Editor
  tabSize: number;
  wordWrap: 'on' | 'off';

  // AI
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
  enableAutocomplete: boolean;

  // Actions
  setTheme: (theme: 'vs-dark' | 'light') => void;
  updateSettings: (settings: Partial<SettingsState>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'vs-dark',
      fontSize: 14,
      showMinimap: true,
      showLineNumbers: true,
      tabSize: 2,
      wordWrap: 'on',
      
      aiApiKey: '',
      aiBaseUrl: 'https://api.deepseek.com/chat/completions',
      aiModel: 'deepseek-chat',
      enableAutocomplete: true,

      setTheme: (theme) => set({ theme }),
      updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
    }),
    {
      name: 'settings-storage',
      partialize: (state) => ({ 
        theme: state.theme,
        fontSize: state.fontSize,
        showMinimap: state.showMinimap,
        showLineNumbers: state.showLineNumbers,
        tabSize: state.tabSize,
        wordWrap: state.wordWrap,
        aiApiKey: state.aiApiKey,
        aiBaseUrl: state.aiBaseUrl,
        aiModel: state.aiModel,
        enableAutocomplete: state.enableAutocomplete
      }),
    }
  )
);
