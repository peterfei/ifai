import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface ImageUrl {
    url: string;
}

export interface ContentPart {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: ImageUrl;
}

export interface ToolCall {
    id: string;
    type: 'function';
    tool: string; 
    args: any;    
    function: {
        name: string;
        arguments: string;
    };
    status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
    isPartial?: boolean;
    agentId?: string;
    result?: string;
}

export interface Message {
    id: string;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | ContentPart[];
    toolCalls?: ToolCall[];
    tool_call_id?: string;
    references?: string[];
    multiModalContent?: ContentPart[];
    agentId?: string;
    isAgentLive?: boolean;
    [key: string]: any;
}

export interface AIProviderConfig {
    id: string;
    apiKey: string;
    baseUrl: string;
    models: string[];
}

export interface ChatState {
    messages: Message[];
    isLoading: boolean;
    inputHistory: string[];
    historyIndex: number;
    addMessage: (msg: Message) => void;
    sendMessage: (content: string | ContentPart[], providerId: string, modelName: string) => Promise<void>;
    approveToolCall: (messageId: string, toolCallId: string) => Promise<void>;
    rejectToolCall: (messageId: string, toolCallId: string) => Promise<void>;
    updateMessage: (id: string, updates: Partial<Message>) => void;
    updateMessageContent: (id: string, content: string) => void;
    addToolCall: (messageId: string, toolCall: ToolCall) => void; // 补全缺失方法
    updateToolCall: (messageId: string, toolCallId: string, updates: Partial<ToolCall>) => void; // 补全缺失方法
}

// Backend Message type for invoke calls
export interface BackendMessage {
    role: string;
    content: any;
    tool_calls?: any[];
    tool_call_id?: string;
}

let getFileStore: any = () => ({ projectRoot: null });
let getSettingsStore: any = () => ({ providers: [] });

export const registerStores = (fs: any, ss: any) => {
    getFileStore = fs;
    getSettingsStore = ss;
};

export const useChatStore = create<ChatState>((set, get) => ({
    messages: [],
    isLoading: false,
    inputHistory: [],
    historyIndex: -1,

    addMessage: (msg) => set(state => ({ messages: [...state.messages, msg] })),

    updateMessage: (id, updates) => set(state => ({
        messages: state.messages.map(m => m.id === id ? { ...m, ...updates } : m)
    })),

    updateMessageContent: (id, content) => set(state => ({
        messages: state.messages.map(m => m.id === id ? { ...m, content } : m)
    })),

    addToolCall: (messageId, toolCall) => set(state => ({
        messages: state.messages.map(m => 
            m.id === messageId ? { ...m, toolCalls: [...(m.toolCalls || []), toolCall] } : m
        )
    })),

    updateToolCall: (messageId, toolCallId, updates) => set(state => ({
        messages: state.messages.map(m => 
            m.id === messageId ? {
                ...m,
                toolCalls: m.toolCalls?.map(tc => tc.id === toolCallId ? { ...tc, ...updates } : tc)
            } : m
        )
    })),

    sendMessage: async (content, providerId, modelName) => {
        const settings = getSettingsStore();
        const providerData = settings.providers.find((p: any) => p.id === providerId);
        
        const providerConfig = {
            ...providerData, // Spread all fields from settings store (includes enabled, name, id, etc.)
            provider: providerId, // Explicitly set provider/id based on argument if needed
            id: providerId,
            api_key: providerData?.apiKey || "", // Snake case aliases
            base_url: providerData?.baseUrl || "",
            // Ensure essential fields have defaults if missing in providerData
            apiKey: providerData?.apiKey || "",
            baseUrl: providerData?.baseUrl || "",
            models: [modelName],
            protocol: providerData?.protocol || "openai"
        };

        set({ isLoading: true });
        
        // Add user message
        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: content
        };
        get().addMessage(userMsg);
        
        // Add placeholder assistant message
        const assistantMsgId = crypto.randomUUID();
        get().addMessage({
            id: assistantMsgId,
            role: 'assistant',
            content: ''
        });

        const msgHistory = get().messages.slice(0, -1).map(m => ({
            role: m.role,
            content: m.content, 
            tool_calls: m.toolCalls,
            tool_call_id: m.tool_call_id
        }));

        try {
            await invoke('ai_chat', {
                providerConfig,
                messages: msgHistory,
                eventId: assistantMsgId,
                projectRoot: getFileStore().projectRoot
            });
        } catch (e) {
            get().updateMessage(assistantMsgId, { content: `Error: ${e}` });
        } finally {
            set({ isLoading: false });
        }
    },

    approveToolCall: async (messageId, toolCallId) => {
        console.log("Mock core: approveToolCall", messageId, toolCallId);
    },

    rejectToolCall: async (messageId, toolCallId) => {
        console.log("Mock core: rejectToolCall", messageId, toolCallId);
    }
}));

export const getToolLabel = (name: string) => name;
export const getToolColor = (name: string) => 'text-blue-500';

export interface MessageSegment {
    type: 'text' | 'tool';
    content?: string;
    toolCall?: ToolCall;
}

export const parseToolCalls = (content: any): { segments: MessageSegment[] } => {
    if (typeof content !== 'string') return { segments: [] };
    return {
        segments: [{ type: 'text', content }]
    };
};
