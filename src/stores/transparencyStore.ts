import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

// === Type Definitions ===

export interface PromptSectionMeta {
  name: string;
  label: string;
  char_count: number;
  tokens_estimate: number;
  present?: boolean;
}

export interface SystemPromptMeta {
  event_id: string;
  sections: PromptSectionMeta[];
  skills: string[];
  mode: string;
  total_chars: number;
  total_tokens_estimate: number;
  message_count: number;
}

export interface TokenUsageDetail {
  system_prompt_tokens: number;
  user_messages_tokens: number;
  tool_definitions_tokens: number;
  rag_context_tokens: number;
  skills_tokens: number;
  total_input_tokens: number;
  output_tokens: number;
}

// === Store ===

interface TransparencyState {
  // 系统提示词元数据
  currentPromptMeta: SystemPromptMeta | null;
  // section 内容缓存 (按需加载)
  promptDetailCache: Record<string, string>;
  // Token 使用详情
  tokenUsageDetail: TokenUsageDetail | null;
  // 是否正在加载 section 详情
  loadingSection: string | null;

  // Actions
  setPromptMeta: (meta: SystemPromptMeta) => void;
  fetchPromptDetail: (sectionName: string) => Promise<string>;
  setTokenUsageDetail: (detail: TokenUsageDetail | null) => void;
  clearForNewRequest: (eventId: string) => void;
}

export const useTransparencyStore = create<TransparencyState>()((set, get) => ({
  currentPromptMeta: null,
  promptDetailCache: {},
  tokenUsageDetail: null,
  loadingSection: null,

  setPromptMeta: (meta: SystemPromptMeta) => {
    set({
      currentPromptMeta: meta,
      promptDetailCache: {}, // 新请求时清空详情缓存
      tokenUsageDetail: null,
    });
  },

  fetchPromptDetail: async (sectionName: string): Promise<string> => {
    const state = get();

    // 检查缓存
    if (state.promptDetailCache[sectionName]) {
      return state.promptDetailCache[sectionName];
    }

    set({ loadingSection: sectionName });

    try {
      const content = await invoke<string>('get_system_prompt_detail', {
        sectionName,
      });

      set((s) => ({
        promptDetailCache: { ...s.promptDetailCache, [sectionName]: content },
        loadingSection: null,
      }));

      return content;
    } catch (error) {
      console.error(`[TransparencyStore] Failed to fetch section "${sectionName}":`, error);
      set({ loadingSection: null });
      throw error;
    }
  },

  setTokenUsageDetail: (detail: TokenUsageDetail | null) => {
    set({ tokenUsageDetail: detail });
  },

  clearForNewRequest: (_eventId: string) => {
    set({
      currentPromptMeta: null,
      promptDetailCache: {},
      tokenUsageDetail: null,
      loadingSection: null,
    });
  },
}));
