import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { PromptTemplate } from '../types/prompt';
import { useFileStore } from './fileStore';

interface PromptState {
  prompts: PromptTemplate[];
  selectedPrompt: PromptTemplate | null;
  isLoading: boolean;
  error: string | null;

  loadPrompts: () => Promise<void>;
  selectPrompt: (path: string) => Promise<void>;
  updatePrompt: (path: string, content: string) => Promise<void>;
  renderTemplate: (content: string, variables: Record<string, string>) => Promise<string>;
}

export const usePromptStore = create<PromptState>((set, get) => ({
  prompts: [],
  selectedPrompt: null,
  isLoading: false,
  error: null,

  loadPrompts: async () => {
    set({ isLoading: true, error: null });
    const rootPath = useFileStore.getState().rootPath;
    console.log('[PromptStore] loadPrompts called. rootPath:', rootPath);
    
    if (!rootPath) {
        console.warn('[PromptStore] No rootPath available. Cannot load prompts.');
        set({ prompts: [], isLoading: false });
        return;
    }

    try {
      const prompts = await invoke<PromptTemplate[]>('list_prompts', { projectRoot: rootPath });
      console.log('[PromptStore] list_prompts result:', prompts);
      set({ prompts, isLoading: false });
    } catch (err) {
      console.error('[PromptStore] Failed to load prompts:', err);
      set({ error: String(err), isLoading: false });
    }
  },

  selectPrompt: async (path: string) => {
    const rootPath = useFileStore.getState().rootPath;
    if (!rootPath) return;

    const prompt = get().prompts.find(p => p.path === path);
    if (prompt) {
        set({ selectedPrompt: prompt });
    } else {
        try {
            const fetched = await invoke<PromptTemplate>('get_prompt', { projectRoot: rootPath, path });
            set({ selectedPrompt: fetched });
        } catch (err) {
            console.error('Failed to select prompt:', err);
            set({ error: String(err) });
        }
    }
  },

  updatePrompt: async (path: string, content: string) => {
      const rootPath = useFileStore.getState().rootPath;
      if (!rootPath) return;

      try {
          await invoke('update_prompt', { projectRoot: rootPath, path, content });
          
          // Refresh list to ensure metadata is updated
          await get().loadPrompts();
          
          // Update selected prompt content immediately for better UX
          const selected = get().selectedPrompt;
          if (selected && selected.path === path) {
             const updated = await invoke<PromptTemplate>('get_prompt', { projectRoot: rootPath, path });
             set({ selectedPrompt: updated });
          }
      } catch (err) {
          console.error('Failed to update prompt:', err);
          set({ error: String(err) });
          throw err;
      }
  },
  
  renderTemplate: async (content: string, variables: Record<string, string>) => {
      try {
        return await invoke<string>('render_prompt_template', { content, variables });
      } catch (err) {
          console.error('Render error:', err);
          return `Error rendering template: ${err}`;
      }
  }
}));
