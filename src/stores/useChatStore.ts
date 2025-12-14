import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatState, ToolCall, Message } from './chatStore';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useFileStore } from './fileStore';

// Safe backtick construction to avoid build errors
const TICK = "`";
const JSON_BLOCK_START = TICK + TICK + TICK + "json";
const JS_BLOCK_START = TICK + TICK + TICK + "javascript";
const BLOCK_END = TICK + TICK + TICK;

const SYSTEM_PROMPT = `
You are IfAI, an expert coding assistant.
You have access to the following tools:

1. agent_write_file(rel_path: string, content: string): Create or overwrite a file.
2. agent_read_file(rel_path: string): Read file content.
3. agent_list_dir(rel_path: string): List directory contents.

IMPORTANT: To create or edit a file, follow these steps STRICTLY:
1. First, output the full file content in a standard markdown code block.
2. Then, immediately output a JSON tool call block using the placeholder "<<FILE_CONTENT>>" for the content field.

Example:
Here is the code for Demo.js:
${JS_BLOCK_START}
console.log("Hello");
${BLOCK_END}

${JSON_BLOCK_START}
{
  "tool": "agent_write_file",
  "args": {
    "rel_path": "Demo.js",
    "content": "<<FILE_CONTENT>>"
  }
}
${BLOCK_END}

ONLY output ONE tool call per response. Wait for user approval.
`;

const parseToolCall = (content: string): ToolCall | null => {
    // 1. Find JSON block
    let startIndex = content.lastIndexOf('```json'); // Look for the LAST json block (usually at end)
    if (startIndex === -1) {
        startIndex = content.lastIndexOf('{'); // Fallback
    } else {
        startIndex += 7;
    }

    if (startIndex === -1) return null;

    // ... (Use existing brace counting logic)
    let openBraceIndex = content.indexOf('{', startIndex);
    if (openBraceIndex === -1) return null;

    let braceCount = 0;
    let endIndex = -1;
    let inString = false;
    let escape = false;

    for (let i = openBraceIndex; i < content.length; i++) {
        const char = content[i];
        if (!escape && char === '"') inString = !inString;
        if (!escape && char === '\\') escape = true; else escape = false;

        if (!inString) {
            if (char === '{') braceCount++;
            else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    endIndex = i + 1;
                    break;
                }
            }
        }
    }

    if (endIndex !== -1) {
        const jsonStr = content.substring(openBraceIndex, endIndex);
        try {
            console.log("Parsing JSON:", jsonStr);
            const json = JSON.parse(jsonStr);
            
            if (json.tool && json.args) {
                // Handle <<FILE_CONTENT>> replacement
                if (json.args.content === '<<FILE_CONTENT>>') {
                    // Search backwards for the last code block
                    // We look for ```lang ... ``` before the tool call
                    const beforeTool = content.substring(0, startIndex);
                    const lastCodeBlockEnd = beforeTool.lastIndexOf('```');
                    if (lastCodeBlockEnd !== -1) {
                        const lastCodeBlockStart = beforeTool.lastIndexOf('```', lastCodeBlockEnd - 1);
                        if (lastCodeBlockStart !== -1) {
                            // Extract content
                            let codeBlock = beforeTool.substring(lastCodeBlockStart, lastCodeBlockEnd);
                            // Remove first line (```lang)
                            const firstLineBreak = codeBlock.indexOf('\n');
                            if (firstLineBreak !== -1) {
                                codeBlock = codeBlock.substring(firstLineBreak + 1);
                            }
                            json.args.content = codeBlock.trim();
                        }
                    }
                }

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
                    // Aggressively strip the JSON block using the same robust regex
                    const cleanContent = fullResponse.replace(/(?:```(?:json)?\s*)?(\{[\s\S]*?"tool"[\s\S]*?\}\s*)(?:\s*```)?/gi, '').trim();
                    
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
              
              if (rootPath) {
                   try {
                       const ragResult = await invoke<{context: string, references: string[]}>('build_context', { query: input, rootPath });
                       if (ragResult && ragResult.context) {
                           finalSystemPrompt += `\n\nProject Context:\n${ragResult.context}`;
                       }
                   } catch (e) {}
              }
      
              const history = [
                  { role: 'system', content: finalSystemPrompt },
                  ...messages.map(m => ({ role: m.role, content: m.content })),
                  { role: 'user', content: input }
              ];
      
              await generateResponse(history);
            }
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({ apiKey: state.apiKey, isAutocompleteEnabled: state.isAutocompleteEnabled }),
    }
  )
);