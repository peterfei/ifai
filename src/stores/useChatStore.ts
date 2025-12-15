import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatState, ToolCall, Message, ContentPart, ImageUrl, BackendMessage, BackendContentPart, BackendImageUrl } from './chatStore';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useFileStore } from './fileStore';
import { useSettingsStore, AIProviderConfig } from './settingsStore';

// Simplified Prompt definition to avoid construction errors
const BASE_SYSTEM_PROMPT = "You are IfAI, an expert coding assistant.";

const TOOL_INSTRUCTIONS = `
You have access to the following tools:

1. agent_write_file(rel_path: string, content: string): Create or overwrite a file.
2. agent_read_file(rel_path: string): Read file content.
3. agent_list_dir(rel_path: string): List directory contents.

IMPORTANT: To create or edit a file, follow these steps STRICTLY:
1. First, output the full file content in a standard markdown code block.
2. Then, immediately output a JSON tool call block using the placeholder "<<FILE_CONTENT>>" for the content field.

Example:
Here is the code for Demo.js:
\
console.log("Hello");
\

\
{
  "tool": "agent_write_file",
  "args": {
    "rel_path": "Demo.js",
    "content": "<<FILE_CONTENT>>"
  }
}
\

ONLY output ONE tool call per response. Wait for user approval.

RULES:
1. ONLY output ONE tool call per response. Wait for user approval.
2. DO NOT proactively update other files (like App.js, routes, or indices) to integrate new files unless explicitly asked. Only perform the specific task requested by the user.
`;

const parseToolCall = (content: string): ToolCall | null => {
    // Basic regex failed on nested braces. We need to manually find the JSON block.
    // 1. Find start of JSON
    let startIndex = -1;
    let toolCallBlockStart = -1;

    const codeBlockStart = content.lastIndexOf('```json');
    if (codeBlockStart !== -1) {
        startIndex = codeBlockStart + 7;
        toolCallBlockStart = codeBlockStart;
    } else {
        startIndex = content.lastIndexOf('{');
        // Check if it looks like a tool call
        if (startIndex !== -1) {
             toolCallBlockStart = startIndex;
        }
    }

    if (startIndex === -1) return null;

    // Scan for opening brace
    let openBraceIndex = content.indexOf('{', startIndex);
    if (openBraceIndex === -1) return null;

    // Count braces to find the matching closer
    let braceCount = 0;
    let endIndex = -1;
    let inString = false;
    let escape = false;

    for (let i = openBraceIndex; i < content.length; i++) {
        const char = content[i];
        
        if (!escape && char === '"') {
            inString = !inString;
        }
        
        if (!escape && char === '\\') {
            escape = true;
        } else {
            escape = false;
        }

        if (!inString) {
            if (char === '{') {
                braceCount++;
            } else if (char === '}') {
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
                    // We look for ```lang ... ``` strictly BEFORE the tool call block
                    const beforeTool = content.substring(0, toolCallBlockStart);
                    
                    // Robust extraction strategy:
                    // 1. Find all code blocks
                    // 2. Merge adjacent blocks (handling AI continuation artifacts)
                    // 3. Pick the longest block
                    
                    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
                    const blocks: {start: number, end: number, lang: string, content: string}[] = [];
                    let match;
                    while ((match = codeBlockRegex.exec(beforeTool)) !== null) {
                        blocks.push({
                            start: match.index,
                            end: match.index + match[0].length,
                            lang: match[1] || '',
                            content: match[2]
                        });
                    }

                    const mergedBlocks: typeof blocks = [];
                    if (blocks.length > 0) {
                        let current = blocks[0];
                        for (let i = 1; i < blocks.length; i++) {
                            const next = blocks[i];
                            const gap = beforeTool.substring(current.end, next.start);
                            
                            // Merge if gap is empty/whitespace, assuming it's a split artifact
                            if (!gap.trim()) {
                                current.content += next.content;
                                current.end = next.end;
                            } else {
                                mergedBlocks.push(current);
                                current = next;
                            }
                        }
                        mergedBlocks.push(current);
                    }

                    // Find longest block
                    let bestBlock = null;
                    let maxLength = -1;
                    for (const block of mergedBlocks) {
                        if (block.content.length > maxLength) {
                            maxLength = block.content.length;
                            bestBlock = block;
                        }
                    }

                    if (bestBlock) {
                         json.args.content = bestBlock.content.trim();
                    } else {
                        // Fallback to old logic if regex fails for some reason (rare)
                        const lastCodeBlockEnd = beforeTool.lastIndexOf('```');
                        if (lastCodeBlockEnd !== -1) {
                            const lastCodeBlockStart = beforeTool.lastIndexOf('```', lastCodeBlockEnd - 1);
                            if (lastCodeBlockStart !== -1) {
                                let codeBlock = beforeTool.substring(lastCodeBlockStart, lastCodeBlockEnd);
                                const firstLineBreak = codeBlock.indexOf('\n');
                                if (firstLineBreak !== -1) {
                                    codeBlock = codeBlock.substring(firstLineBreak + 1);
                                }
                                json.args.content = codeBlock.trim();
                            }
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

      addMessage: (message) => set((state) => ({
        messages: [...state.messages, message] // message is now chatStore::Message
      })),
      updateMessageContent: (id, content) => set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === id ? { ...msg, content } : msg // Only updates string content
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
      
        addMessage({ id: assistantMsgId, role: 'assistant', content: '' }); // Initial empty message
        setLoading(true);
      
        try {
          let fullResponse = "";

          const unlistenData = await listen<string>(eventId, (event) => {
            const chunk = event.payload;
            fullResponse += chunk;
            
            const { messages } = get();
            const msg = messages.find(m => m.id === assistantMsgId);
            if (msg) {
              updateMessageContent(assistantMsgId, msg.content + chunk);
            }
          });

          const cleanup = () => {
            const toolCall = parseToolCall(fullResponse);
            if (toolCall) {
              set((state) => ({
                messages: state.messages.map(msg =>
                  msg.id === assistantMsgId ? {
                    ...msg,
                    content: fullResponse, // Keep original content (string)
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
            if (!toolCall.args.content || toolCall.args.content === '<<FILE_CONTENT>>' || toolCall.args.content.trim().length === 0) {
                throw new Error("文件内容解析失败或为空。请要求 AI 重新生成。");
            }
            
            result = await invoke('agent_write_file', {
                rootPath: fileStore.rootPath,
                relPath: toolCall.args.rel_path,
                content: toolCall.args.content
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
                content: toolCall.args.content,
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
      
        // Construct history to be sent to backend (backend expects ai::Message format)
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
        
        // Add Tool Result as User Message (simulating feedback)
        history.push({
          role: 'user',
          content: [{ type: 'text', text: `[System] Tool '${toolCall.tool}' executed successfully.\nResult:\n${result}\n\nINSTRUCTION: You have received the tool output. Do NOT repeat this action. Proceed immediately to the next step.` }]
        });
        
        // Prepend System Prompt (hacky but needed since we don't persist it)
        history.unshift({ role: 'system', content: [{ type: 'text', text: BASE_SYSTEM_PROMPT + "\n\n" + TOOL_INSTRUCTIONS }] });
      
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

        finalSystemPrompt += `\n\n${TOOL_INSTRUCTIONS}`;
      
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
            // Do NOT persist tc.result as it can be very large (file content)
          }))
        })),
      }),
    }
  )
);
