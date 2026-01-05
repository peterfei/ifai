import { create } from 'zustand';
import { Snippet, SnippetFilter } from '../types/snippet';
import { databaseManager } from '../utils/databaseManager';
import { v4 as uuidv4 } from 'uuid';
import { useFileStore } from './fileStore';
import { useLayoutStore } from './layoutStore';

interface SnippetState {
  snippets: Snippet[];
  isLoading: boolean;
  activeSnippetId: string | null;
  filter: SnippetFilter;
  
  // Actions
  fetchSnippets: () => Promise<void>;
  addSnippet: (snippet: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateSnippet: (id: string, data: Partial<Snippet>) => Promise<void>;
  deleteSnippet: (id: string) => Promise<void>;
  setActiveSnippet: (id: string | null) => void;
  setFilter: (filter: Partial<SnippetFilter>) => void;
  
  // Bulk Actions (for testing)
  bulkAddSnippets: (snippets: Snippet[]) => Promise<void>;
  clearAll: () => Promise<void>;
  openSnippetAsFile: (snippet: Snippet) => void;
}

export const useSnippetStore = create<SnippetState>((set, get) => ({
  snippets: [],
  isLoading: false,
  activeSnippetId: null,
  filter: {},

  fetchSnippets: async () => {
    set({ isLoading: true });
    try {
      const { filter } = get();
      let results: Snippet[];
      
      if (filter.search) {
        results = await databaseManager.search<Snippet>('snippets', filter.search);
      } else {
        // Simple query for all
        results = await databaseManager.query<Snippet>('snippets', () => true);
      }

      // Apply client-side filters (language, tags, favorite)
      if (filter.language) {
        results = results.filter(s => s.language === filter.language);
      }
      if (filter.isFavorite !== undefined) {
        results = results.filter(s => s.isFavorite === filter.isFavorite);
      }
      if (filter.tags && filter.tags.length > 0) {
        results = results.filter(s => filter.tags?.every(tag => s.tags.includes(tag)));
      }

      // Sort by updatedAt desc
      results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      set({ snippets: results, isLoading: false });
    } catch (error) {
      console.error('[SnippetStore] Failed to fetch snippets:', error);
      set({ isLoading: false });
    }
  },

  addSnippet: async (data) => {
    const now = new Date().toISOString();
    const newSnippet: Snippet = {
      ...data,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    
    await databaseManager.create('snippets', newSnippet);
    await get().fetchSnippets();
    return newSnippet.id;
  },

  updateSnippet: async (id, data) => {
    const updateData = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    
    await databaseManager.update('snippets', id, updateData);
    await get().fetchSnippets();
  },

  deleteSnippet: async (id) => {
    await databaseManager.delete('snippets', id);
    if (get().activeSnippetId === id) {
      set({ activeSnippetId: null });
    }
    await get().fetchSnippets();
  },

  setActiveSnippet: (id) => set({ activeSnippetId: id }),

  setFilter: (newFilter) => {
    set((state) => ({ filter: { ...state.filter, ...newFilter } }));
    get().fetchSnippets();
  },

  bulkAddSnippets: async (items) => {
    set({ isLoading: true });
    try {
      await databaseManager.bulkCreate('snippets', items);
      await get().fetchSnippets();
    } finally {
      set({ isLoading: false });
    }
  },

  clearAll: async () => {
    await databaseManager.clear('snippets');
    set({ snippets: [], activeSnippetId: null });
  },

  openSnippetAsFile: (snippet) => {
    console.log('[SnippetStore] Opening snippet:', snippet.id);
    const fileStore = useFileStore.getState();
    const layoutStore = useLayoutStore.getState();
    const virtualPath = `snippet://${snippet.id}`;
    
    const fileId = fileStore.openFile({
      id: snippet.id, 
      path: virtualPath,
      name: snippet.title || 'untitled',
      content: snippet.code,
      language: snippet.language,
      isDirty: false
    });
    
    console.log('[SnippetStore] File opened in store, ID:', fileId);

    // Ensure the file is assigned to a pane
    let targetPaneId = layoutStore.activePaneId;
    if (!targetPaneId && layoutStore.panes.length > 0) {
      targetPaneId = layoutStore.panes[0].id;
    }
    
    if (targetPaneId) {
      console.log('[SnippetStore] Assigning snippet to pane:', targetPaneId);
      layoutStore.assignFileToPane(targetPaneId, fileId);
    } else {
      console.warn('[SnippetStore] No pane found to display snippet');
    }

    // Close PromptManager to ensure editor is visible
    if (layoutStore.isPromptManagerOpen) {
      layoutStore.setPromptManagerOpen(false);
    }
    
    set({ activeSnippetId: snippet.id });
  }
}));
