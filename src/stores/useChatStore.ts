// Wrapper for core library useChatStore
// Handles dependency injection of file and settings stores

import { useChatStore as coreUseChatStore, registerStores, type Message } from 'ifainew-core';
import { useFileStore } from './fileStore';
import { useSettingsStore } from './settingsStore';

// Register stores on first import
// Pass getState functions so core library can access current state
registerStores(useFileStore.getState, useSettingsStore.getState);

// --- Monkey-patching Core Store ---
// Fixes for API errors and UI updates that reside in the core library

const originalSendMessage = coreUseChatStore.getState().sendMessage;
const originalApproveToolCall = coreUseChatStore.getState().approveToolCall;

const sanitizeMessages = (messages: Message[]): Message[] => {
    // Fix: "An assistant message with 'tool_calls' must be followed by tool messages"
    // Remove assistant messages that have tool_calls but no subsequent tool message
    return messages.filter((msg, index) => {
        if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
            const nextMsg = messages[index + 1];
            // If next message is missing or not a tool message, this is a dangling tool call
            if (!nextMsg || nextMsg.role !== 'tool') {
                console.warn('[Patch] Dropping dangling assistant tool_call message:', msg.id);
                return false;
            }
        }
        return true;
    });
};

const patchedSendMessage = async (content: string | any[], providerId: string, modelName: string) => {
    const state = coreUseChatStore.getState();
    const cleanMessages = sanitizeMessages(state.messages);
    
    if (state.messages.length !== cleanMessages.length) {
        console.log('[Patch] Sanitized chat history before sending.');
        coreUseChatStore.setState({ messages: cleanMessages });
    }
    
    return originalSendMessage(content, providerId, modelName);
};

const patchedApproveToolCall = async (messageId: string, toolCallId: string) => {
    await originalApproveToolCall(messageId, toolCallId);
    // Refresh file tree after tool execution to ensure new files created by tools are shown
    console.log('[Patch] Refreshing file tree after tool execution');
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