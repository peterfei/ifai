import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { PromptTemplate } from '../types/prompt';
import { useFileStore } from './fileStore';
import i18n from 'i18next';

interface PromptState {
  prompts: PromptTemplate[];
  selectedPrompt: PromptTemplate | null;
  isLoading: boolean;
  error: string | null;
  expertMode: boolean;

  loadPrompts: () => Promise<void>;
  selectPrompt: (path: string) => Promise<void>;
  updatePrompt: (path: string, content: string) => Promise<void>;
  renderTemplate: (content: string, variables: Record<string, string>) => Promise<string>;
  toggleExpertMode: () => void;
}

export const usePromptStore = create<PromptState>((set, get) => ({
  prompts: [],
  selectedPrompt: null,
  isLoading: false,
  error: null,
  expertMode: false,

  loadPrompts: async () => {
    set({ isLoading: true, error: null });
    const rootPath = useFileStore.getState().rootPath;
    const expertMode = get().expertMode;

    if (!rootPath) {
        set({ prompts: [], isLoading: false });
        return;
    }

    try {
      const prompts = await invoke<PromptTemplate[]>('list_prompts', {
        projectRoot: rootPath,
        expertMode: expertMode
      });
      set({ prompts, isLoading: false });
    } catch (err) {
      console.error('Failed to load prompts:', err);
      set({ error: String(err), isLoading: false });
    }
  },

  selectPrompt: async (path: string) => {
    const rootPath = useFileStore.getState().rootPath;
    if (!rootPath) return;

    const locale = i18n.language;

    // First try to find in current list
    const prompt = get().prompts.find(p => p.path === path);
    
    try {
        set({ isLoading: true });
        const fetched = await invoke<PromptTemplate>('get_prompt', { 
            projectRoot: rootPath, 
            path,
            locale: locale || 'en-US' 
        });
        set({ selectedPrompt: fetched, isLoading: false });
    } catch (err) {
        console.error('Failed to select prompt:', err);
        set({ error: String(err), isLoading: false });
    }
  },

  updatePrompt: async (path: string, content: string) => {
      const rootPath = useFileStore.getState().rootPath;
      const expertMode = get().expertMode;
      if (!rootPath) return;

      try {
          // Backend returns the final path (handles builtin -> override transition)
          const finalPath = await invoke<string>('update_prompt', {
            projectRoot: rootPath,
            path,
            content,
            expertMode: expertMode
          });

          // Refresh the list to show the new file
          await get().loadPrompts();

          // Important: Switch selection to the new path
          await get().selectPrompt(finalPath);

      } catch (err) {
          console.error('Failed to update prompt:', err);
          // Don't set state error here if we want to show a toast or alert instead
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
  },

  toggleExpertMode: async () => {
    const currentMode = get().expertMode;
    set(state => ({ expertMode: !state.expertMode }));

    // Reload prompts with new expert mode setting
    await get().loadPrompts();
  },
}));