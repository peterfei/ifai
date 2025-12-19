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

const patchedSendMessage = async (content: string | any[], providerId: string, modelName: string) => {
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
            
            // Manually add user message to UI since we are bypassing core's sendMessage
            const { addMessage } = coreUseChatStore.getState();
            // Note: We need a unique ID. uuidv4 is imported in core but not exposed. 
            // We can use crypto.randomUUID() in modern browsers.
            const userMsgId = crypto.randomUUID();
            
            // Construct user message object manually since we can't use internal helpers
            addMessage({ 
                id: userMsgId, 
                role: 'user', 
                content: textInput,
                multiModalContent: typeof content === 'string' ? [{type: 'text', text: content}] : content
            });

            try {
                const agentId = await useAgentStore.getState().launchAgent(agentName, args || "No specific task provided");
                
                // System feedback - LINKED to agentId
                addMessage({
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: ``, // Start empty, will be filled by stream
                    // @ts-ignore - custom property
                    agentId: agentId,
                    // Indicate this is a live agent message
                    isAgentLive: true 
                });
            } catch (e) {
                addMessage({
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: `❌ **Failed to launch agent**\n\nError: ${String(e)}`
                });
            }
            return; // Intercepted
        }
    }

    // Message sanitization now happens in Rust backend before API call
    return originalSendMessage(content, providerId, modelName);
};

const patchedApproveToolCall = async (messageId: string, toolCallId: string) => {
    // Message sanitization now happens in Rust backend before API call
    await originalApproveToolCall(messageId, toolCallId);

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
    // @ts-ignore - adding new methods to store
    approveAllToolCalls,
    // @ts-ignore - adding new methods to store
    rejectAllToolCalls
});

// ----------------------------------

// Re-export the core chatStore
export const useChatStore = coreUseChatStore;

// Re-export types
export type { ChatState, ToolCall, Message, ContentPart, ImageUrl, BackendMessage, AIProviderConfig } from 'ifainew-core';