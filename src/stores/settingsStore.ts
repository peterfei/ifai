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
  useLocalModelForCompletion: boolean;  // 优先使用本地模型进行代码补全
  maxContextMessages: number;           // 最大上下文消息数
  enableSmartContextSelection: boolean;  // 是否启用智能上下文选择
  maxContextTokens?: number;            // 可选的token限制（未来扩展）

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
          models: ['glm-4.6', 'glm-4.7', 'glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4', 'glm-4v', 'glm-3-turbo'],
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
      currentModel: 'glm-4.6',
      enableAutocomplete: true,
      useLocalModelForCompletion: true,  // 默认启用本地模型补全
      maxContextMessages: 15,
      enableSmartContextSelection: true,
      maxContextTokens: undefined,
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
      
      updateProviderConfig: (providerId, updates) => set((state) => {
        const updatedProviders = state.providers.map(p =>
          p.id === providerId ? { ...p, ...updates } : p
        );

        // 自动切换到有API密钥的已启用供应商
        // 当用户填写API密钥时，自动切换到该供应商
        if (updates.apiKey && updates.apiKey.trim() !== '') {
          const targetProvider = updatedProviders.find(p => p.id === providerId);
          if (targetProvider && targetProvider.enabled) {
            const firstModel = targetProvider.models[0];
            if (firstModel) {
              return {
                providers: updatedProviders,
                currentProviderId: providerId,
                currentModel: firstModel
              };
            }
          }
        }

        return { providers: updatedProviders };
      }),

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
        useLocalModelForCompletion: state.useLocalModelForCompletion,
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
        maxContextMessages: state.maxContextMessages,
        enableSmartContextSelection: state.enableSmartContextSelection,
        maxContextTokens: state.maxContextTokens,
      }),
    }
  )
);

// Initialize default provider on first load
// Only set defaults if no provider has an API key configured
setTimeout(() => {
  const state = useSettingsStore.getState();

  // 检查是否已有供应商配置了API密钥
  const hasApiKey = state.providers.some(p => p.apiKey && p.apiKey.trim() !== '');

  // 只在没有API密钥的情况下，设置默认的zhipu供应商
  if (!hasApiKey) {
    const zhipuProvider = state.providers.find(p => p.id === 'zhipu');

    if (zhipuProvider) {
      console.log('[SettingsStore] Initializing default provider to zhipu (no API keys found)');

      // 确保zhipu已启用并设置为默认
      useSettingsStore.setState(state => ({
        providers: state.providers.map(p =>
          p.id === 'zhipu'
            ? { ...p, enabled: true, models: ['glm-4.6', 'glm-4.7', 'glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4', 'glm-4v', 'glm-3-turbo'] }
            : p
        ),
        currentProviderId: 'zhipu',
        currentModel: 'glm-4.6'
      }));
    }
  } else {
    // 如果已有API密钥，确保当前选中的供应商是有效的
    const currentProvider = state.providers.find(p => p.id === state.currentProviderId);
    if (!currentProvider || !currentProvider.apiKey || currentProvider.apiKey.trim() === '') {
      // 当前供应商没有API密钥，切换到第一个有API密钥的供应商
      const firstProviderWithKey = state.providers.find(p => p.apiKey && p.apiKey.trim() !== '');
      if (firstProviderWithKey) {
        console.log('[SettingsStore] Switching to first provider with API key:', firstProviderWithKey.id);
        useSettingsStore.setState({
          currentProviderId: firstProviderWithKey.id,
          currentModel: firstProviderWithKey.models[0] || ''
        });
      }
    }
  }
}, 0);
