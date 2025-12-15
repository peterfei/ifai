import { AIProviderConfig } from './settingsStore';

export interface ToolCall {
  id: string;
  tool: string;
  args: any;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
  result?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  references?: string[];
  toolCalls?: ToolCall[];
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  addMessage: (message: Message) => void;
  updateMessageContent: (id: string, content: string) => void;
  setLoading: (loading: boolean) => void;
  sendMessage: (content: string, providerId: string, modelName: string) => Promise<void>;
  toggleAutocomplete: () => void;
  approveToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  rejectToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  generateResponse: (history: any[], providerConfig: AIProviderConfig) => Promise<void>;
}
