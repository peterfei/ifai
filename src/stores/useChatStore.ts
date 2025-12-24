// Wrapper for core library useChatStore
// Handles dependency injection of file and settings stores

import { useChatStore as coreUseChatStore, registerStores, type Message } from 'ifainew-core';
import { useFileStore } from './fileStore';
import { useSettingsStore } from './settingsStore';
import { useAgentStore } from './agentStore';
import { invoke } from '@tauri-apps/api/core';

// Register stores on first import
// Pass getState functions so core library can access current state
registerStores(useFileStore.getState, useSettingsStore.getState);

// --- Monkey-patching Core Store ---
// Fixes for API errors and UI updates that reside in the core library

// =============================================================================
// Frontend Wrapper - Message Sanitization Removed
// =============================================================================
// Message sanitization is now handled authoritatively in the Rust backend
// (src-tauri/src/lib.rs in ai_chat function) to ensure consistency and avoid
// duplicate logic. The backend sanitizes messages immediately before sending
// to the AI API, which is the optimal place for this validation.
// =============================================================================

const originalSendMessage = coreUseChatStore.getState().sendMessage;
const originalApproveToolCall = coreUseChatStore.getState().approveToolCall;
const originalRejectToolCall = coreUseChatStore.getState().rejectToolCall;

const patchedSendMessage = async (content: string | any[], providerId: string, modelName: string) => {
    console.log(">>> patchedSendMessage called with:", content);
    // Slash Command Interception
    let textInput = "";
    if (typeof content === 'string') {
        textInput = content.trim();
    } else if (Array.isArray(content)) {
        textInput = content.map(p => p.type === 'text' ? p.text : '').join(' ').trim();
    }

    if (textInput.startsWith('/')) {
        const parts = textInput.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');
        const supportedAgents = ['/explore', '/review', '/test', '/doc', '/refactor'];

        if (supportedAgents.includes(command)) {
            const agentTypeBase = command.slice(1);
            const agentName = agentTypeBase.charAt(0).toUpperCase() + agentTypeBase.slice(1) + " Agent";
            
            const { addMessage } = coreUseChatStore.getState();
            const userMsgId = crypto.randomUUID();
            
            addMessage({ 
                id: userMsgId, 
                role: 'user', 
                content: textInput,
                multiModalContent: typeof content === 'string' ? [{type: 'text', text: content}] : content
            });

            try {
                const assistantMsgId = crypto.randomUUID();
                addMessage({
                    id: assistantMsgId,
                    role: 'assistant',
                    content: ``,
                    // @ts-ignore - custom property
                    agentId: undefined,
                    isAgentLive: true
                });

                const agentId = await useAgentStore.getState().launchAgent(
                    agentName,
                    args || "No specific task provided",
                    assistantMsgId
                );

                const messages = coreUseChatStore.getState().messages;
                const msg = messages.find(m => m.id === assistantMsgId);
                if (msg) {
                    // @ts-ignore
                    msg.agentId = agentId;
                    coreUseChatStore.setState({ messages: [...messages] });
                }
            } catch (e) {
                addMessage({
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `❌ **Failed to launch agent**\n\nError: ${String(e)}`
                });
            }
            return;
        }
    }

    // --- Direct Backend Invocation Logic ---
    
    // 1. Prepare Provider Config
    const settings = useSettingsStore.getState();
    const providerData = settings.providers.find((p: any) => p.id === providerId);
    
    const providerConfig = {
        ...providerData,
        provider: providerId, 
        id: providerId,
        api_key: providerData?.apiKey || "",
        base_url: providerData?.baseUrl || "",
        apiKey: providerData?.apiKey || "",
        baseUrl: providerData?.baseUrl || "",
        models: [modelName],
        protocol: providerData?.protocol || "openai"
    };

    coreUseChatStore.setState({ isLoading: true });
    
    // 2. Add User Message
    const userMsg = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: content
    };
    // @ts-ignore
    coreUseChatStore.getState().addMessage(userMsg);
    
    // 3. Add Assistant Placeholder
    const assistantMsgId = crypto.randomUUID();
    const assistantMsgPlaceholder = {
        id: assistantMsgId,
        role: 'assistant' as const,
        content: ''
    };
    // @ts-ignore
    coreUseChatStore.getState().addMessage(assistantMsgPlaceholder);

    // 4. Prepare History
    const messages = coreUseChatStore.getState().messages;
    const msgHistory = messages.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content, 
        tool_calls: m.toolCalls ? m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
                name: tc.tool || (tc as any).function?.name,
                arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args)
            }
        })) : undefined,
        tool_call_id: m.tool_call_id
    }));

    // 5. Setup Listeners
    const { listen } = await import('@tauri-apps/api/event');
    
    // Status Listener
    const unlistenStatus = await listen<string>(`${assistantMsgId}_status`, (event) => {
        const { messages } = coreUseChatStore.getState();
        const lastAssistantMsg = messages.find(m => m.id === assistantMsgId);
        if (lastAssistantMsg) {
            console.log(`[Chat] Status update: ${event.payload}`);
            if (!lastAssistantMsg.content) {
                const updatedMessages = messages.map(m => 
                    m.id === assistantMsgId ? { ...m, content: `_(${event.payload})_ \n\n` } : m
                );
                coreUseChatStore.setState({ messages: updatedMessages });
            }
        }
    });

    // Stream Content Listener - 接收流式消息内容
    const unlistenStream = await listen<string>(assistantMsgId, (event) => {
        const { messages } = coreUseChatStore.getState();
        let textChunk = '';

        try {
            // Parse JSON format: {"type":"content","content":"文本"}
            const payload = JSON.parse(event.payload);
            if (payload.type === 'content' && payload.content) {
                textChunk = payload.content;
            }
        } catch (e) {
            // Fallback: treat as plain text
            textChunk = event.payload;
        }

        if (textChunk) {
            const updatedMessages = messages.map(m =>
                m.id === assistantMsgId ? { ...m, content: (m.content || '') + textChunk } : m
            );

            coreUseChatStore.setState({ messages: updatedMessages });
        }
    });

    // References Listener (RAG)
    const unlistenRefs = await listen<string[]>("codebase-references", (event) => {
        coreUseChatStore.setState(state => ({
            messages: state.messages.map(m => 
                m.id === userMsg.id ? { ...m, references: event.payload } : m
            )
        }));
    });
    
    // History Compaction Listener (Auto-summarization Fix)
    const unlistenCompacted = await listen<any[]>(`${assistantMsgId}_compacted`, (event) => {
        console.log("[Chat] History compacted event received", event.payload);
        const compactedMessages = event.payload.map(m => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.content,
            toolCalls: m.tool_calls, // Note: snake_case from Rust
            tool_call_id: m.tool_call_id
        }));
        
        // Replace history but keep the currently streaming assistant message
        coreUseChatStore.setState({ messages: [...compactedMessages, assistantMsgPlaceholder] });
    });

    // 6. Invoke Backend
    try {
        await invoke('ai_chat', {
            providerConfig,
            messages: msgHistory,
            eventId: assistantMsgId,
            projectRoot: useFileStore.getState().rootPath,
            enableTools: true
        });
    } catch (e) {
        const { messages } = coreUseChatStore.getState();
        coreUseChatStore.setState({
            messages: messages.map(m => m.id === assistantMsgId ? { ...m, content: `Error: ${e}` } : m)
        });
    } finally {
        coreUseChatStore.setState({ isLoading: false });
        unlistenStatus();
        unlistenStream();
        unlistenRefs();
        unlistenCompacted();
    }
};

