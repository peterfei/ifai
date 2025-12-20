import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ChatUIState {
  inputHistory: string[];
  historyIndex: number;
  
  addToHistory: (command: string) => void;
  setHistoryIndex: (index: number) => void;
  resetHistoryIndex: () => void;
  getHistoryItem: (index: number) => string | null;
}

export const useChatUIStore = create<ChatUIState>()(
  persist(
    (set, get) => ({
      inputHistory: [],
      historyIndex: -1,

      addToHistory: (command) => {
        if (!command.trim()) return;
        const { inputHistory } = get();
        // Don't add if same as last entry
        if (inputHistory.length > 0 && inputHistory[0] === command) {
          set({ historyIndex: -1 });
          return;
        }
        
        set({
          inputHistory: [command, ...inputHistory].slice(0, 100),
          historyIndex: -1
        });
      },

      setHistoryIndex: (index) => set({ historyIndex: index }),
      
      resetHistoryIndex: () => set({ historyIndex: -1 }),

      getHistoryItem: (index) => {
        const { inputHistory } = get();
        if (index >= 0 && index < inputHistory.length) {
          return inputHistory[index];
        }
        return null;
      }
    }),
    {
      name: 'chat-ui-storage',
    }
  )
);
