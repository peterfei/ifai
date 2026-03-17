import { AIProviderConfig } from './settingsStore';

export interface ToolCall {
  id: string;
  tool: string;
  args: any;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed' | 'executing';
  result?: string;
  output?: string;  // 🏆 PIVO 3.0: 物理保真度 - 输出字段
  isPartial?: boolean;
  isLocalModel?: boolean;  // 标记是否为本地模型执行的工具调用
  batchId?: string;        // v0.3.6: 批处理 ID
}

// Frontend display message type
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
  content: string; // Keep string content for backward compatibility
  isStreaming?: boolean;
  multiModalContent?: ContentPart[]; // New field for multi-modal
  references?: string[];
  toolCalls?: ToolCall[];
  tool_call_id?: string;
  contentSegments?: any[]; // v0.3.6: 用于流式按需渲染
}

// Backend API message types (must match Rust `ai.rs`)
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
    content: any; // Can be string or ContentPart array
    tool_calls?: {
        id: string;
        type: 'function';
        function: { name: string; arguments: string; };
    }[];
    tool_call_id?: string;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  addMessage: (message: Message) => void;
  updateMessageContent: (id: string, content: string, toolCalls?: ToolCall[]) => void;
  setLoading: (loading: boolean) => void;
  sendMessage: (content: string | ContentPart[], providerId: string, modelName: string, options?: any) => Promise<void>;
  toggleAutocomplete: () => void;
  approveToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  rejectToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  generateResponse: (history: BackendMessage[], providerConfig: AIProviderConfig, options?: { enableTools?: boolean }) => Promise<void>; // Use BackendMessage

  // 🔥 回滚功能 (商业版功能)
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

  deleteMessage?: (messageId: string) => void;
}
