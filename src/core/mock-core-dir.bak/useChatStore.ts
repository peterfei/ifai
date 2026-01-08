// Mock useChatStore for community edition
// Provides minimal chat functionality with rollback mock implementations

import { create } from 'zustand';
import { ChatState, Message, ToolCall, BackendMessage, AIProviderConfig, ContentPart } from './chatStore';

// Mock store with rollback functions that return "not available" errors
export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,

  addMessage: (message: Message) => {
    set(state => ({ messages: [...state.messages, message] }));
  },

  updateMessageContent: (id: string, content: string, toolCalls?: ToolCall[]) => {
    set(state => ({
      messages: state.messages.map(m =>
        m.id === id ? { ...m, content, toolCalls } : m
      )
    }));
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  sendMessage: async (content: string | ContentPart[], providerId: string, modelName: string) => {
    console.warn('[Mock] sendMessage called - not implemented in community edition');
    throw new Error('Chat is not available in community edition');
  },

  toggleAutocomplete: () => {
    console.warn('[Mock] toggleAutocomplete called - not implemented');
  },

  approveToolCall: async (messageId: string, toolCallId: string) => {
    console.warn('[Mock] approveToolCall called - not implemented');
    throw new Error('Tool approval is not available in community edition');
  },

  rejectToolCall: async (messageId: string, toolCallId: string) => {
    console.warn('[Mock] rejectToolCall called - not implemented');
    throw new Error('Tool rejection is not available in community edition');
  },

  generateResponse: async (history: BackendMessage[], providerConfig: AIProviderConfig, options?: { enableTools?: boolean }) => {
    console.warn('[Mock] generateResponse called - not implemented in community edition');
    throw new Error('AI response generation is not available in community edition');
  },

  // 🔥 社区版: rollback 函数返回友好提示
  rollbackToolCall: async (messageId: string, toolCallId: string, force?: boolean) => {
    console.warn('[Rollback] Rollback feature is only available in commercial edition');
    return {
      success: false,
      error: 'AI 代码回滚功能仅在企业版中可用'
    };
  },

  rollbackMessageToolCalls: async (messageId: string, force?: boolean) => {
    console.warn('[Rollback] Rollback feature is only available in commercial edition');
    return {
      success: false,
      error: 'AI 代码回滚功能仅在企业版中可用'
    };
  },
}));
