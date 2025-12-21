// Wrapper for core library useChatStore
// Handles dependency injection of file and settings stores

import { useChatStore as coreUseChatStore, registerStores, type Message } from 'ifainew-core';
import { useFileStore } from './fileStore';
import { useSettingsStore } from './settingsStore';
import { useAgentStore } from './agentStore';

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

    // Set up a one-time listener for references before sending
    const { listen } = await import('@tauri-apps/api/event');
    
    // Listen for Status Updates (e.g. "Indexing...")
    const eventId = crypto.randomUUID(); // We need to pass this or use a consistent one
    const unlistenStatus = await listen<string>(`${eventId}_status`, (event) => {
        const { messages } = coreUseChatStore.getState();
        // Find the current assistant message (the last one)
        const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
        if (lastAssistantMsg) {
            // Prepend status message or handle as needed
            // For now, let's just log it or we could append to content
            console.log(`[Chat] Status update: ${event.payload}`);
            // If the content is empty, show the status as a placeholder
            if (!lastAssistantMsg.content) {
                const updatedMessages = messages.map(m => 
                    m.id === lastAssistantMsg.id ? { ...m, content: `_(${event.payload})_ \n\n` } : m
                );
                coreUseChatStore.setState({ messages: updatedMessages });
            }
        }
    });

    const unlistenRefs = await listen<string[]>("codebase-references", (event) => {
        // Find the last user message and attach references
        const messages = coreUseChatStore.getState().messages;
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
            coreUseChatStore.setState(state => ({
                messages: state.messages.map(m => 
                    m.id === lastUserMsg.id ? { ...m, references: event.payload } : m
                )
            }));
        }
        unlistenRefs(); // Clean up after first receipt
        unlistenStatus(); // Also clean up status listener
    });
    
    // Auto cleanup after 10 seconds if nothing received
    setTimeout(() => {
        unlistenRefs();
        unlistenStatus();
    }, 10000);

    return originalSendMessage(content, providerId, modelName);
};

const patchedApproveToolCall = async (messageId: string, toolCallId: string) => {
    console.log(`[useChatStore] patchedApproveToolCall called - messageId: ${messageId}, toolCallId: ${toolCallId}`);

    // Check if this is an Agent tool call
    const message = coreUseChatStore.getState().messages.find(m => m.id === messageId);
    const toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);

    console.log(`[useChatStore] Found message: ${!!message}, Found toolCall: ${!!toolCall}`);
    if (toolCall) {
        console.log(`[useChatStore] ToolCall agentId: ${(toolCall as any).agentId}, tool: ${toolCall.tool}`);
    }

    if (toolCall && (toolCall as any).agentId) {
        // Agent tool call: use Agent approval flow
        const agentId = (toolCall as any).agentId;
        console.log(`[useChatStore] Using Agent approval flow for agent ${agentId}`);

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