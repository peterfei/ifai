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
  fontFamily: string;
  lineHeight: number;
  fontLigatures: boolean;
  showMinimap: boolean;
  showLineNumbers: boolean;
  
  // Editor
  tabSize: number;
  wordWrap: 'on' | 'off';
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
  cursorSmoothCaretAnimation: 'on' | 'off';
  smoothScrolling: boolean;
  bracketPairColorization: boolean;
  renderWhitespace: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
  formatOnSave: boolean;

  // AI
  providers: AIProviderConfig[];
  currentProviderId: string;
  currentModel: string;
  enableAutocomplete: boolean;

  // Agent
  agentAutoApprove: boolean;
  enableNaturalLanguageAgentTrigger: boolean;
  agentTriggerConfidenceThreshold: number;

  // RAG
  enableAutoRAG: boolean;
  enableSmartRAG: boolean;
  ragMode: 'auto' | 'manual' | 'always';

  // Performance
  performanceMode: 'auto' | 'high' | 'medium' | 'low';
  targetFPS: number;
  enableGPUAcceleration: boolean;
  showPerformanceMonitor: boolean;
  enableAutoDowngrade: boolean;

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
      fontSize: 16,
      fontFamily: "'Fira Code', Consolas, 'Courier New', monospace",
      lineHeight: 24,
      fontLigatures: true,
      showMinimap: false, // User had minimap chars disabled and common preference is off for small screens
      showLineNumbers: true,
      tabSize: 2,
      wordWrap: 'on',
      cursorBlinking: 'expand',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      bracketPairColorization: true,
      renderWhitespace: 'selection',
      formatOnSave: true,
      
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
          models: ['glm-4.7', 'glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4', 'glm-4v', 'glm-3-turbo'],
          enabled: true,
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
      ],
      currentProviderId: 'zhipu',
      currentModel: 'glm-4.7',
      enableAutocomplete: true,
      agentAutoApprove: false,
      enableNaturalLanguageAgentTrigger: true,
      agentTriggerConfidenceThreshold: 0.6,  // 降低阈值以提高触发敏感度

      // RAG settings
      enableAutoRAG: true,
      enableSmartRAG: true,
      ragMode: 'auto',

      performanceMode: 'auto',
      targetFPS: 60,
      enableGPUAcceleration: true,
      showPerformanceMonitor: false,
      enableAutoDowngrade: true,

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
        fontFamily: state.fontFamily,
        lineHeight: state.lineHeight,
        fontLigatures: state.fontLigatures,
        showMinimap: state.showMinimap,
        showLineNumbers: state.showLineNumbers,
        tabSize: state.tabSize,
        wordWrap: state.wordWrap,
        cursorBlinking: state.cursorBlinking,
        cursorSmoothCaretAnimation: state.cursorSmoothCaretAnimation,
        smoothScrolling: state.smoothScrolling,
        bracketPairColorization: state.bracketPairColorization,
        renderWhitespace: state.renderWhitespace,
        formatOnSave: state.formatOnSave,
        providers: state.providers.map(p => ({
          ...p,
        })),
        currentProviderId: state.currentProviderId,
        currentModel: state.currentModel,
        enableAutocomplete: state.enableAutocomplete,
        agentAutoApprove: state.agentAutoApprove,
        enableNaturalLanguageAgentTrigger: state.enableNaturalLanguageAgentTrigger,
        agentTriggerConfidenceThreshold: state.agentTriggerConfidenceThreshold,
        enableAutoRAG: state.enableAutoRAG,
        enableSmartRAG: state.enableSmartRAG,
        ragMode: state.ragMode,
        performanceMode: state.performanceMode,
        targetFPS: state.targetFPS,
        enableGPUAcceleration: state.enableGPUAcceleration,
        showPerformanceMonitor: state.showPerformanceMonitor,
        enableAutoDowngrade: state.enableAutoDowngrade,
      }),
    }
  )
);

// Force update zhipu provider to be enabled with glm-4.7 as default
// This runs after persist rehydration to ensure the config is correct
setTimeout(() => {
  const state = useSettingsStore.getState();

  // Check if zhipu provider needs to be updated
  const zhipuProvider = state.providers.find(p => p.id === 'zhipu');

  if (zhipuProvider && (!zhipuProvider.enabled || state.currentProviderId !== 'zhipu' || state.currentModel !== 'glm-4.7')) {
    console.log('[SettingsStore] Migrating zhipu provider config...');

    // Update provider to be enabled
    useSettingsStore.setState(state => ({
      providers: state.providers.map(p =>
        p.id === 'zhipu'
          ? { ...p, enabled: true, models: ['glm-4.7', 'glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4', 'glm-4v', 'glm-3-turbo'] }
          : p
      ),
      currentProviderId: 'zhipu',
      currentModel: 'glm-4.7'
    }));
  }
}, 0);
