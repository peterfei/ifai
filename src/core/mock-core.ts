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
    function: {
        name: string;
        arguments: string;
    };
    status?: 'pending' | 'approved' | 'rejected';
    isPartial?: boolean;
}

// Backend Message type might be simpler
export interface BackendMessage {
    id?: string;
    role: string;
    content: string | ContentPart[];
    tool_calls?: any[];
    tool_call_id?: string;
}

export interface Message {
    id: string;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | ContentPart[];
    toolCalls?: ToolCall[];
    tool_call_id?: string;
    references?: string[];
    [key: string]: any;
}

export interface AIProviderConfig {
    provider: string;
    api_key: string;
    base_url: string;
    models: string[];
}

export interface ChatState {
    messages: Message[];
    inputHistory: string[];
    historyIndex: number;
    addMessage: (msg: Message) => void;
    sendMessage: (content: string | ContentPart[], providerId: string, modelName: string) => Promise<void>;
    approveToolCall: (messageId: string, toolCallId: string) => Promise<void>;
    rejectToolCall: (messageId: string, toolCallId: string) => Promise<void>;
    updateMessage: (id: string, updates: Partial<Message>) => void;
}

let getFileStore: any = () => ({ projectRoot: null });
let getSettingsStore: any = () => ({ providers: {} });

export const registerStores = (fs: any, ss: any) => {
    getFileStore = fs;
    getSettingsStore = ss;
};

export const useChatStore = create<ChatState>((set, get) => ({
    messages: [],
    inputHistory: [],
    historyIndex: -1,

    addMessage: (msg) => set(state => ({ messages: [...state.messages, msg] })),

    updateMessage: (id, updates) => set(state => ({
        messages: state.messages.map(m => m.id === id ? { ...m, ...updates } : m)
    })),

    sendMessage: async (content, providerId, modelName) => {
        const settings = getSettingsStore();
        
        const providerConfig = {
            provider: providerId,
            api_key: settings.providers?.[providerId]?.apiKey || "",
            base_url: settings.providers?.[providerId]?.baseUrl || "",
            models: [modelName]
        };

        const { messages, addMessage } = get();
        
        // Add user message
        const userMsgId = crypto.randomUUID();
        const userMsg: Message = {
            id: userMsgId,
            role: 'user',
            content: content
        };
        addMessage(userMsg);
        
        // Add placeholder assistant message
        const assistantMsgId = crypto.randomUUID();
        addMessage({
            id: assistantMsgId,
            role: 'assistant',
            content: ''
        });

        const msgHistory = get().messages.map(m => {
            // Convert to backend format if necessary
            return {
                role: m.role,
                content: m.content, 
                tool_calls: m.toolCalls,
                tool_call_id: m.tool_call_id
            };
        });
        
        // Remove the last empty assistant message from history sent to backend?
        // Usually yes, backend generates it.
        msgHistory.pop();

        const eventId = assistantMsgId; // Use assistant msg id as event id for streaming

        try {
            await invoke('ai_chat', {
                providerConfig,
                messages: msgHistory,
                eventId,
                projectRoot: getFileStore().projectRoot
            });
        } catch (e) {
            console.error("AI Chat Error:", e);
            get().updateMessage(assistantMsgId, { content: `Error: ${e}` });
        }
    },

    approveToolCall: async (messageId, toolCallId) => {
        console.log("Mock core: approveToolCall", messageId, toolCallId);
        // In real implementation, this would trigger tool execution and next turn
    },

    rejectToolCall: async (messageId, toolCallId) => {
        console.log("Mock core: rejectToolCall", messageId, toolCallId);
    }
}));

export const getToolLabel = (name: string) => {
    switch (name) {
        case 'agent_write_file': return 'Write File';
        case 'agent_read_file': return 'Read File';
        case 'agent_list_dir': return 'List Directory';
        case 'search_semantic': return 'Search Code';
        default: return name;
    }
};

export const getToolColor = (name: string) => {
    switch (name) {
        case 'agent_write_file': return 'text-red-500';
        case 'agent_read_file': return 'text-green-500';
        case 'agent_list_dir': return 'text-yellow-500';
        case 'search_semantic': return 'text-blue-500';
        default: return 'text-gray-500';
    }
};

export const parseToolCalls = (content: any) => {
    if (typeof content !== 'string') {
        return { segments: [] };
    }
    return {
        segments: [{ type: 'text', content }]
    };
};
