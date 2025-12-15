import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatState, ToolCall, Message, ContentPart, ImageUrl, BackendMessage, BackendContentPart, BackendImageUrl } from './chatStore';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useFileStore } from './fileStore';
import { useSettingsStore, AIProviderConfig } from './settingsStore';

const BASE_SYSTEM_PROMPT = "You are IfAI, an expert coding assistant. You have access to file system tools. When you need to perform an action, call the corresponding function using the native tool calling mechanism. DO NOT describe the tool call in text or code blocks. Just invoke it.";

interface StreamingTool {
    id: string;
    name: string;
    arguments: string;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      isLoading: false,

      addMessage: (message) => set((state) => ({
        messages: [...state.messages, message]
      })),
      updateMessageContent: (id, content) => set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === id ? { ...msg, content } : msg
        ),
      })),
      setLoading: (loading) => set({ isLoading: loading }),
      
      toggleAutocomplete: () => {
        const settingsStore = useSettingsStore.getState();
        settingsStore.updateSettings({ enableAutocomplete: !settingsStore.enableAutocomplete });
      },
      
      generateResponse: async (history: BackendMessage[], providerConfig: AIProviderConfig) => {
        const { addMessage, setLoading, updateMessageContent } = get();
        const assistantMsgId = uuidv4();
        const eventId = `chat_${assistantMsgId}`;
      
        addMessage({ id: assistantMsgId, role: 'assistant', content: '' });
        setLoading(true);
      
        try {
          let fullResponse = "";
          let lastUpdate = 0;
          let streamingTools: Record<number, StreamingTool> = {};

          const unlistenData = await listen<string>(eventId, (event) => {
            try {
                const payload = JSON.parse(event.payload);
                
                if (payload.type === 'content') {
                    fullResponse += payload.content;
                } else if (payload.type === 'tool_call') {
                    const chunk = payload.tool_call;
                    const idx = chunk.index;
                    if (!streamingTools[idx]) {
                        streamingTools[idx] = { id: '', name: '', arguments: '' };
                    }
                    if (chunk.id) streamingTools[idx].id = chunk.id;
                    if (chunk.function?.name) streamingTools[idx].name += chunk.function.name;
                    if (chunk.function?.arguments) streamingTools[idx].arguments += chunk.function.arguments;
                }
            } catch (e) {
                // Fallback for legacy raw text events
                fullResponse += event.payload;
            }
            
            const now = Date.now();
            if (now - lastUpdate > 100) {
                updateMessageContent(assistantMsgId, fullResponse);
                lastUpdate = now;
            }
          });

          const cleanup = () => {
            updateMessageContent(assistantMsgId, fullResponse);

            const nativeToolCalls: ToolCall[] = Object.values(streamingTools).map(st => {
                let args = {};
                try { 
                    if (st.arguments) args = JSON.parse(st.arguments); 
                } catch(e) {
                    console.warn("Failed to parse tool arguments:", st.arguments);
                }
                return {
                    id: st.id || uuidv4(),
                    tool: st.name,
                    args: args,
                    status: 'pending' as const
                };
            });

            if (nativeToolCalls.length > 0) {
                set((state) => ({
                    messages: state.messages.map(msg =>
                      msg.id === assistantMsgId ? {
                        ...msg,
                        content: fullResponse,
                        toolCalls: nativeToolCalls
                      } : msg
                    )
                }));
            }
      
            setLoading(false);
            unlistenData();
            unlistenError();
            unlistenFinish();
          };
          
          const unlistenError = await listen<string>(`${eventId}_error`, (event) => {
            console.error('Chat error:', event.payload);
            cleanup();
          });
      
          const unlistenFinish = await listen<string>(`${eventId}_finish`, () => {
            cleanup();
          });
      
          await invoke('ai_chat', { 
            providerConfig,
            messages: history, 
            eventId 
          });
        } catch (e) {
          console.error('Failed to invoke ai_chat', e);
          setLoading(false);
        }
      },
      
      approveToolCall: async (messageId: string, toolCallId: string) => {
        const fileStore = useFileStore.getState();
        if (!fileStore.rootPath) return;
      
        const { messages, generateResponse } = get();
        const msgIndex = messages.findIndex(m => m.id === messageId);
        if (msgIndex === -1) return;
        
        const msg = messages[msgIndex];
        const toolCall = msg.toolCalls?.find(tc => tc.id === toolCallId);
        if (!toolCall) return;
      
        let result = "";
        let status: ToolCall['status'] = 'completed';
        
        try {
          if (toolCall.tool === 'agent_write_file') {
            if (!toolCall.args.content || toolCall.args.content.trim().length === 0) {
                // Native tools won't have placeholder, check empty content
                // But creating empty file is valid.
                // Let's just allow it or warn.
            }
            
            result = await invoke('agent_write_file', {
                rootPath: fileStore.rootPath,
                relPath: toolCall.args.rel_path,
                content: toolCall.args.content || ""
            });
            await fileStore.refreshFileTree();
            fileStore.fetchGitStatuses();

            const fullPath = `${fileStore.rootPath}/${toolCall.args.rel_path}`.replace(/\/\//g, '/');
            const fileName = toolCall.args.rel_path.split('/').pop() || 'file';
            const ext = fileName.split('.').pop() || '';
            let language = 'plaintext';
            if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) language = 'javascript';
            if (ext === 'ts' || ext === 'tsx') language = 'typescript';
            if (ext === 'json') language = 'json';
            if (ext === 'html') language = 'html';
            if (ext === 'css') language = 'css';
            if (ext === 'rs') language = 'rust';
            if (ext === 'py') language = 'python';
            if (ext === 'md') language = 'markdown';

            fileStore.openFile({
                id: uuidv4(),
                path: fullPath,
                name: fileName,
                content: toolCall.args.content || "",
                isDirty: false,
                language
            });
          } else if (toolCall.tool === 'agent_read_file') {
            result = await invoke('agent_read_file', {
                rootPath: fileStore.rootPath,
                relPath: toolCall.args.rel_path
            });
          } else if (toolCall.tool === 'agent_list_dir') {
            const items = await invoke<string[]>('agent_list_dir', {
                rootPath: fileStore.rootPath,
                relPath: toolCall.args.rel_path
            });
            result = items.join('\n');
          }
        } catch (e) {
          status = 'failed';
          result = String(e);
        }
      
        set((state) => ({
          messages: state.messages.map(m => 
            m.id === messageId ? {
              ...m,
              toolCalls: m.toolCalls?.map(tc => 
                tc.id === toolCallId ? { ...tc, status, result } : tc
              )
            } : m
          )
        }));
      
        const history: BackendMessage[] = messages.slice(0, msgIndex + 1).map(m => {
          let contentParts: BackendContentPart[];
          if (m.multiModalContent && m.multiModalContent.length > 0) {
              contentParts = m.multiModalContent.map(p => {
                  if (p.type === 'text' && (!p.text || p.text.trim().length === 0)) {
                      return { ...p, text: "." };
                  }
                  return p;
              });
          } else {
              const textContent = (m.content && m.content.trim().length > 0) ? m.content : ".";
              contentParts = [{ type: 'text', text: textContent }];
          }
          return { role: m.role, content: contentParts };
        });
        
        history.push({
          role: 'user',
          content: [{ type: 'text', text: `[System] Tool '${toolCall.tool}' executed successfully.\nResult:\n${result}` }]
        });
        
        history.unshift({ role: 'system', content: [{ type: 'text', text: BASE_SYSTEM_PROMPT }] });
      
        const settingsStore = useSettingsStore.getState();
        const currentProviderConfig = settingsStore.providers.find(p => p.id === settingsStore.currentProviderId);
        if (currentProviderConfig) {
            await generateResponse(history, currentProviderConfig);
        }
      },
      
      rejectToolCall: async (messageId: string, toolCallId: string) => {
        set((state) => ({
          messages: state.messages.map(m => 
            m.id === messageId ? {
              ...m,
              toolCalls: m.toolCalls?.map(tc => 
                tc.id === toolCallId ? { ...tc, status: 'rejected' } : tc
              )
            } : m
          )
        }));
      },
      
      sendMessage: async (input: string | ContentPart[], providerId: string, modelName: string) => {
        const { messages, isLoading, addMessage, setLoading, generateResponse } = get();
        if ((typeof input === 'string' && !input.trim()) || isLoading) return;
      
        const settingsStore = useSettingsStore.getState();
        const providerConfig = settingsStore.providers.find(p => p.id === providerId);

        if (!providerConfig || !providerConfig.enabled || !providerConfig.apiKey) {
          setLoading(false);
          console.error("AI Provider not configured or enabled.");
          return;
        }

        let fixedBaseUrl = providerConfig.baseUrl;
        if (providerConfig.protocol === 'openai' && 
            !fixedBaseUrl.includes('/chat/completions') && 
            !fixedBaseUrl.includes('minimax')) { 
            if (fixedBaseUrl.endsWith('/')) {
                fixedBaseUrl += 'chat/completions';
            } else {
                fixedBaseUrl += '/chat/completions';
            }
        }

        const currentProviderConfig: AIProviderConfig = { 
          ...providerConfig, 
          baseUrl: fixedBaseUrl,
          models: [modelName] 
        };

        const userMsgId = uuidv4();
        
        let displayContent: string;
        let multiModalContentToSend: ContentPart[];

        if (typeof input === 'string') {
          displayContent = input;
          multiModalContentToSend = [{ type: 'text', text: input }];
        } else {
          displayContent = input.map(part => part.type === 'text' && part.text ? part.text : '').join(' ').trim();
          multiModalContentToSend = input;
        }

        addMessage({ id: userMsgId, role: 'user', content: displayContent, multiModalContent: multiModalContentToSend });

        let finalSystemPrompt = BASE_SYSTEM_PROMPT;
        const rootPath = useFileStore.getState().rootPath;
        
        if (rootPath) {
             try {
                 const ragResult = await invoke<{context: string, references: string[]}>('build_context', { query: displayContent, rootPath });
                 if (ragResult && ragResult.context) {
                     finalSystemPrompt += `\n\nProject Context:\n${ragResult.context}`;
                     
                     set((state) => ({
                         messages: state.messages.map(msg => 
                             msg.id === userMsgId ? { ...msg, references: ragResult.references } : msg
                         )
                     }));
                 }
             } catch (e) {}
        }

        const history: BackendMessage[] = [
            { role: 'system', content: [{ type: 'text', text: finalSystemPrompt }] },
            ...messages.map(m => {
                let contentParts: BackendContentPart[];
                if (m.multiModalContent && m.multiModalContent.length > 0) {
                    contentParts = m.multiModalContent.map(p => {
                        if (p.type === 'text' && (!p.text || p.text.trim().length === 0)) {
                            return { ...p, text: "." };
                        }
                        return p;
                    });
                } else {
                    const textContent = (m.content && m.content.trim().length > 0) ? m.content : ".";
                    contentParts = [{ type: 'text', text: textContent }];
                }
                return { role: m.role, content: contentParts };
            }),
            { role: 'user', content: multiModalContentToSend }
        ];
      
        await generateResponse(history, currentProviderConfig);
      },
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        messages: state.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content, 
          multiModalContent: m.multiModalContent,
          references: m.references,
          toolCalls: m.toolCalls?.map(tc => ({
            id: tc.id,
            tool: tc.tool,
            args: tc.args,
            status: tc.status,
          }))
        })),
      }),
    }
  )
);
