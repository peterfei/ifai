// Mock ChatState for community edition
export interface ToolCall {
  id: string;
  tool: string;
  args: any;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
  result?: string;
  isPartial?: boolean;
  isLocalModel?: boolean;
}

export interface ImageUrl {
  url: string;
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: ImageUrl;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  multiModalContent?: ContentPart[];
  references?: string[];
  toolCalls?: ToolCall[];
  tool_call_id?: string;
}

export interface BackendImageUrl {
  url: string;
}

export interface BackendContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: BackendImageUrl;
}

export interface BackendMessage {
  role: string;
  content: any;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
  tool_call_id?: string;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  protocol: any;
  base_url: string;
  api_key: string;
  models: string[];
  enabled: boolean;
}

// Community edition: rollback functions return not-available error
export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  addMessage: (message: Message) => void;
  updateMessageContent: (id: string, content: string, toolCalls?: ToolCall[]) => void;
  setLoading: (loading: boolean) => void;
  sendMessage: (content: string | ContentPart[], providerId: string, modelName: string) => Promise<void>;
  toggleAutocomplete: () => void;
  approveToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  rejectToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  generateResponse: (history: BackendMessage[], providerConfig: AIProviderConfig, options?: {
    enableTools?: boolean;
  }) => Promise<void>;

  // 🔥 社区版: rollback 函数返回不可用提示
  rollbackToolCall?: (messageId: string, toolCallId: string, force?: boolean) => Promise<{
    success: boolean;
    conflict?: boolean;
    error?: string;
  }>;

  rollbackMessageToolCalls?: (messageId: string, force?: boolean) => Promise<{
    success: boolean;
    count?: number;
    hasConflict?: boolean;
    error?: string;
  }>;
}
