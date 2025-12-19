import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Agent } from '../types/agent';
import { useFileStore } from './fileStore';
import { useSettingsStore } from './settingsStore';

interface AgentState {
  runningAgents: Agent[];
  launchAgent: (agentType: string, task: string) => Promise<string>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  runningAgents: [],
  
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

    // Add to local list
    const newAgent: Agent = {
        id,
        name: `${agentType} Task`,
        type: agentType,
        status: 'idle',
        progress: 0,
        logs: []
    };

    set(state => ({ runningAgents: [newAgent, ...state.runningAgents] }));
    return id;
  }
}));

// Global Event Listeners
listen('agent:status', (event: any) => {
    const { id, status, progress } = event.payload;
    useAgentStore.setState(state => ({
        runningAgents: state.runningAgents.map(a => a.id === id ? { ...a, status, progress } : a)
    }));
});

listen('agent:log', (event: any) => {
    const { id, message } = event.payload;
    useAgentStore.setState(state => ({
        runningAgents: state.runningAgents.map(a => 
            a.id === id ? { ...a, logs: [...a.logs, message] } : a
        )
    }));
});

listen('agent:result', (event: any) => {
    const { id, output } = event.payload;
    useAgentStore.setState(state => ({
        runningAgents: state.runningAgents.map(a => 
            a.id === id ? { ...a, status: 'completed', logs: [...a.logs, `RESULT: ${output}`] } : a
        )
    }));
});
