export type AgentStatus = 'idle' | 'running' | 'waitingfortool' | 'stopped' | 'failed' | 'completed' | 'initializing';

export type AgentEventType =
  | 'thinking'     // Analysis, reasoning, explanations
  | 'tool_call'    // Requesting to use a tool
  | 'tool_result'  // Result of a tool execution
  | 'result'       // Final task result
  | 'status'       // Status updates
  | 'log'          // Activity logs
  | 'error'        // Error during execution
  | 'explore_progress'  // Explore agent scan progress
  | 'explore_findings'; // Explore agent discoveries

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

  // Explore agent specific data
  exploreProgress?: {
    phase: 'scanning' | 'analyzing' | 'completed';
    currentPath?: string;
    currentFile?: string;
    progress: {
      total: number;
      scanned: number;
      byDirectory: Record<string, {
        total: number;
        scanned: number;
        status: 'pending' | 'scanning' | 'completed';
      }>;
    };
    scannedFiles?: string[];
  };
  exploreFindings?: {
    summary: string;
    directories: Array<{
      path: string;
      fileCount: number;
      keyFiles: string[];
    }>;
    patterns?: Array<{
      type: 'import' | 'export' | 'class' | 'function';
      description: string;
    }>;
  };
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
  toolCallId?: string;
  result?: string;
  success?: boolean;
  error?: string;

  // Explore agent progress events
  exploreProgress?: {
    phase: 'scanning' | 'analyzing' | 'completed';
    currentPath?: string;
    currentFile?: string;
    progress: {
      total: number;
      scanned: number;
      byDirectory: Record<string, {
        total: number;
        scanned: number;
        status: 'pending' | 'scanning' | 'completed';
      }>;
    };
    scannedFiles?: string[];
  };

  // Explore agent findings events
  exploreFindings?: {
    summary: string;
    directories: Array<{
      path: string;
      fileCount: number;
      keyFiles: string[];
    }>;
    patterns?: Array<{
      type: 'import' | 'export' | 'class' | 'function';
      description: string;
    }>;
  };
}

// Helper types for explore events
export interface ExploreDirectory {
  path: string;
  fileCount: number;
  languages: string[];
  scanStatus: 'pending' | 'scanning' | 'completed';
  keyFiles: string[];
}

export interface ExploreFile {
  path: string;
  language: string;
  size: number;
  relevanceScore: number;
  scanResult?: {
    hasImports: boolean;
    hasExports: boolean;
    dependencies: string[];
    patterns: string[];
  };
}

export interface ExplorePhase {
  phase: 'scanning' | 'analyzing' | 'complete';
  currentPath?: string;
  progress: {
    total: number;
    scanned: number;
    byDirectory: Record<string, { total: number; scanned: number }>;
  };
  findings: {
    directories: ExploreDirectory[];
    files: ExploreFile[];
    patterns: Array<{ type: string; description: string }>;
  };
}