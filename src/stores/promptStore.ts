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
    console.log('[promptStore] 🔄 loadPrompts called');
    set({ isLoading: true, error: null });
    const rootPath = useFileStore.getState().rootPath;
    const expertMode = get().expertMode;

    console.log('[promptStore]   rootPath:', rootPath);
    console.log('[promptStore]   expertMode:', expertMode);

    if (!rootPath) {
        console.log('[promptStore] ❌ No rootPath, skipping load');
        set({ prompts: [], isLoading: false });
        return;
    }

    try {
      const params = {
        projectRoot: rootPath,
        expertMode: expertMode
      };
      console.log('[promptStore] 📡 Invoking list_prompts with params:', JSON.stringify(params));
      const result = await invoke('list_prompts', params);
      console.log('[promptStore] 📦 Raw result type:', typeof result);
      console.log('[promptStore] 📦 Raw result:', result);
      console.log('[promptStore] 📦 Is array?:', Array.isArray(result));

      const prompts = result as PromptTemplate[];
      console.log('[promptStore] ✅ Received prompts:', prompts.length);
      console.log('[promptStore]   Prompts:', prompts.map(p => ({ name: p.metadata.name, path: p.path })));
      set({ prompts, isLoading: false });
    } catch (err) {
      console.error('[promptStore] ❌ Failed to load prompts:', err);
      console.error('[promptStore]   Error type:', typeof err);
      console.error('[promptStore]   Error message:', String(err));
      console.error('[promptStore]   Error stack:', err instanceof Error ? err.stack : 'No stack');
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