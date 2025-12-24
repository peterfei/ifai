import { create } from 'zustand';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Agent, AgentEventPayload } from '../types/agent';
import { useFileStore } from './fileStore';
import { useSettingsStore } from './settingsStore';
import { useChatStore as coreUseChatStore } from 'ifainew-core';
import { v4 as uuidv4 } from 'uuid';

interface AgentState {
  runningAgents: Agent[];
  activeListeners: Record<string, UnlistenFn>;
  agentToMessageMap: Record<string, string>;
  launchAgent: (agentType: string, task: string, chatMsgId?: string) => Promise<string>;
  removeAgent: (id: string) => void;
  initEventListeners: () => Promise<() => void>;
  approveAction: (id: string, approved: boolean) => Promise<void>;
  clearCompletedAgents: () => void;
}

function unescapeToolArguments(args: any): any {
    if (args && typeof args.content === 'string') {
        args.content = args.content.replace(/\\n/g, '\n').replace(/\\\"/g, '"');
    }
    return args;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  runningAgents: [],
  activeListeners: {},
  agentToMessageMap: {},
  
  launchAgent: async (agentType: string, task: string, chatMsgId?: string) => {
    // 1. Pre-generate ID
    const id = uuidv4();
    const eventId = `agent_${id}`;
    
    const projectRoot = useFileStore.getState().rootPath;
    if (!projectRoot) throw new Error("No project root available");

    const settingsStore = useSettingsStore.getState();
    const providerConfig = settingsStore.providers.find(p => p.id === settingsStore.currentProviderId);
    if (!providerConfig) throw new Error("No AI provider configured");

    // Convert frontend providerConfig to backend format
    const backendProviderConfig = {
      provider: providerConfig.protocol,
      api_key: providerConfig.apiKey,
      base_url: providerConfig.baseUrl,
      models: providerConfig.models,
    };

    // 2. Setup message mapping if needed
    if (chatMsgId) {
        set(state => ({ agentToMessageMap: { ...state.agentToMessageMap, [id]: chatMsgId } }));
    }

    // 3. Setup Listener FIRST - This is critical for industrial grade reliability
    // We register the listener BEFORE calling the backend to catch the very first event.
    let thinkingBuffer = "";
    let lastFlush = 0;

    const unlisten = await listen<AgentEventPayload>(eventId, (event) => {
        const payload = event.payload;
        if (!payload || typeof payload !== 'object') return;

        console.log(`[AgentStore] Scoped event for ${id}:`, payload.type, payload);

        const chatState = coreUseChatStore.getState();
        const msgId = get().agentToMessageMap[id];

        if (!msgId && payload.type === 'tool_call') {
            console.warn(`[AgentStore] No msgId found for agent ${id} - cannot process tool calls`);
        }
        
        // --- Status Update ---
        if (payload.type === 'status' && (payload as any).status) {
            const { status, progress } = (payload as any);
            set(state => ({
                runningAgents: state.runningAgents.map(a => 
                    a.id === id ? { ...a, status: status as any, progress } : a
                )
            }));
        }
        // --- Log Update ---
        else if (payload.type === 'log' && (payload as any).message) {
            const message = (payload as any).message;
            set(state => ({
                runningAgents: state.runningAgents.map(a => {
                    if (a.id !== id) return a;
                    const newLogs = [...a.logs, message].slice(-100);
                    // Defensive status fix: if we get logs, the agent is definitely active.
                    // Only fix initializing and idle states, preserve waitingfortool (valid state)
                    const needsStatusFix = a.status === 'initializing' || a.status === 'idle';
                    return { ...a, logs: newLogs, status: needsStatusFix ? 'running' : a.status };
                })
            }));
        }
        // --- Content Streaming ---
        else if (payload.type === 'thinking' || (payload as any).type === 'content') {
            const chunk = (payload.content || (payload as any).content) || "";
            thinkingBuffer += chunk;

            const now = Date.now();
            if (now - lastFlush > 100) {
                const currentBuffer = thinkingBuffer;
                set(state => ({
                    runningAgents: state.runningAgents.map(a => 
                        a.id === id ? { ...a, content: (a.content || "") + currentBuffer } : a
                    )
                }));
                thinkingBuffer = "";
                lastFlush = now;
            }
        } 
        // --- Tool Calls ---
        else if (payload.type === 'tool_call') {
            const toolCall = payload.toolCall;
            if (toolCall && msgId) {
                const liveToolCall = {
                    id: toolCall.id,
                    tool: toolCall.tool,
                    args: unescapeToolArguments(toolCall.args),
                    status: 'pending' as const,
                    isPartial: toolCall.isPartial,
                    agentId: id  // Mark this tool call as coming from an Agent
                };

                let messageUpdated = false;
                const updatedMessages = chatState.messages.map(m => {
                    if (m.id === msgId) {
                        const existing = m.toolCalls || [];
                        const index = existing.findIndex(tc => tc.id === liveToolCall.id);
                        
                        if (index !== -1) {
                            // Update existing tool call
                            const newToolCalls = [...existing];
                            newToolCalls[index] = {
                                ...newToolCalls[index],
                                ...liveToolCall,
                                // If it was already approved/completed, don't revert status
                                status: (newToolCalls[index].status !== 'pending' && !liveToolCall.isPartial) 
                                    ? newToolCalls[index].status 
                                    : liveToolCall.status
                            };
                            messageUpdated = true;
                            return { ...m, toolCalls: newToolCalls };
                        } else {
                            // Add new tool call
                            messageUpdated = true;
                            return { ...m, toolCalls: [...existing, liveToolCall] };
                        }
                    }
                    return m;
                });

                if (messageUpdated) {
                    coreUseChatStore.setState({ messages: updatedMessages });

                    // Only trigger auto-approve and logs if it's NOT partial and NEWLY completed
                    const isNewlyCompleted = !liveToolCall.isPartial;
                    const wasAlreadyHandled = chatState.messages.find(m => m.id === msgId)?.toolCalls?.find(tc => tc.id === liveToolCall.id)?.isPartial === false;

                    if (isNewlyCompleted && !wasAlreadyHandled) {
                        const settings = useSettingsStore.getState();
                        if (settings.agentAutoApprove) {
                            setTimeout(async () => {
                                const approveToolCall = coreUseChatStore.getState().approveToolCall;
                                if (approveToolCall) {
                                    try {
                                        await approveToolCall(msgId, toolCall.id);
                                    } catch (error) {
                                        console.error(`[AgentStore] Auto-approve failed:`, error);
                                    }
                                }
                            }, 200);
                        }
                    }
                }
            }
        }
        // --- Final Result ---
        else if (payload.type === 'result') {
            const result = payload.result || "";
            if (msgId) chatState.updateMessageContent(msgId, result);
            set(state => ({
                runningAgents: state.runningAgents.map(a => 
                    a.id === id ? { ...a, status: 'completed', progress: 1.0, expiresAt: Date.now() + 60000 } : a
                )
            }));
        }
        // --- Error ---
        else if (payload.type === 'error') {
            if (msgId) chatState.updateMessageContent(msgId, `❌ Agent Error: ${payload.error}`);
            set(state => ({
                runningAgents: state.runningAgents.map(a => a.id === id ? { ...a, status: 'failed' } : a)
            }));
        }
    });

    // Store listener cleanup
    set(state => ({ activeListeners: { ...state.activeListeners, [id]: unlisten } }));

    // 4. Create Agent entry in Store
    const newAgent: Agent = {
        id,
        name: `${agentType} Task`,
        type: agentType,
        status: 'initializing', 
        progress: 0,
        logs: [`🚀 Task registered...`],
        content: "",
        startTime: Date.now()
    };
    set(state => ({ runningAgents: [newAgent, ...state.runningAgents] }));

    // 5. Invoke Backend FINALLY
    // By now, the listener is active and the agent entry exists in state.
    try {
        await invoke('launch_agent', {
            id,
            agentType,
            task,
            projectRoot,
            providerConfig: backendProviderConfig
        });
    } catch (error) {
        console.error("Failed to launch agent:", error);
        set(state => ({
            runningAgents: state.runningAgents.map(a => 
                a.id === id ? { ...a, status: 'failed', logs: [...a.logs, `❌ Launch failed: ${error}`] } : a
            )
        }));
        if (unlisten) unlisten();
    }

    return id;
  },

  approveAction: async (id: string, approved: boolean) => {
      await invoke('approve_agent_action', { id, approved });
      set(state => ({
          runningAgents: state.runningAgents.map(a => 
              a.id === id ? { ...a, pendingApproval: undefined } : a
          )
      }));
  },

  removeAgent: (id: string) => {
      const { activeListeners } = get();
      if (activeListeners[id]) activeListeners[id]();
      set(state => {
          const { [id]: _, ...remainingListeners } = state.activeListeners;
          const { [id]: __, ...remainingMap } = state.agentToMessageMap;
          return {
              runningAgents: state.runningAgents.filter(a => a.id !== id),
              activeListeners: remainingListeners,
              agentToMessageMap: remainingMap
          };
      });
  },

  clearCompletedAgents: () => {
      set(state => {
          const running = [];
          const completed = [];
          state.runningAgents.forEach(a => {
              if (a.status === 'completed' || a.status === 'failed') completed.push(a);
              else running.push(a);
          });
          completed.forEach(a => { if (state.activeListeners[a.id]) state.activeListeners[a.id](); });
          const newListeners = { ...state.activeListeners };
          completed.forEach(a => delete newListeners[a.id]);
          return { runningAgents: running, activeListeners: newListeners };
      });
  },

  initEventListeners: async () => {
      console.log('[AgentStore] 🎯 Global event listeners initialized');
      const unlisteners: UnlistenFn[] = [];

      // We still keep global status listener as a fallback or for other UI parts
      const unlistenStatus = await listen('agent:status', (event: any) => {
        const { id, status, progress } = event.payload;
        useAgentStore.setState(state => {
            const agent = state.runningAgents.find(a => a.id === id);
            if (agent && (agent.status !== status || agent.progress !== progress)) {
                return { runningAgents: state.runningAgents.map(a => a.id === id ? { ...a, status: status as any, progress } : a) };
            }
            return state;
        });
      });
      unlisteners.push(unlistenStatus);

      return () => {
          console.log('[AgentStore] 🛑 Cleaning up global event listeners...');
          unlisteners.forEach(u => u());
      };
  }
}));