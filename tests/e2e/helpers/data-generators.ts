/**
 * E2E测试数据生成器
 * 提供一致的测试数据生成，避免重复创建mock数据
 */

/**
 * 生成模拟会话（Thread）数据
 */
export function createMockThread(overrides?: Partial<MockThread>): MockThread {
  const timestamp = Date.now();
  const randomId = `thread-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: randomId,
    title: 'Test Thread',
    messages: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    isArchived: false,
    ...overrides
  };
}

/**
 * 生成模拟消息数据
 */
export function createMockMessage(overrides?: Partial<MockMessage>): MockMessage {
  const timestamp = Date.now();
  const randomId = `msg-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: randomId,
    role: 'user',
    content: { Text: 'Test message content' },
    threadId: 'test-thread-id',
    timestamp,
    status: 'completed',
    toolCalls: [],
    ...overrides
  };
}

/**
 * 生成模拟用户消息
 */
export function createMockUserMessage(content: string): MockMessage {
  return createMockMessage({
    role: 'user',
    content: { Text: content }
  });
}

/**
 * 生成模拟Assistant消息
 */
export function createMockAssistantMessage(
  content: string,
  options?: { toolCalls?: MockToolCall[] }
): MockMessage {
  return createMockMessage({
    role: 'assistant',
    content: { Text: content },
    toolCalls: options?.toolCalls || []
  });
}

/**
 * 生成模拟工具调用
 */
export function createMockToolCall(overrides?: Partial<MockToolCall>): MockToolCall {
  return {
    id: `tool-${Date.now()}`,
    name: 'bash',
    arguments: { command: 'echo "test"' },
    result: { stdout: 'test', stderr: '', exitCode: 0 },
    status: 'completed',
    ...overrides
  };
}

/**
 * 生成模拟文件数据
 */
export function createMockFile(overrides?: Partial<MockFile>): MockFile {
  return {
    id: `file-${Date.now()}`,
    name: 'test.ts',
    path: '/Users/mac/mock-project/test.ts',
    content: 'export function test() { return "test"; }',
    language: 'typescript',
    isDirty: false,
    ...overrides
  };
}

/**
 * 生成模拟目录结构
 */
export function createMockDirectoryTree(): MockDirectoryNode {
  return {
    id: 'root',
    name: 'mock-project',
    kind: 'directory',
    path: '/Users/mac/mock-project',
    children: [
      {
        id: 'src',
        name: 'src',
        kind: 'directory',
        path: '/Users/mac/mock-project/src',
        children: [
          {
            id: 'app-tsx',
            name: 'App.tsx',
            kind: 'file',
            path: '/Users/mac/mock-project/src/App.tsx',
            children: []
          },
          {
            id: 'main-tsx',
            name: 'main.tsx',
            kind: 'file',
            path: '/Users/mac/mock-project/src/main.tsx',
            children: []
          }
        ]
      },
      {
        id: 'package-json',
        name: 'package.json',
        kind: 'file',
        path: '/Users/mac/mock-project/package.json',
        children: []
      },
      {
        id: 'readme-md',
        name: 'README.md',
        kind: 'file',
        path: '/Users/mac/mock-project/README.md',
        children: []
      }
    ]
  };
}

/**
 * 生成模拟Agent任务
 */
export function createMockAgentTask(overrides?: Partial<MockAgentTask>): MockAgentTask {
  return {
    id: `task-${Date.now()}`,
    title: 'Test Task',
    description: 'Test task description',
    status: 'pending',
    progress: 0,
    steps: [],
    createdAt: Date.now(),
    ...overrides
  };
}

/**
 * 生成模拟设置
 */
export function createMockSettings(overrides?: Partial<MockSettings>): MockSettings {
  return {
    currentProviderId: 'ollama-e2e',
    currentModel: 'mock-model',
    providers: [
      {
        id: 'ollama-e2e',
        name: 'Ollama Mock',
        protocol: 'openai',
        baseUrl: 'http://localhost:11434/v1/chat/completions',
        apiKey: 'e2e-token',
        models: ['mock-model'],
        enabled: true
      }
    ],
    theme: 'dark',
    fontSize: 14,
    ...overrides
  };
}

/**
 * 生成模拟Provider
 */
