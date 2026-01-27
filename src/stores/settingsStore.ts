import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AIProtocol = 'openai' | 'anthropic' | 'gemini';

// 预设模板类型（用于自定义提供商）
export type PresetTemplate = 'ollama' | 'vllm' | 'localai' | 'lmstudio' | 'custom';

// 模型参数配置
export interface ModelParamsConfig {
  temperature: number;
  top_p: number;
  max_tokens: number;
}

// 预设参数模板
export const MODEL_PARAM_PRESETS: Record<string, ModelParamsConfig> = {
  fast: { temperature: 0.3, top_p: 0.9, max_tokens: 2048 },
  balanced: { temperature: 0.7, top_p: 0.9, max_tokens: 4096 },
  precise: { temperature: 0.1, top_p: 0.95, max_tokens: 8192 },
};

// 预设端点模板
export const PRESET_ENDPOINTS: Record<PresetTemplate, { baseUrl: string; defaultModels: string[] }> = {
  ollama: { baseUrl: 'http://localhost:11434/v1/chat/completions', defaultModels: ['qwen2.5-coder:latest', 'deepseek-coder:latest', 'llama3.2:latest', 'codellama:latest'] },
  vllm: { baseUrl: 'http://localhost:8000/v1/chat/completions', defaultModels: ['meta-llama/Llama-3.1-8B-Instruct'] },
  localai: { baseUrl: 'http://localhost:8080/v1/chat/completions', defaultModels: ['gpt-3.5-turbo'] },
  lmstudio: { baseUrl: 'http://localhost:1234/v1/chat/completions', defaultModels: ['local-model'] },
  // 🔥 自定义模板添加常见云服务商的示例模型（NVIDIA 默认使用 z-ai/glm4.7）
  custom: { baseUrl: '', defaultModels: ['z-ai/glm4.7', 'nv-tmp', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022'] },
};

export interface AIProviderConfig {
  id: string;
  name: string;
  protocol: AIProtocol;
  baseUrl: string;
  apiKey: string;
  models: string[];
  enabled: boolean;

  // v0.2.6 新增：自定义提供商支持
  isCustom?: boolean;                    // 是否为自定义提供商
  presetTemplate?: PresetTemplate;       // 预设模板
  customEndpoint?: string;               // 自定义端点地址（用于覆盖 baseUrl）
  modelParams?: ModelParamsConfig;       // 模型参数配置
  displayName?: string;                  // 显示名称（用于覆盖默认名称）
  group?: 'cloud' | 'local' | 'custom';  // 提供商分组
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

  // 🔥 v0.3.4: Agent 审批模式
  agentApprovalMode: 'always' | 'session-once' | 'session-never' | 'per-tool';
  trustedSessions: Record<string, { approvedAt: number; expiresAt: number }>;

  // Agent (保留兼容性)
  agentAutoApprove: boolean;
  enableNaturalLanguageAgentTrigger: boolean;
  agentTriggerConfidenceThreshold: number;

  // Tool Classification (v0.3.3)
  toolClassificationEnabled: boolean;
  toolClassificationConfidenceThreshold: number;
  toolClassificationFallbackStrategy: 'always' | 'on-low-confidence' | 'never';
  showToolClassificationIndicator: boolean;

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

  // v0.2.6 新增：自定义提供商管理
  addCustomProvider: (config: {
    name: string;
    presetTemplate: PresetTemplate;
    customEndpoint?: string;
    apiKey?: string;
    modelParams?: ModelParamsConfig;
  }) => string;  // 返回新提供商 ID
  updateModelParams: (providerId: string, modelParams: ModelParamsConfig) => void;
  getProvidersByGroup: (group: 'cloud' | 'local' | 'custom') => AIProviderConfig[];
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
          name: 'Zhipu AI',
          protocol: 'openai',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
          apiKey: '',
          models: ['glm-4.7', 'glm-4.7-flash', 'glm-4.6', 'glm-4.5v', 'glm-4.5-air', 'glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4', 'glm-4v', 'glm-3-turbo'],
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

      // 🔥 v0.3.4: Agent 审批模式默认值
      agentApprovalMode: 'session-once',  // 默认：会话首次批准
      trustedSessions: {},

      agentAutoApprove: false,
      enableNaturalLanguageAgentTrigger: true,
      agentTriggerConfidenceThreshold: 0.6,  // 降低阈值以提高触发敏感度

      // Tool Classification settings (v0.3.3)
      toolClassificationEnabled: true,
      toolClassificationConfidenceThreshold: 0.7,
      toolClassificationFallbackStrategy: 'on-low-confidence',
      showToolClassificationIndicator: true,

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

      // v0.2.6 新增：添加自定义提供商
      addCustomProvider: (config) => {
        const { name, presetTemplate, customEndpoint, apiKey, modelParams } = config;
        const preset = PRESET_ENDPOINTS[presetTemplate];

        // 生成唯一 ID
        const id = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const newProvider: AIProviderConfig = {
          id,
          name,
          displayName: name,  // 用户提供作为显示名称
          protocol: 'openai',  // 自定义提供商默认使用 OpenAI 兼容协议
          baseUrl: customEndpoint || preset.baseUrl,
          apiKey: apiKey || '',
          models: preset.defaultModels,
          enabled: true,
          isCustom: true,
          presetTemplate,
          customEndpoint,
          modelParams: modelParams || MODEL_PARAM_PRESETS.balanced,
          group: 'custom',
        };

        set((state) => {
          if (state.providers.some(p => p.id === id)) {
            console.warn(`Provider with ID ${id} already exists.`);
            return state;
          }
          return {
            providers: [...state.providers, newProvider],
            // 自动切换到新添加的提供商
            currentProviderId: id,
            currentModel: newProvider.models[0] || '',
          };
        });

        return id;
      },

      // v0.2.6 新增：更新模型参数
      updateModelParams: (providerId, modelParams) => set((state) => ({
        providers: state.providers.map(p =>
          p.id === providerId ? { ...p, modelParams } : p
        ),
      })),

      // v0.2.6 新增：按分组获取提供商
      getProvidersByGroup: (group) => {
        const state = get();
        return state.providers.filter(p => p.group === group || (!p.group && group === 'cloud'));
      },
    }),
    {
      name: 'settings-storage',
      version: 4, // 🔥 v0.3.4: 增加版本号确保迁移执行
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
        // 🔥 v0.3.4: 持久化审批模式设置
        agentApprovalMode: state.agentApprovalMode,
        trustedSessions: state.trustedSessions,
      }),
      migrate: (persistedState: any, version: number) => {
        console.log(`[SettingsStore] Migrating from version ${version} to 4`);

        // 🔥 v0.3.4: 版本 3 -> 4：确保新字段存在（安全迁移）
        if (!persistedState.agentApprovalMode) {
          persistedState.agentApprovalMode = 'session-once';
          console.log('[SettingsStore] Set default agentApprovalMode=session-once (v3->4)');
        }
        if (!persistedState.trustedSessions) {
          persistedState.trustedSessions = {};
          console.log('[SettingsStore] Set default trustedSessions={} (v3->4)');
        }

        // 版本 2 -> 3：迁移 agentAutoApprove 到 agentApprovalMode
        if (version < 3) {
          if (persistedState.agentAutoApprove && !persistedState.agentApprovalMode) {
            persistedState.agentApprovalMode = 'always';
            console.log('[SettingsStore] Migrated agentAutoApprove=true to agentApprovalMode=always');
          } else if (!persistedState.agentApprovalMode) {
            persistedState.agentApprovalMode = 'session-once';
            persistedState.trustedSessions = {};
            console.log('[SettingsStore] Set default agentApprovalMode=session-once');
          }
        }

        // 版本 1 -> 2：添加 glm-4.5v 和 glm-4.5-air 到智谱AI模型列表
        if (version < 2 && persistedState.providers) {
          const zhipuProvider = persistedState.providers.find((p: any) => p.id === 'zhipu');
          if (zhipuProvider && zhipuProvider.models) {
            const newModels = ['glm-4.7', 'glm-4.7-flash', 'glm-4.6', 'glm-4.5v', 'glm-4.5-air', 'glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4', 'glm-4v', 'glm-3-turbo'];
            // 合并新旧模型，去重
            zhipuProvider.models = Array.from(new Set([...newModels, ...zhipuProvider.models]));
            console.log('[SettingsStore] Updated zhipu models:', zhipuProvider.models);
          }
        }

        return persistedState;
      },
      // 🔥 v0.3.4: 确保 rehydrate 后新字段有默认值
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 确保 agentApprovalMode 有值
          if (!state.agentApprovalMode) {
            state.agentApprovalMode = 'session-once';
            console.log('[SettingsStore] Fixed missing agentApprovalMode on rehydrate');
          }
          // 确保 trustedSessions 有值
          if (!state.trustedSessions) {
            state.trustedSessions = {};
            console.log('[SettingsStore] Fixed missing trustedSessions on rehydrate');
          }
        }
      },
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
            ? { ...p, enabled: true, models: ['glm-4.7', 'glm-4.7-flash', 'glm-4.6', 'glm-4.5v', 'glm-4.5-air', 'glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4', 'glm-4v', 'glm-3-turbo'] }
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

// @ts-ignore
if (typeof window !== 'undefined') {
  (window as any).__settingsStore = useSettingsStore;
}
