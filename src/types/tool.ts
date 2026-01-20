export interface ToolDescriptor {
  name: string;
  description: string;
  parameters: any; // JSON Schema object
  examples: string[];
  constraints?: string[];
}

export interface ToolCall {
  id: string;
  toolName: string;
  arguments: any;
  function?: {
    name: string;
    arguments: string;
  };
  type?: string;
  tool?: string;
  result?: any;
}

export interface ToolResult {
  callId: string;
  status: 'success' | 'error' | 'timeout' | 'blocked';
  output?: string;
  error?: string;
  metadata?: Record<string, any>;
}
