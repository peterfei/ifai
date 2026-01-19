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

    // 🔥 回滚功能 (商业版功能) - 社区版返回不可用提示
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

// Backend Message type for invoke calls
export interface BackendMessage {
    role: string;
    content: any;
    tool_calls?: any[];
    tool_call_id?: string;
}

let getFileStore: any = () => ({ projectRoot: null });
let getSettingsStore: any = () => ({ providers: [] });
let getThreadStore: any = () => ({ threads: {} });

export const registerStores = (fs: any, ss: any, ts?: any) => {
    getFileStore = fs;
    getSettingsStore = ss;
    if (ts) getThreadStore = ts;
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
        console.log("[Mock Core] approveToolCall called:", messageId, toolCallId);

        // 查找对应的 tool call
        const message = get().messages.find(m => m.id === messageId);
        const toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);
        if (!toolCall) {
            console.error("[Mock Core] Tool call not found:", toolCallId);
            return;
        }

        // Helper function to get args (supporting both snake_case and camelCase)
        const getArg = (args: any, key: string, defaultValue: any) => {
            if (!args) return defaultValue;
            if (args[key] !== undefined && args[key] !== null) return args[key];
            const camelKey = key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
            if (args[camelKey] !== undefined && args[camelKey] !== null) return args[camelKey];
            return defaultValue;
        };

        let result = "";
        let status: ToolCall['status'] = 'completed';

        try {
            if (toolCall.tool === 'bash' || toolCall.tool === 'execute_bash_command' || toolCall.tool === 'bash_execute_streaming') {
                const command = getArg(toolCall.args, 'command', '');

                console.log("[Mock Core] Executing bash command:", command);

                // 🔥 E2E 环境特殊处理：使用 __E2E_INVOKE_HANDLER__
                const e2eHandler = (typeof window !== 'undefined') ? (window as any).__E2E_INVOKE_HANDLER__ : null;
                let bashResult: any;
                if (e2eHandler) {
                    console.log("[Mock Core] Using E2E invoke handler for command execution");
                    bashResult = await e2eHandler('execute_bash_command', { command });
                    console.log("[Mock Core] E2E bash result:", bashResult);
                } else {
                    // 非 E2E 环境：使用 Tauri invoke
                    console.log("[Mock Core] Using Tauri invoke for command execution");
                    bashResult = await invoke('execute_bash_command', { command });
                    console.log("[Mock Core] Tauri bash result:", bashResult);
                }

                        // 🔥 模拟真实的 Rust BashResult 结构（与生产环境一致）
                // Rust 返回: {exit_code, stdout, stderr, success, elapsed_ms}
                const parsedResult = typeof bashResult === 'string' ? JSON.parse(bashResult) : bashResult;
                const stdout = parsedResult.stdout || '';
                const stderr = parsedResult.stderr || '';
                const exitCode = parsedResult.exitCode !== undefined ? parsedResult.exitCode : parsedResult.exit_code || 0;
                const success = exitCode === 0;
                const elapsed_ms = parsedResult.elapsed_ms || 0;

                // 构建格式化的输出字符串（用于 tool message content）
                let formattedOutput = '';
                if (success) {
                    formattedOutput += `✅ Command executed successfully (exit code: ${exitCode})\n\n`;
                } else {
                    formattedOutput += `❌ Command failed (exit code: ${exitCode})\n\n`;
                }
                if (stdout) {
                    formattedOutput += `Stdout:\n${stdout}\n`;
                }
                if (stderr) {
                    formattedOutput += `Stderr:\n${stderr}\n`;
                }

                result = formattedOutput;
            } else if (toolCall.tool === 'agent_read_file') {
                // 🔥 实现 agent_read_file 工具（用于 E2E 测试）
                const relPath = getArg(toolCall.args, 'rel_path', '');
                console.log("[Mock Core] Reading file:", relPath);

                const e2eHandler = (typeof window !== 'undefined') ? (window as any).__E2E_INVOKE_HANDLER__ : null;
                let fileResult: any;

                if (e2eHandler) {
                    try {
                        fileResult = await e2eHandler('agent_read_file', { rel_path: relPath });
                        console.log("[Mock Core] E2E file read result:", fileResult);
                    } catch (e) {
                        result = `Error reading file: ${e}`;
                        status = 'failed';
                    }
                } else {
                    result = `Error: agent_read_file only available in E2E test environment`;
                    status = 'failed';
                }

                if (typeof fileResult === 'string') {
                    result = fileResult;
                } else if (fileResult && typeof fileResult === 'object') {
                    result = JSON.stringify(fileResult);
                }
            } else {
                // 其他工具：尝试使用 invoke
                console.log("[Mock Core] Handling non-bash tool:", toolCall.tool);
                // 对于其他工具，返回一个默认结果
                result = JSON.stringify({ success: true, message: `Tool ${toolCall.tool} executed (mock)` });
            }
        } catch (e) {
            console.error("[Mock Core] Tool execution error:", e);
            status = 'failed';
            result = String(e);
        }

        // 更新 tool call 的状态和结果
        get().updateToolCall(messageId, toolCallId, { status, result });
        console.log("[Mock Core] Tool call updated:", { toolCallId, status, result: result.substring(0, 100) });

        // 🔥 创建 tool 消息（与 ifainew-core 的行为一致）
        const toolMessage: Message = {
            id: crypto.randomUUID(),
            role: 'tool',
            content: result,
            tool_call_id: toolCallId
        };
        get().addMessage(toolMessage);
        console.log("[Mock Core] Tool message added:", toolMessage.id);

        // 🔥 检查是否所有工具都已完成
        const updatedMessage = get().messages.find(m => m.id === messageId);
        const allCompleted = updatedMessage?.toolCalls?.every(tc =>
            tc.status === 'completed' || tc.status === 'failed' || tc.status === 'rejected'
        );

        if (allCompleted) {
            console.log("[Mock Core] All tools completed for message:", messageId);
            // 在真实环境中，这里会继续调用 generateResponse
            // 但在 mock 环境中，我们不需要这样做
        }
    },

    rejectToolCall: async (messageId, toolCallId) => {
        console.log("Mock core: rejectToolCall", messageId, toolCallId);
    },

    // 🔥 社区版: rollback 函数返回不可用提示
    rollbackToolCall: async (messageId: string, toolCallId: string, force?: boolean) => {
        console.warn('[Mock Core] Rollback feature is only available in commercial edition');
        return {
            success: false,
            error: 'AI 代码回滚功能仅在企业版中可用'
        };
    },

    rollbackMessageToolCalls: async (messageId: string, force?: boolean) => {
        console.warn('[Mock Core] Rollback feature is only available in commercial edition');
        return {
            success: false,
            error: 'AI 代码回滚功能仅在企业版中可用'
        };
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
