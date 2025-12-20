import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AIProtocol = 'openai' | 'anthropic' | 'gemini';

export interface AIProviderConfig {
  id: string;
  name: string;
  protocol: AIProtocol;
  baseUrl: string;
  apiKey: string;
  models: string[];
  enabled: boolean;
}

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
  providers: AIProviderConfig[];
  currentProviderId: string;
  currentModel: string;
  enableAutocomplete: boolean;

  // Agent
  agentAutoApprove: boolean;

  // Actions
  setTheme: (theme: 'vs-dark' | 'light') => void;
  updateSettings: (settings: Partial<SettingsState>) => void;
  updateProviderConfig: (providerId: string, updates: Partial<AIProviderConfig>) => void;
  addProvider: (provider: AIProviderConfig) => void;
  removeProvider: (providerId: string) => void;
  setCurrentProviderAndModel: (providerId: string, modelName: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'vs-dark',
      fontSize: 14,
      showMinimap: true,
      showLineNumbers: true,
      tabSize: 2,
      wordWrap: 'on',
      
      providers: [
        {
          id: 'deepseek',
          name: 'DeepSeek',
          protocol: 'openai',
          baseUrl: 'https://api.deepseek.com/chat/completions',
          apiKey: '',
          models: ['deepseek-chat', 'deepseek-coder'],
          enabled: true,
        },
        {
          id: 'openai',
          name: 'OpenAI',
          protocol: 'openai',
          baseUrl: 'https://api.openai.com/v1/chat/completions',
          apiKey: '',
          models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
          enabled: false,
        },
        {
          id: 'zhipu',
          name: '智谱AI',
          protocol: 'openai',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
          apiKey: '',
          models: ['glm-4', 'glm-4v', 'glm-3-turbo'],
          enabled: false,
        },
        {
          id: 'kimi',
          name: 'Kimi (Moonshot)',
          protocol: 'openai',
          baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
          apiKey: '',
          models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
          enabled: false,
        },
        {
          id: 'minimax',
          name: 'Minimax',
          protocol: 'openai',
          baseUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2', // Minimax specific
          apiKey: '',
          models: ['abab6-chat', 'abab5.5-chat', 'abab5.5-chat-pro'],
          enabled: false,
        },
      ],
      currentProviderId: 'deepseek',
      currentModel: 'deepseek-chat',
      enableAutocomplete: true,
      agentAutoApprove: false,

      setTheme: (theme) => set({ theme }),
      updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
      
      updateProviderConfig: (providerId, updates) => set((state) => ({
        providers: state.providers.map(p => 
          p.id === providerId ? { ...p, ...updates } : p
        )
      })),

      addProvider: (newProvider) => set((state) => {
        // Ensure unique ID
        if (state.providers.some(p => p.id === newProvider.id)) {
          console.warn(`Provider with ID ${newProvider.id} already exists.`);
          return state;
        }
        return { providers: [...state.providers, newProvider] };
      }),

      removeProvider: (providerId) => set((state) => ({
        providers: state.providers.filter(p => p.id !== providerId),
        ...(state.currentProviderId === providerId && { // If current provider is removed, reset
          currentProviderId: state.providers[0]?.id || '',
          currentModel: state.providers[0]?.models[0] || '',
        })
      })),

      setCurrentProviderAndModel: (providerId, modelName) => set({ currentProviderId: providerId, currentModel: modelName }),
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
        providers: state.providers.map(p => ({
          ...p,
          // Don't persist API keys in the partialized state if not desired, 
          // or ensure they are handled securely. For now, persist.
        })),
        currentProviderId: state.currentProviderId,
        currentModel: state.currentModel,
        enableAutocomplete: state.enableAutocomplete,
        agentAutoApprove: state.agentAutoApprove,
      }),
    }
  )
);