export function createMockProvider(overrides?: Partial<MockProvider>): MockProvider {
  return {
    id: `provider-${Date.now()}`,
    name: 'Test Provider',
    protocol: 'openai',
    baseUrl: 'http://localhost:8080/v1/chat/completions',
    apiKey: 'test-key',
    models: ['model-1', 'model-2'],
    enabled: true,
    ...overrides
  };
}

/**
 * 生成聊天消息序列
 */
export function createMockConversation(
  messageCount: number = 3
): MockMessage[] {
  const messages: MockMessage[] = [];

  for (let i = 0; i < messageCount; i++) {
    if (i % 2 === 0) {
      // 用户消息
      messages.push(
        createMockUserMessage(`User message ${i + 1}`)
      );
    } else {
      // Assistant消息
      messages.push(
        createMockAssistantMessage(`Assistant response ${i + 1}`)
      );
    }
  }

  return messages;
}

/**
 * 生成包含工具调用的对话
 */
export function createMockConversationWithToolCalls(): MockMessage[] {
  return [
    createMockUserMessage('执行 echo命令'),
    createMockMessage({
      role: 'assistant',
      content: { Text: '' },
      toolCalls: [
        createMockToolCall({
          name: 'bash',
          arguments: { command: 'echo "Hello World"' }
        })
      ]
    }),
    createMockMessage({
      role: 'assistant',
      content: { Text: '命令执行完成' },
      toolCalls: []
    })
  ];
}

/**
 * 生成流式响应片段
 */
export function createMockStreamChunks(
  content: string,
  chunkSize: number = 5
): string[] {
  const chunks: string[] = [];

  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }

  return chunks;
}

/**
 * 生成模拟错误响应
 */
export function createMockErrorResponse(
  message: string,
  code?: string
): MockError {
  return {
    success: false,
    error: {
      message,
      code: code || 'UNKNOWN_ERROR',
      timestamp: Date.now()
    }
  };
}

/**
 * 生成模拟文件变更
 */
export function createMockFileChange(overrides?: Partial<MockFileChange>): MockFileChange {
  return {
    filePath: '/Users/mac/mock-project/test.ts',
    changeType: 'modified',
    linesAdded: 5,
    linesDeleted: 2,
    ...overrides
  };
}

/**
 * 生成批量测试数据
 */
export function createMockBatchData<T>(
  generator: () => T,
  count: number
): T[] {
  const data: T[] = [];

  for (let i = 0; i < count; i++) {
    data.push(generator());
  }

  return data;
}

// ========== 类型定义 ==========

export interface MockThread {
  id: string;
  title: string;
  messages: MockMessage[];
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
}

export interface MockMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: { Text: string } | { Image: string } | any;
  threadId?: string;
  timestamp: number;
  status: 'pending' | 'streaming' | 'completed' | 'failed';
  toolCalls?: MockToolCall[];
}

export interface MockToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    [key: string]: any;
  };
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp?: number;
}

export interface MockFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

export interface MockDirectoryNode {
  id: string;
  name: string;
  kind: 'file' | 'directory';
  path: string;
  children?: MockDirectoryNode[];
}

export interface MockAgentTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  steps: string[];
  createdAt: number;
  completedAt?: number;
}

export interface MockSettings {
  currentProviderId: string;
  currentModel: string;
  providers: MockProvider[];
  theme: 'light' | 'dark' | 'auto';
  fontSize: number;
}

export interface MockProvider {
  id: string;
  name: string;
  protocol: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  enabled: boolean;
}

export interface MockError {
  success: false;
  error: {
    message: string;
    code: string;
    timestamp: number;
  };
}

export interface MockFileChange {
  filePath: string;
  changeType: 'added' | 'modified' | 'deleted';
  linesAdded: number;
  linesDeleted: number;
}

// ========== 便捷导出 ==========

export const mockData = {
  thread: createMockThread,
  message: createMockMessage,
  userMessage: createMockUserMessage,
  assistantMessage: createMockAssistantMessage,
  toolCall: createMockToolCall,
  file: createMockFile,
  directoryTree: createMockDirectoryTree,
  agentTask: createMockAgentTask,
  settings: createMockSettings,
  provider: createMockProvider,
  conversation: createMockConversation,
  conversationWithTools: createMockConversationWithToolCalls,
  streamChunks: createMockStreamChunks,
  error: createMockErrorResponse,
  fileChange: createMockFileChange,
  batch: createMockBatchData
};
