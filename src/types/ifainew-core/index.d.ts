/**
 * ifainew-core 类型声明（CI 兼容）
 *
 * ifainew-core 是 Tauri Rust crate 生成的模块，类型在 Rust 编译时生成。
 * 此文件提供最小化的类型声明，确保 CI 中 tsc --noEmit 不报错。
 *
 * 本地开发时，Tauri 会生成真实的类型覆盖此声明。
 */

// === Types ===

export type ToolCategory = 'fs' | 'bash' | 'agent' | 'custom';

export interface ToolCall {
  id: string;
  tool: string;
  args: any;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed' | 'executing';
  result?: string;
  isPartial?: boolean;
}

export interface ImageUrl {
  url: string;
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: ImageUrl;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  multiModalContent?: ContentPart[];
  references?: string[];
  toolCalls?: ToolCall[];
  tool_call_id?: string;
  [key: string]: any;
}

export interface BackendMessage {
  role: string;
  content: any;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  addMessage: (message: Message) => void;
  updateMessageContent: (id: string, content: string, toolCalls?: ToolCall[]) => void;
  setLoading: (loading: boolean) => void;
  sendMessage: (content: string | ContentPart[], providerId: string, modelName: string) => Promise<void>;
  toggleAutocomplete: () => void;
  approveToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  rejectToolCall: (messageId: string, toolCallId: string) => Promise<void>;
  generateResponse: (history: BackendMessage[], providerConfig: AIProviderConfig, options?: { enableTools?: boolean }) => Promise<void>;
  rollbackToolCall?: (messageId: string, toolCallId: string, force?: boolean) => Promise<{
    success: boolean;
    conflict?: boolean;
    error?: string;
  }>;
  rollbackMessageToolCalls?: (messageId: string, force?: boolean) => Promise<{
    success: boolean;
    count?: number;
    hasConflict?: boolean;
    error?: string;
  }>;
  deleteMessage?: (messageId: string) => void;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  protocol: any;
  base_url: string;
  api_key: string;
  models: string[];
  enabled: boolean;
}

export interface ToolDefinition<TArgs = any, TResult = any> {
  name: string;
  category: ToolCategory;
  description: string;
  schema: Record<string, unknown>;
  requiresApproval: boolean;
  isDangerous?: boolean;
  handler: ToolHandler<TArgs, TResult>;
}

export type ToolHandler<TArgs = any, TResult = any> = (
  args: TArgs,
  context: ToolContext
) => Promise<ToolResult<TResult>>;

export interface ToolContext {
  messageId: string;
  threadId: string;
  projectRoot: string;
  agentId?: string;
}

export interface ToolResult<T = any> {
  success: boolean;
  output?: string;
  data?: T;
  error?: string;
}

export interface IToolRegistry {
  register<TArgs = any, TResult = any>(definition: ToolDefinition<TArgs, TResult>): void;
  has(name: string): boolean;
  get(name: string): ToolDefinition | undefined;
  list(category?: ToolCategory): ToolDefinition[];
  execute<TArgs = any, TResult = any>(name: string, args: TArgs, context: ToolContext): Promise<ToolResult<TResult>>;
}

export interface IAgentEventListener {
  init: (agentId: string) => Promise<(() => void)>;
  register: (agentId: string, unlisten: () => void) => void;
  cleanup: (agentId: string) => void;
  cleanupAll: () => void;
}

export interface IToolCallDeduplicator {
  addDuplicate(skippedId: string, canonicalId: string): void;
  getCanonicalId(id: string): string | undefined;
  clearAll(): void;
}

// === Zustand Store API ===

export interface StoreApi<T> {
  (): T;
  getState: () => T;
  setState: (partial: Partial<T> | ((state: T) => Partial<T>)) => void;
  subscribe: (listener: (state: T, prevState: T) => void) => () => void;
  getInitialState: () => T;
}

// === Parse types ===

export interface ParsedToolCall {
  id: string;
  tool: string;
  args: Record<string, any>;
  rawJson: string;
  startIndex: number;
  endIndex: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed' | 'executing';
  isPartial?: boolean;
}

export interface ContentSegment {
  type: 'text' | 'tool';
  content?: string;
  toolCall?: ParsedToolCall;
}

export interface ParseResult {
  toolCalls: ParsedToolCall[];
  cleanContent: string;
  segments: ContentSegment[];
}

// === Functions ===

export function parseToolCalls(content: string): ParseResult;

export function getToolLabel(toolName: string): string;

export function getToolColor(toolName: string): string;

export function parsePartialJson(content: string): any;

export const useChatStore: StoreApi<ChatState>;

export function registerStores(stores: any): void;

export function createAgentListeners(): IAgentEventListener;

export function createToolCallDeduplicator(): IToolCallDeduplicator;

// === Classes ===

export class ToolRegistry implements IToolRegistry {
  register<TArgs = any, TResult = any>(definition: ToolDefinition<TArgs, TResult>): void;
  has(name: string): boolean;
  get(name: string): ToolDefinition | undefined;
  list(category?: ToolCategory): ToolDefinition[];
  execute<TArgs = any, TResult = any>(name: string, args: TArgs, context: ToolContext): Promise<ToolResult<TResult>>;
}

// === Inline Editor (v0.2.9) ===

export interface IInlineEditor {
  dispose(): void;
}

export interface InlineEditorRequest {
  requestId: string;
  messageId: string;
  content: string;
  filePath?: string;
  language?: string;
}

export interface InlineEditorResponse {
  requestId: string;
  success: boolean;
  result?: string;
  error?: string;
}

export interface InlineEditorOptions {
  theme?: string;
  fontSize?: number;
}

export class InlineEditorService implements IInlineEditor {
  constructor(options?: InlineEditorOptions);
  dispose(): void;
}

export function getInlineEditorService(): InlineEditorService;

export class MockInlineEditor implements IInlineEditor {
  constructor(options?: InlineEditorOptions);
  dispose(): void;
}

export function getMockInlineEditor(): MockInlineEditor;

export function createToolRegistry(): ToolRegistry;