const patchedApproveToolCall = async (messageId: string, toolCallId: string) => {
    console.log(`[useChatStore] patchedApproveToolCall called - messageId: ${messageId}, toolCallId: ${toolCallId}`);

    // Check if this is an Agent tool call
    const message = coreUseChatStore.getState().messages.find(m => m.id === messageId);
    const toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);

    console.log(`[useChatStore] Found message: ${!!message}, Found toolCall: ${!!toolCall}`);
    if (toolCall) {
        const toolName = (toolCall as any).tool || (toolCall as any).function?.name;
        console.log(`[useChatStore] ToolCall agentId: ${(toolCall as any).agentId}, tool: ${toolName}`);
    }

    if (toolCall && (toolCall as any).agentId) {
        // Agent tool call: use Agent approval flow
        const agentId = (toolCall as any).agentId;
        console.log(`[useChatStore] Using Agent approval flow for agent ${agentId}, tool: ${toolCall.tool || (toolCall as any).function?.name}`);

        // Update tool call status to approved
        coreUseChatStore.setState(state => ({
            messages: state.messages.map(m =>
                m.id === messageId ? {
                    ...m,
                    toolCalls: m.toolCalls?.map(tc =>
                        tc.id === toolCallId ? { ...tc, status: 'approved' as const } : tc
                    )
                } : m
            )
        }));

        console.log(`[useChatStore] Calling approveAction for agent ${agentId}`);
        await useAgentStore.getState().approveAction(agentId, true);
        console.log(`[useChatStore] approveAction completed for agent ${agentId}`);
    } else {
        // Regular tool call: use original flow
        console.log(`[useChatStore] Using original approval flow`);
        await originalApproveToolCall(messageId, toolCallId);
    }

    // Refresh file tree after tool execution
    useFileStore.getState().refreshFileTree();
};

