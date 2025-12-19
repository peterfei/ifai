import { create } from 'zustand';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Agent } from '../types/agent';
import { useFileStore } from './fileStore';
import { useSettingsStore } from './settingsStore';

interface AgentState {
  runningAgents: Agent[];
  activeListeners: Record<string, UnlistenFn>;
  launchAgent: (agentType: string, task: string) => Promise<string>;
  removeAgent: (id: string) => void;
  initEventListeners: () => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  runningAgents: [],
  activeListeners: {},
  
  launchAgent: async (agentType: string, task: string) => {
    const projectRoot = useFileStore.getState().rootPath;
    if (!projectRoot) throw new Error("No project root available");

    const settingsStore = useSettingsStore.getState();
    const providerConfig = settingsStore.providers.find(p => p.id === settingsStore.currentProviderId);
    if (!providerConfig) throw new Error("No AI provider configured");

    const id = await invoke<string>('launch_agent', {
        agentType,
        task,
        projectRoot,
        providerConfig
    });

    const newAgent: Agent = {
        id,
        name: `${agentType} Task`,
        type: agentType,
        status: 'idle',
        progress: 0,
        logs: [],
        content: ""
    };

    set(state => ({ runningAgents: [newAgent, ...state.runningAgents] }));

    const eventId = `agent_${id}`;
    const unlisten = await listen<any>(eventId, (event) => {
        const payload = event.payload;
        if (payload && typeof payload === 'object' && payload.type === 'content') {
            const chunk = payload.content || "";
            // Update Agent Card
            set(state => ({
                runningAgents: state.runningAgents.map(a => 
                    a.id === id ? { ...a, content: (a.content || "") + chunk } : a
                )
            }));

            // Sync to Main Chat Message
            const { updateMessageContent, messages } = coreUseChatStore.getState();
            const linkedMsg = messages.find(m => (m as any).agentId === id);
            if (linkedMsg) {
                const newContent = (linkedMsg.content || "") + chunk;
                updateMessageContent(linkedMsg.id, newContent);
            }
        } 
        // ... (rest handle raw string if needed)
    });

    set(state => ({
        activeListeners: { ...state.activeListeners, [id]: unlisten }
    }));

    return id;
  },

  removeAgent: (id: string) => {
      const { activeListeners } = get();
      if (activeListeners[id]) {
          activeListeners[id]();
      }
      set(state => {
          const { [id]: _, ...remainingListeners } = state.activeListeners;
          return {
              runningAgents: state.runningAgents.filter(a => a.id !== id),
              activeListeners: remainingListeners
          };
      });
  },

  initEventListeners: async () => {
      console.log('[AgentStore] Initializing global event listeners');
      
      await listen('agent:status', (event: any) => {
        const payload = event.payload;
        const id = payload.id;
        useAgentStore.setState(state => ({
            runningAgents: state.runningAgents.map(a => a.id === id ? { ...a, status: payload.status, progress: payload.progress } : a)
        }));
      });

      await listen('agent:log', (event: any) => {
        const payload = event.payload;
        const id = payload.id;
        useAgentStore.setState(state => ({
            runningAgents: state.runningAgents.map(a => 
                a.id === id ? { ...a, logs: [...a.logs, payload.message] } : a
            )
        }));
      });

      await listen('agent:result', (event: any) => {
        const payload = event.payload;
        const id = payload.id;
        const output = payload.output;
        const expiresAt = Date.now() + 10000;

        console.log('[AgentStore] Agent finished:', id);

        useAgentStore.setState(state => ({
            runningAgents: state.runningAgents.map(a => 
                a.id === id ? { 
                    ...a, 
                    status: 'completed', 
                    progress: 1.0,
                    expiresAt,
                    logs: [...a.logs, `RESULT: ${output}`] 
                } : a
            )
        }));

        // Auto-close timer
        setTimeout(() => {
            const { runningAgents, removeAgent } = useAgentStore.getState();
            if (runningAgents.find(a => a.id === id)) {
                removeAgent(id);
            }
        }, 10000);
      });
  }
}));
