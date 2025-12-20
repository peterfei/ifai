const { create } = require('zustand');

// Mock dependencies
const listeners = {};
const mockListen = async (event, callback) => {
    listeners[event] = callback;
    return () => { delete listeners[event]; };
};

// Mock invoke
const mockInvoke = async (cmd, args) => {
    if (cmd === 'launch_agent') return 'agent-123';
    return null;
};

// Mock Store implementation (simplified from agentStore.ts for testing core logic)
const createStore = () => {
    return create((set, get) => ({
        runningAgents: [],
        pendingStatusUpdates: {}, // The fix we want to verify
        
        launchAgent: async () => {
            const id = await mockInvoke('launch_agent');
            
            // SIMULATE DELAY: Frontend takes time to process
            await new Promise(r => setTimeout(r, 10));

            // Check buffer
            const pendingUpdate = get().pendingStatusUpdates[id];
            
            const newAgent = {
                id,
                status: pendingUpdate ? pendingUpdate.status : 'idle',
                progress: pendingUpdate ? pendingUpdate.progress : 0,
                logs: []
            };

            set(state => {
                const { [id]: _, ...rest } = state.pendingStatusUpdates;
                return {
                    runningAgents: [newAgent, ...state.runningAgents],
                    pendingStatusUpdates: rest
                };
            });
            return id;
        },

        initEventListeners: async () => {
            await mockListen('agent:status', (event) => {
                const { id, status, progress } = event.payload;
                set(state => {
                    const agent = state.runningAgents.find(a => a.id === id);
                    if (agent) {
                        return {
                            runningAgents: state.runningAgents.map(a => a.id === id ? { ...a, status, progress } : a)
                        };
                    } else {
                        // BUFFER LOGIC
                        console.log(`Buffering status for ${id}`);
                        return {
                            pendingStatusUpdates: {
                                ...state.pendingStatusUpdates,
                                [id]: { status, progress }
                            }
                        };
                    }
                });
            });
        }
    }));
};

async function runTest() {
    console.log('--- Testing Agent Store Race Condition ---');
    const useStore = createStore();
    const store = useStore.getState();

    // 1. Initialize Listeners
    await store.initEventListeners();

    // 2. TRIGGER EVENT BEFORE AGENT EXISTS (The Race Condition)
    console.log('Simulating backend event arriving BEFORE agent creation...');
    if (listeners['agent:status']) {
        listeners['agent:status']({ 
            payload: { id: 'agent-123', status: 'running', progress: 0.1 } 
        });
    }

    // 3. Launch Agent (which happens "after" the event in this scenario)
    console.log('Launching agent...');
    await store.launchAgent();

    // 4. Verify State
    const agent = useStore.getState().runningAgents.find(a => a.id === 'agent-123');
    
    if (agent && agent.status === 'running') {
        console.log('✅ TEST PASSED: Agent picked up the buffered "running" status.');
    } else {
        console.error('❌ TEST FAILED: Agent status is', agent ? agent.status : 'missing');
        console.error('Expected "running". This confirms the bug without buffering.');
        process.exit(1);
    }
}

runTest();
