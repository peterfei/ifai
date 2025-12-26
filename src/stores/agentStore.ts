import { create } from 'zustand';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Agent, AgentEventPayload } from '../types/agent';
import { useFileStore } from './fileStore';
import { useSettingsStore } from './settingsStore';
import { useChatStore as coreUseChatStore } from 'ifainew-core';
import { useThreadStore } from './threadStore';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

interface AgentState {
  runningAgents: Agent[];
  activeListeners: Record<string, UnlistenFn>;
  agentToMessageMap: Record<string, string>;
  launchAgent: (agentType: string, task: string, chatMsgId?: string, threadId?: string) => Promise<string>;
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
  
  launchAgent: async (agentType: string, task: string, chatMsgId?: string, threadId?: string) => {
    // 1. Pre-generate ID
    const id = uuidv4();
    const eventId = `agent_${id}`;

    // Get current thread ID if not provided
    const currentThreadId = threadId || useThreadStore.getState().activeThreadId;

    const projectRoot = useFileStore.getState().rootPath;
    if (!projectRoot) throw new Error("No project root available");

    const settingsStore = useSettingsStore.getState();
    const providerConfig = settingsStore.providers.find(p => p.id === settingsStore.currentProviderId);
    if (!providerConfig) throw new Error("No AI provider configured");

    // Convert frontend providerConfig to backend format
    // We spread the original config first to include all fields (like 'enabled', 'name', 'id')
    // Then add compatibility aliases (snake_case, provider/id)
    const backendProviderConfig = {
      ...providerConfig,
      provider: providerConfig.protocol, // Alias for backend compatibility
      api_key: providerConfig.apiKey,    // snake_case alias
      base_url: providerConfig.baseUrl,  // snake_case alias
    };

    // 2. Setup message mapping if needed
    if (chatMsgId) {
        set(state => ({ agentToMessageMap: { ...state.agentToMessageMap, [id]: chatMsgId } }));
    }

    console.log(`[AgentStore] launchAgent - id: ${id}, eventId: ${eventId}, chatMsgId: ${chatMsgId || 'NONE'}, threadId: ${currentThreadId || 'NONE'}`);

    // 3. Setup Listener FIRST - This is critical for industrial grade reliability
    // We register the listener BEFORE calling the backend to catch the very first event.
    let thinkingBuffer = "";
    let lastFlush = 0;

    const unlisten = await listen<AgentEventPayload>(eventId, (event) => {
        console.log(`[AgentStore] 🎯 Listener triggered! eventId: ${eventId}, agentId: ${id}`);
        const payload = event.payload;
        if (!payload || typeof payload !== 'object') return;

        console.log(`[AgentStore] Scoped event for ${id}:`, payload.type, payload);

        const chatState = coreUseChatStore.getState();
        const msgId = get().agentToMessageMap[id];

        // DEBUG: Log msgId status for all events
        console.log(`[AgentStore] DEBUG - Event type: ${payload.type}, msgId: ${msgId || 'UNDEFINED'}, agentId: ${id}`);
        console.log(`[AgentStore] DEBUG - agentToMessageMap:`, get().agentToMessageMap);

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
            const timeSinceLast = now - lastFlush;

            // DEBUG: Log timing to diagnose 1-3s delays
            if (chunk.length > 0) {
                console.log(`[AgentStore] Content chunk: ${chunk.length} chars, time since last: ${timeSinceLast}ms`);
            }

            if (now - lastFlush > 10) {  // Reduced from 100ms to 10ms for faster streaming
                const currentBuffer = thinkingBuffer;

                // Update runningAgents (for GlobalAgentMonitor display)
                set(state => ({
                    runningAgents: state.runningAgents.map(a =>
                        a.id === id ? { ...a, content: (a.content || "") + currentBuffer } : a
                    )
                }));

                // ✅ FIX: Also sync to coreUseChatStore.messages for chat display
                const msgId = get().agentToMessageMap[id];
                if (msgId) {
                    const { messages } = coreUseChatStore.getState();
                    const updatedMessages = messages.map(m => {
                        if (m.id === msgId) {
                            return { ...m, content: (m.content || "") + currentBuffer };
                        }
                        return m;
                    });
                    coreUseChatStore.setState({ messages: updatedMessages });
                }

                thinkingBuffer = "";
                lastFlush = now;
            }
        } 
        // --- Tool Calls ---
        else if (payload.type === 'tool_call') {
            const toolCall = payload.toolCall;
            // Debug log for tool call events
            console.log(`[AgentStore] Received tool_call: tool=${toolCall?.tool}, partial=${toolCall?.isPartial}, content_len=${toolCall?.args?.content?.length || 0}`);
            if (toolCall && msgId) {
                const liveToolCall = {
                    id: toolCall.id,
                    type: 'function' as const,
                    tool: toolCall.tool,
                    args: unescapeToolArguments(toolCall.args),
                    function: {
                        name: toolCall.tool,
                        arguments: JSON.stringify(toolCall.args)
                    },
                    status: 'pending' as const,
                    isPartial: toolCall.isPartial,
                    agentId: id
                };

                let messageUpdated = false;
                const updatedMessages = chatState.messages.map(m => {
                    if (m.id === msgId) {
                        const existing = m.toolCalls || [];
                        const index = existing.findIndex(tc => tc.id === liveToolCall.id);
                        
                        if (index !== -1) {
                            // Check if content actually changed (deduplication for streaming updates)
                            const prevContent = (existing[index] as any).args?.content || '';
                            const nextContent = liveToolCall.args?.content || '';

                            // If content hasn't changed and both are in partial state, skip this update
                            if (prevContent === nextContent &&
                                liveToolCall.isPartial &&
                                (existing[index] as any).isPartial) {
                                // Content unchanged, skip update to avoid unnecessary re-renders
                                return m;
                            }

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
            console.log(`[AgentStore] Result received for agent ${id}, msgId: ${msgId || 'NONE'}`);
            if (msgId) {
                const { messages, isLoading } = coreUseChatStore.getState();
                console.log(`[AgentStore] Before setState: isLoading=${isLoading}`);
                coreUseChatStore.setState({
                    messages: messages.map(m => m.id === msgId ? {
                        ...m,
                        content: result,
                        agentId: undefined,      // ✅ Clear agent ID so isAgentStreaming becomes false
                        isAgentLive: false       // ✅ Clear live marker so highlighting appears
                    } : m),
                    isLoading: false
                });
                console.log(`[AgentStore] After setState: isLoading=${coreUseChatStore.getState().isLoading}`);
            }

            // Get the agent before updating status to check thread info
            const agent = get().runningAgents.find(a => a.id === id);
            const activeThreadId = useThreadStore.getState().activeThreadId;

            set(state => ({
                runningAgents: state.runningAgents.map(a =>
                    a.id === id ? { ...a, status: 'completed', progress: 1.0, expiresAt: Date.now() + 10000 } : a
                )
            }));

            // Show notification if agent completed in background thread
            if (agent && agent.threadId && agent.threadId !== activeThreadId) {
                const thread = useThreadStore.getState().getThread(agent.threadId);
                if (thread) {
                    // Mark thread as having unread activity
                    useThreadStore.getState().updateThread(agent.threadId, { hasUnreadActivity: true });

                    // Show toast notification
                    toast.success('后台任务完成', {
                        description: `"${agent.type}" 在 "${thread.title}" 中已完成`,
                        action: {
                            label: '查看',
                            onClick: () => {
                                useThreadStore.getState().setActiveThread(agent.threadId!);
                            },
                        },
                    });
                }
            }
        }
        // --- Error ---
        else if (payload.type === 'error') {
            if (msgId) {
                const { messages } = coreUseChatStore.getState();
                coreUseChatStore.setState({
                    messages: messages.map(m => m.id === msgId ? {
                        ...m,
                        content: `❌ Agent Error: ${payload.error}`,
                        agentId: undefined,      // ✅ Clear agent ID
                        isAgentLive: false       // ✅ Clear live marker
                    } : m),
                    isLoading: false
                });
            }

            // Get the agent before updating status to check thread info
            const agent = get().runningAgents.find(a => a.id === id);
            const activeThreadId = useThreadStore.getState().activeThreadId;

            set(state => ({
                runningAgents: state.runningAgents.map(a => a.id === id ? { ...a, status: 'failed', expiresAt: Date.now() + 10000 } : a)
            }));

            // Show notification if agent failed in background thread
            if (agent && agent.threadId && agent.threadId !== activeThreadId) {
                const thread = useThreadStore.getState().getThread(agent.threadId);
                if (thread) {
                    // Mark thread as having unread activity
                    useThreadStore.getState().updateThread(agent.threadId, { hasUnreadActivity: true });

                    // Show toast notification
                    toast.error('后台任务失败', {
                        description: `"${agent.type}" 在 "${thread.title}" 中执行失败`,
                        action: {
                            label: '查看',
                            onClick: () => {
                                useThreadStore.getState().setActiveThread(agent.threadId!);
                            },
                        },
                    });
                }
            }
        }
    });

    // Store listener cleanup
    set(state => ({ activeListeners: { ...state.activeListeners, [id]: unlisten } }));

    console.log(`[AgentStore] ✅ Listener registered for eventId: ${eventId}`);

    // 4. Create Agent entry in Store
    const newAgent: Agent = {
        id,
        name: `${agentType} Task`,
        type: agentType,
        status: 'initializing',
        progress: 0,
        logs: [`🚀 Task registered...`],
        content: "",
        startTime: Date.now(),
        threadId: currentThreadId, // Associate with thread
    };
    set(state => ({ runningAgents: [newAgent, ...state.runningAgents] }));

    // 4.5. Add agent task to thread if threadId exists
    if (currentThreadId) {
        useThreadStore.getState().addAgentTask(currentThreadId, id);
        console.log(`[AgentStore] Added agent ${id} to thread ${currentThreadId}`);
    }

    // 5. Invoke Backend FINALLY
    // By now, the listener is active and the agent entry exists in state.
    try {
        console.log(`[AgentStore] 🚀 About to invoke backend launch_agent with id: ${id}, eventId: agent_${id}`);
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
      const { activeListeners, runningAgents } = get();
      const agent = runningAgents.find(a => a.id === id);

      // Remove from thread store if associated
      if (agent?.threadId) {
          useThreadStore.getState().removeAgentTask(agent.threadId, id);
          console.log(`[AgentStore] Removed agent ${id} from thread ${agent.threadId}`);
      }

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