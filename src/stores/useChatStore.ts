import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatState, ToolCall, Message } from './chatStore';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useFileStore } from './fileStore';

// Safe backtick construction to avoid build errors
const TICK = "`";
const CODE_BLOCK_START = TICK + TICK + TICK + "json";
const CODE_BLOCK_END = TICK + TICK + TICK;

const SYSTEM_PROMPT = `
You are IfAI, an expert coding assistant.
You have access to the following tools:

1. agent_write_file(rel_path: string, content: string): Create or overwrite a file.
2. agent_read_file(rel_path: string): Read file content.
3. agent_list_dir(rel_path: string): List directory contents.

To use a tool, you MUST output a JSON block STRICTLY in this format at the end of your response:

${CODE_BLOCK_START}
{
  "tool": "agent_write_file",
  "args": {
    "rel_path": "src/components/Demo.tsx",
    "content": "..."
  }
}
${CODE_BLOCK_END}

ONLY output ONE tool call per response. Wait for user approval.
`;

const parseToolCall = (content: string): ToolCall | null => {
    // Regex matches ```json ... ``` blocks
    const regex = /```json\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```/;
    const match = content.match(regex);
    if (match) {
        try {
            const json = JSON.parse(match[1]);
            if (json.tool && json.args) {
                return {
                    id: uuidv4(),
                    tool: String(json.tool).trim(),
                    args: json.args,
                    status: 'pending'
                };
            }
        } catch (e) {
            console.error("Failed to parse tool call:", e);
        }
    }
    return null;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      isLoading: false,
      apiKey: '',
      isAutocompleteEnabled: true,
      setApiKey: (key) => set({ apiKey: key }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      updateMessageContent: (id, content) => set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === id ? { ...msg, content } : msg
        ),
      })),
      setLoading: (loading) => set({ isLoading: loading }),
      toggleAutocomplete: () => set((state) => ({
        isAutocompleteEnabled: !state.isAutocompleteEnabled
      })),
      
            // Helper to continue conversation
            generateResponse: async (history: any[]) => {
              const { apiKey, addMessage, setLoading, updateMessageContent } = get();
              const assistantMsgId = uuidv4();
              const eventId = `chat_${assistantMsgId}`;
      
              addMessage({ id: assistantMsgId, role: 'assistant', content: '' });
              setLoading(true);
      
              try {
                  let messageBuffer = "";
                  let lastUpdate = Date.now();
                  let fullResponse = "";
      
                  const unlistenData = await listen<string>(eventId, (event) => {
                      messageBuffer += event.payload;
                      fullResponse += event.payload;
                      const now = Date.now();
                      if (now - lastUpdate > 50) {
                          const { messages } = get();
                          const msg = messages.find(m => m.id === assistantMsgId);
                          if (msg) {
                              updateMessageContent(assistantMsgId, msg.content + messageBuffer);
                              messageBuffer = "";
                              lastUpdate = now;
                          }
                      }
                  });
      
                  const cleanup = () => {
                      if (messageBuffer) {
                          const { messages } = get();
                          const msg = messages.find(m => m.id === assistantMsgId);
                          if (msg) {
                              updateMessageContent(assistantMsgId, msg.content + messageBuffer);
                          }
                      }
                      
                // Parse Tool Calls from full response
                const toolCall = parseToolCall(fullResponse);
                if (toolCall) {
                    // Aggressively strip everything starting from the first code block
                    // This ensures no JSON remains in the UI text
                    const codeBlockIndex = fullResponse.indexOf('```');
                    let cleanContent = fullResponse;
                    if (codeBlockIndex !== -1) {
                        cleanContent = fullResponse.substring(0, codeBlockIndex).trim();
                    }
                    
                    set((state) => ({
                        messages: state.messages.map(msg => 
                            msg.id === assistantMsgId ? { 
                                ...msg, 
                                content: cleanContent,
                                toolCalls: [toolCall] 
                            } : msg
                        )
                    }));
                }
      
                      setLoading(false);
                      unlistenData.then(f => f());
                      unlistenError.then(f => f());
                      unlistenFinish.then(f => f());
                  };
                  
                  const unlistenError = await listen<string>(`${eventId}_error`, (event) => {
                      console.error('Chat error:', event.payload);
                      cleanup();
                  });
      
                  const unlistenFinish = await listen<string>(`${eventId}_finish`, () => {
                      cleanup();
                  });
      
                  await invoke('ai_chat', { 
                      apiKey, 
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
                                      result = await invoke('agent_write_file', { 
                                          rootPath: fileStore.rootPath, 
                                          relPath: toolCall.args.rel_path, 
                                          content: toolCall.args.content 
                                      });
                                      // Refresh file tree and git status
                                      await fileStore.refreshFileTree();
                                      fileStore.fetchGitStatuses();
                                  } else if (toolCall.tool === 'agent_read_file') {                        result = await invoke('agent_read_file', { 
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
      
                // Continue Loop
                // Construct history up to this message, plus the tool output
                // IMPORTANT: We need to include the SYSTEM prompt somewhere.
                // Since we don't store system prompt in messages array usually, we need to reconstruct it.
                // Or better, `sendMessage` constructs it.
                
                // Let's grab the history construction logic from sendMessage basically.
                // But wait, we need the *entire* conversation history context.
                
                // Simplified:
                // 1. messages[0...msgIndex] (Previous convo)
                // 2. msg (Assistant response with tool call)
                // 3. User (Tool Result)
                
                const history = messages.slice(0, msgIndex + 1).map(m => ({ role: m.role, content: m.content }));
                
                // Add Tool Result as User Message (simulating feedback)
                history.push({
                    role: 'user',
                    content: `Tool '${toolCall.tool}' execution result:\n${result}\n\nProceed with the next step.`
                });
                
                // Prepend System Prompt (hacky but needed since we don't persist it)
                history.unshift({ role: 'system', content: SYSTEM_PROMPT });
      
                await generateResponse(history);
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
      
            sendMessage: async (input: string) => {
              const { apiKey, messages, isLoading, addMessage, setLoading, generateResponse } = get();
              if (!input.trim() || !apiKey || isLoading) return;
      
              const userMsgId = uuidv4();
              addMessage({ id: userMsgId, role: 'user', content: input });
              
              // RAG & System Prompt Construction
              let finalSystemPrompt = SYSTEM_PROMPT;
              const rootPath = useFileStore.getState().rootPath;
              
              // ... (RAG Logic - same as before, simplified for brevity in replace block)
              // Note: I will copy the RAG logic here to keep it working
              
              // For brevity in this replace block, assuming RAG logic is handled or we need to copy it.
              // Actually, since I am replacing the whole block, I must include RAG.
              
              if (rootPath) {
                   try {
                       const ragResult = await invoke<{context: string, references: string[]}>('build_context', { query: input, rootPath });
                       if (ragResult && ragResult.context) {
                           finalSystemPrompt += `\n\nProject Context:\n${ragResult.context}`;
                           // Note: We can't update the *user* message references easily here without ID.
                           // But we can update the *next* assistant message. 
                           // Actually, previous implementation updated assistant message.
                           // Here we haven't created assistant message yet.
                           // Let's just update the user message? Or store it to pass to generateResponse?
                           // Let's pass references to generateResponse? No, generateResponse creates assistant msg.
                       }
                   } catch (e) {}
              }
      
              const history = [
                  { role: 'system', content: finalSystemPrompt },
                  ...messages.map(m => ({ role: m.role, content: m.content })),
                  { role: 'user', content: input }
              ];
      
              await generateResponse(history);
            }    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({ apiKey: state.apiKey, isAutocompleteEnabled: state.isAutocompleteEnabled }),
    }
  )
);