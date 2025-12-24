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
                arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {})
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
        let toolCallUpdate: any = null;

        try {
            // Parse JSON format: {"type":"content","content":"文本"}
            const payload = JSON.parse(event.payload);

            if (payload.type === 'content' && payload.content) {
                textChunk = payload.content;
            } else if (payload.type === 'tool_call' && payload.tool_call) {
                // Note: Rust backend sends snake_case "tool_call", not camelCase "toolCall"
                toolCallUpdate = payload.tool_call;
            }
        } catch (e) {
            // Fallback: treat as plain text
            textChunk = event.payload;
        }

        if (textChunk || toolCallUpdate) {
            const updatedMessages = messages.map(m => {
                if (m.id === assistantMsgId) {
                    const newMsg = { ...m };
                    
                    if (textChunk) {
                        newMsg.content = (newMsg.content || '') + textChunk;
                    }
                    
                    if (toolCallUpdate) {
                        const toolName = toolCallUpdate.function?.name || toolCallUpdate.tool;
                        const newArgsChunk = toolCallUpdate.function?.arguments || '';

                        const existingCalls = newMsg.toolCalls || [];
                        const existingIndex = existingCalls.findIndex(tc => tc.id === toolCallUpdate.id);

                        if (existingIndex !== -1) {
                            const existingCall = existingCalls[existingIndex];
                            const updatedCalls = [...existingCalls];

                            // Typewriter effect: concatenate arguments string
                            const updatedArgsString = ((existingCall as any).function?.arguments || '') + newArgsChunk;

                            // Try to parse JSON (handles escaping automatically)
                            let parsedArgs: any;
                            try {
                                parsedArgs = JSON.parse(updatedArgsString);
                                console.log('[Stream] JSON parse success:', parsedArgs);
                            } catch (e) {
                                // Partial JSON: extract fields via regex and manually unescape
                                parsedArgs = { ...existingCall.args }; // Keep previous values

                                // Extract content field with proper unescaping
                                const contentMatch = updatedArgsString.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                                if (contentMatch) {
                                    // Manually unescape JSON string
                                    let content = contentMatch[1];
                                    content = content
                                        .replace(/\\n/g, '\n')
                                        .replace(/\\r/g, '\r')
                                        .replace(/\\t/g, '\t')
                                        .replace(/\\"/g, '"')
                                        .replace(/\\\\/g, '\\');
                                    parsedArgs.content = content;
                                    console.log('[Stream] Regex extracted content (unescaped):', content.substring(0, 50));
                                }

                                // Extract rel_path field
                                const relPathMatch = updatedArgsString.match(/"rel_path"\s*:\s*"([^"]*)"/);
                                if (relPathMatch) {
                                    parsedArgs.rel_path = relPathMatch[1];
                                }
                            }

                            updatedCalls[existingIndex] = {
                                ...existingCall,
                                id: toolCallUpdate.id || existingCall.id,
                                tool: toolName || existingCall.tool,
                                args: parsedArgs,
                                function: {
                                    name: toolName || (existingCall as any).function?.name,
                                    arguments: updatedArgsString
                                },
                                isPartial: true
                            };
                            newMsg.toolCalls = updatedCalls;
                        } else {
                            // New tool call
                            let initialArgs: any;
                            try {
                                initialArgs = newArgsChunk ? JSON.parse(newArgsChunk) : {};
                            } catch (e) {
                                initialArgs = {};
                            }

                            const newToolCall = {
                                id: toolCallUpdate.id || crypto.randomUUID(),
                                type: 'function' as const,
                                tool: toolName || 'unknown',
                                args: initialArgs,
                                function: {
                                    name: toolName || 'unknown',
                                    arguments: newArgsChunk
                                },
                                status: 'pending' as const,
                                isPartial: true
                            };
                            // @ts-ignore
                            newMsg.toolCalls = [...existingCalls, newToolCall];
                        }
                    }
                    
                    return newMsg;
                }
                return m;
            });

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

    // Finish Listener - Finalize tool calls when streaming completes
    const unlistenFinish = await listen<string>(`${assistantMsgId}_finish`, (event) => {
        console.log("[Chat] Stream finished", event.payload);

        // Finalize all partial tool calls
        const { messages } = coreUseChatStore.getState();
        const updatedMessages = messages.map(m => {
            if (m.id === assistantMsgId && m.toolCalls) {
                return {
                    ...m,
                    toolCalls: m.toolCalls.map(tc => ({
                        ...tc,
                        isPartial: false  // Mark as complete
                    }))
                };
            }
            return m;
        });

        coreUseChatStore.setState({ messages: updatedMessages });
    });

    // Error Listener - Handle stream errors
    const unlistenError = await listen<string>(`${assistantMsgId}_error`, (event) => {
        console.error("[Chat] Stream error", event.payload);

        const { messages } = coreUseChatStore.getState();
        coreUseChatStore.setState({
            messages: messages.map(m =>
                m.id === assistantMsgId ? { ...m, content: `❌ Error: ${event.payload}` } : m
            )
        });
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
        unlistenFinish();
        unlistenError();
    }
};

const patchedGenerateResponse = async (history: any[], providerConfig: any, options?: { enableTools?: boolean }) => {
    console.log(">>> patchedGenerateResponse called");
    
    // 1. Prepare Config (Reuse logic or just use passed config if it's already correct)
    // Assuming providerConfig passed here might be from core, let's ensure it has necessary fields
    const settings = useSettingsStore.getState();
    const fullProviderConfig = settings.providers.find((p: any) => p.id === providerConfig.id) || providerConfig;
    
    const backendConfig = {
        ...fullProviderConfig,
        provider: fullProviderConfig.id,
        id: fullProviderConfig.id,
        api_key: fullProviderConfig.apiKey || "",
        base_url: fullProviderConfig.baseUrl || "",
        models: fullProviderConfig.models || [],
        protocol: fullProviderConfig.protocol || "openai"
    };

    coreUseChatStore.setState({ isLoading: true });

    // 2. Add Assistant Placeholder
    const assistantMsgId = crypto.randomUUID();
    const assistantMsgPlaceholder = {
        id: assistantMsgId,
        role: 'assistant' as const,
        content: ''
    };
    // @ts-ignore
    coreUseChatStore.getState().addMessage(assistantMsgPlaceholder);

    // 3. Prepare History from Store (Source of Truth)
    // We ignore the `history` arg because we want the latest state including tool outputs we just added
    const messages = coreUseChatStore.getState().messages;
    
    // Slice off the placeholder we just added
    const msgHistory = messages.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls ? m.toolCalls.map(tc => {
            let argsString: string;
            if ((tc as any).function?.arguments) {
                argsString = (tc as any).function.arguments;
            } else if (tc.args) {
                argsString = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {});
            } else {
                argsString = '{}';
            }
            return {
                id: tc.id,
                type: 'function',
                function: {
                    name: tc.tool || (tc as any).function?.name,
                    arguments: argsString
                }
            };
        }) : undefined,
        tool_call_id: m.tool_call_id
    }));

    // 4. Setup Listeners (Duplicate logic from patchedSendMessage - refactoring would be better but keeping it self-contained for patch)
    const { listen } = await import('@tauri-apps/api/event');
    
    const unlistenStatus = await listen<string>(`${assistantMsgId}_status`, (event) => {
        const { messages } = coreUseChatStore.getState();
        const lastAssistantMsg = messages.find(m => m.id === assistantMsgId);
        if (lastAssistantMsg && !lastAssistantMsg.content) {
            const updatedMessages = messages.map(m => 
                m.id === assistantMsgId ? { ...m, content: `_(${event.payload})_ \n\n` } : m
            );
            coreUseChatStore.setState({ messages: updatedMessages });
        }
    });

    const unlistenStream = await listen<string>(assistantMsgId, (event) => {
        const { messages } = coreUseChatStore.getState();
        let textChunk = '';
        let toolCallUpdate: any = null;
        try {
            const payload = JSON.parse(event.payload);
            if (payload.type === 'content' && payload.content) textChunk = payload.content;
            else if (payload.type === 'tool_call' && payload.tool_call) toolCallUpdate = payload.tool_call;
        } catch (e) { textChunk = event.payload; }

        if (textChunk || toolCallUpdate) {
            const updatedMessages = messages.map(m => {
                if (m.id === assistantMsgId) {
                    const newMsg = { ...m };
                    if (textChunk) newMsg.content = (newMsg.content || '') + textChunk;
                    if (toolCallUpdate) {
                        const toolName = toolCallUpdate.function?.name || toolCallUpdate.tool;
                        const newArgsChunk = toolCallUpdate.function?.arguments || '';

                        const existingCalls = newMsg.toolCalls || [];
                        const existingIndex = existingCalls.findIndex(tc => tc.id === toolCallUpdate.id);

                        if (existingIndex !== -1) {
                            const existingCall = existingCalls[existingIndex];
                            const prevArgsString = (existingCall as any).function?.arguments || '';
                            const updatedArgsString = prevArgsString + newArgsChunk;

                            let parsedArgs: any;
                            try {
                                parsedArgs = JSON.parse(updatedArgsString);
                            } catch (e) {
                                parsedArgs = { ...existingCall.args };

                                const contentMatch = updatedArgsString.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                                if (contentMatch) {
                                    let content = contentMatch[1];
                                    content = content
                                        .replace(/\\n/g, '\n')
                                        .replace(/\\r/g, '\r')
                                        .replace(/\\t/g, '\t')
                                        .replace(/\\"/g, '"')
                                        .replace(/\\\\/g, '\\');
                                    parsedArgs.content = content;
                                }

                                const relPathMatch = updatedArgsString.match(/"rel_path"\s*:\s*"([^"]*)"/);
                                if (relPathMatch) {
                                    parsedArgs.rel_path = relPathMatch[1];
                                }
                            }

                            const updatedCalls = [...existingCalls];
                            updatedCalls[existingIndex] = {
                                ...existingCall,
                                id: toolCallUpdate.id || existingCall.id,
                                tool: toolName || existingCall.tool,
                                args: parsedArgs,
                                function: { name: toolName || (existingCall as any).function?.name, arguments: updatedArgsString },
                                isPartial: true
                            };
                            newMsg.toolCalls = updatedCalls;
                        } else {
                            // New tool call
                            let initialArgs: any;
                            try {
                                initialArgs = newArgsChunk ? JSON.parse(newArgsChunk) : {};
                            } catch (e) {
                                initialArgs = {};
                            }

                            const newToolCall = {
                                id: toolCallUpdate.id || crypto.randomUUID(),
                                type: 'function' as const,
                                tool: toolName || 'unknown',
                                args: initialArgs,
                                function: { name: toolName || 'unknown', arguments: newArgsChunk },
                                status: 'pending' as const,
                                isPartial: true
                            };
                            // @ts-ignore
                            newMsg.toolCalls = [...existingCalls, newToolCall];
                        }
                    }
                    return newMsg;
                }
                return m;
            });
            coreUseChatStore.setState({ messages: updatedMessages });
        }
    });

    const unlistenRefs = await listen<string[]>("codebase-references", (event) => { /* No user msg to attach to here, maybe just ignore or attach to last msg? */ });
    
    const unlistenCompacted = await listen<any[]>(`${assistantMsgId}_compacted`, (event) => {
        const compactedMessages = event.payload.map(m => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.content,
            toolCalls: m.tool_calls,
            tool_call_id: m.tool_call_id
        }));
        coreUseChatStore.setState({ messages: [...compactedMessages, assistantMsgPlaceholder] });
    });

    const unlistenFinish = await listen<string>(`${assistantMsgId}_finish`, (event) => {
        const { messages } = coreUseChatStore.getState();
        const updatedMessages = messages.map(m => {
            if (m.id === assistantMsgId && m.toolCalls) {
                return { ...m, toolCalls: m.toolCalls.map(tc => ({ ...tc, isPartial: false })) };
            }
            return m;
        });
        coreUseChatStore.setState({ messages: updatedMessages });
    });

    const unlistenError = await listen<string>(`${assistantMsgId}_error`, (event) => {
        const { messages } = coreUseChatStore.getState();
        coreUseChatStore.setState({
            messages: messages.map(m => m.id === assistantMsgId ? { ...m, content: `❌ Error: ${event.payload}` } : m)
        });
    });

    // 5. Invoke Backend
    try {
        await invoke('ai_chat', {
            providerConfig: backendConfig,
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
        unlistenFinish();
        unlistenError();
    }
};

const patchedApproveToolCall = async (messageId: string, toolCallId: string) => {
    console.log(`[useChatStore] patchedApproveToolCall called - messageId: ${messageId}, toolCallId: ${toolCallId}`);

    const state = coreUseChatStore.getState();
    const message = state.messages.find(m => m.id === messageId);
    const toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);

    if (!message || !toolCall) {
        console.error("Message or ToolCall not found");
        return;
    }

    // 1. Handle Agent Tool Calls (delegated to AgentStore)
    if ((toolCall as any).agentId) {
        const agentId = (toolCall as any).agentId;
        console.log(`[useChatStore] Using Agent approval flow for agent ${agentId}`);

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

        await useAgentStore.getState().approveAction(agentId, true);
        useFileStore.getState().refreshFileTree();
        return;
    }

    // 2. Handle File System Tools (Manual Invocation to fix snake_case args)
    const fsTools = ['agent_write_file', 'agent_read_file', 'agent_list_dir'];
    const toolName = toolCall.tool || (toolCall as any).function?.name;

    if (fsTools.includes(toolName)) {
        console.log(`[useChatStore] Intercepting FS tool: ${toolName}`);
        
        // Update status to approved
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

        try {
            const rootPath = useFileStore.getState().rootPath;
            if (!rootPath) throw new Error("No project root opened");

            // Fix arguments: snake_case (LLM) -> camelCase (Tauri)
            const args = toolCall.args;
            const relPath = args.rel_path || args.relPath;
            let content = args.content || "";

            // Content unescaping fix: if content is stringified with escaped newlines, restore them
            if (typeof content === 'string' && content.includes('\\n')) {
                content = content.replace(/\\n/g, '\n').replace(/\\"/g, '"');
            }

            const tauriArgs = {
                rootPath,
                relPath,
                content
            };

            console.log(`[useChatStore] Invoking ${toolName} with`, tauriArgs);
            const result = await invoke(toolName, tauriArgs);
            const stringResult = typeof result === 'string' ? result : JSON.stringify(result);

            // Update status to completed
            coreUseChatStore.setState(state => ({
                messages: state.messages.map(m =>
                    m.id === messageId ? {
                        ...m,
                        toolCalls: m.toolCalls?.map(tc =>
                            tc.id === toolCallId ? { ...tc, status: 'completed' as const, result: stringResult } : tc
                        )
                    } : m
                )
            }));

            // Sync with editor if the file is open
            const fileStore = useFileStore.getState();
            const openedFile = fileStore.openedFiles.find(f => f.path.endsWith(relPath));
            if (openedFile) {
                await fileStore.reloadFileContent(openedFile.id);
            }

            // Add Tool Output Message
            coreUseChatStore.getState().addMessage({
                id: crypto.randomUUID(),
                role: 'tool',
                content: `Success: ${toolName} executed for ${relPath}`,
                tool_call_id: toolCallId
            });

            // Continue Conversation
            const settings = useSettingsStore.getState();
            const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
            if (providerConfig) {
                await patchedGenerateResponse(
                    coreUseChatStore.getState().messages, 
                    providerConfig, 
                    { enableTools: true }
                );
            }

        } catch (e) {
            console.error(`[useChatStore] Tool execution failed:`, e);
            
            // Update status to failed
            coreUseChatStore.setState(state => ({
                messages: state.messages.map(m =>
                    m.id === messageId ? {
                        ...m,
                        toolCalls: m.toolCalls?.map(tc =>
                            tc.id === toolCallId ? { ...tc, status: 'failed' as const, result: String(e) } : tc
                        )
                    } : m
                )
            }));

            // Add Error Output
            coreUseChatStore.getState().addMessage({
                id: crypto.randomUUID(),
                role: 'tool',
                content: `Error: ${String(e)}`,
                tool_call_id: toolCallId
            });
             // Still continue to let AI know it failed? 
             // Yes, usually better to let AI retry or apologize.
             const settings = useSettingsStore.getState();
             const providerConfig = settings.providers.find(p => p.id === settings.currentProviderId);
             if (providerConfig) {
                 await patchedGenerateResponse(
                     coreUseChatStore.getState().messages, 
                     providerConfig, 
                     { enableTools: true }
                 );
             }
        }
        
        useFileStore.getState().refreshFileTree();
        return;
    }

    // 3. Fallback to Original Flow (for other tools)
    console.log(`[useChatStore] Using original approval flow`);
    await originalApproveToolCall(messageId, toolCallId);
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
    // @ts-ignore - patching generateResponse
    generateResponse: patchedGenerateResponse,
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