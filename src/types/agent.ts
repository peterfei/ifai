export type AgentStatus = 'idle' | 'running' | 'waitingfortool' | 'stopped' | 'failed' | 'completed' | 'initializing';

export type AgentEventType = 
  | 'thinking'     // Analysis, reasoning, explanations
  | 'tool_call'    // Requesting to use a tool
  | 'tool_result'  // Result of a tool execution
  | 'result'       // Final task result
  | 'status'       // Status updates
  | 'log'          // Activity logs
  | 'error';       // Error during execution

export interface Agent {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  progress: number; // 0.0 to 1.0
  logs: string[];
  content?: string; // The accumulated "thinking" content
  expiresAt?: number;
  startTime?: number;
  threadId?: string; // Associated thread ID for background tasks
  pendingApproval?: {
    tool: string;
    path: string;
    content: string;
  };
  currentStep?: string;
}

export interface AgentEventPayload {
  type: AgentEventType;
  content?: string;
  toolCall?: {
    id: string;
    tool: string;
    args: any;
    isPartial?: boolean;
  };
  result?: string;
  error?: string;
}