const patchedRejectToolCall = async (messageId: string, toolCallId: string) => {
    // Check if this is an Agent tool call
    const message = coreUseChatStore.getState().messages.find(m => m.id === messageId);
    const toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);

    if (toolCall && (toolCall as any).agentId) {
        // Agent tool call: use Agent rejection flow
        const agentId = (toolCall as any).agentId;

        // Update tool call status to rejected
        coreUseChatStore.setState(state => ({
            messages: state.messages.map(m =>
                m.id === messageId ? {
                    ...m,
                    toolCalls: m.toolCalls?.map(tc =>
                        tc.id === toolCallId ? { ...tc, status: 'rejected' as const } : tc
                    )
                } : m
            )
        }));

        await useAgentStore.getState().approveAction(agentId, false);
    } else {
        // Regular tool call: use original flow
        await originalRejectToolCall(messageId, toolCallId);
    }

    // Refresh file tree after tool execution
    useFileStore.getState().refreshFileTree();
};

const approveAllToolCalls = async (messageId: string) => {
    const state = coreUseChatStore.getState();
    const message = state.messages.find(m => m.id === messageId);
    if (!message || !message.toolCalls) return;

    for (const toolCall of message.toolCalls) {
        if (toolCall.status === 'pending' && !toolCall.isPartial) {
            await coreUseChatStore.getState().approveToolCall(messageId, toolCall.id);
        }
    }
};

const rejectAllToolCalls = async (messageId: string) => {
    const state = coreUseChatStore.getState();
    const message = state.messages.find(m => m.id === messageId);
    if (!message || !message.toolCalls) return;

    for (const toolCall of message.toolCalls) {
        if (toolCall.status === 'pending' && !toolCall.isPartial) {
            await coreUseChatStore.getState().rejectToolCall(messageId, toolCall.id);
        }
    }
};

// Apply patches to the store
coreUseChatStore.setState({
    sendMessage: patchedSendMessage,
    approveToolCall: patchedApproveToolCall,
    rejectToolCall: patchedRejectToolCall,
    // @ts-ignore - adding new methods to store
    approveAllToolCalls,
    // @ts-ignore - adding new methods to store
    rejectAllToolCalls,
    // @ts-ignore - adding history state
    inputHistory: [],
    // @ts-ignore
    historyIndex: -1
});

// ----------------------------------

// Re-export the core chatStore
export const useChatStore = coreUseChatStore;

// Re-export types
export type { ChatState, ToolCall, Message, ContentPart, ImageUrl, BackendMessage, AIProviderConfig } from 'ifainew-core';