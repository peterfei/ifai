/**
 * Section 5: 对话管理系统 - TypeScript 类型定义
 *
 * 对话总结和会话笔记的前端类型定义
 */

// ==================== 原有类型（保留兼容性） ====================

export interface ConversationSummary {
  primaryRequest: string;
  keyTechnicalConcepts: string[];
  fileChanges: Array<{
    filePath: string;
    summary: string;
    codeSnippet?: string;
  }>;
  errorsAndFixes: Array<{
    error: string;
    fix: string;
  }>;
  problemSolving: string;
  userMessages: string[];
  pendingTasks: string[];
  currentWork: string;
  nextStep: string;
}

export interface SessionNotes {
  technicalConcepts: string[];
  fileChanges: Array<{
    file: string;
    action: 'created' | 'modified' | 'deleted';
    timestamp: string;
    summary?: string;
  }>;
  errors: Array<{
    message: string;
    fix?: string;
    timestamp: string;
  }>;
  pendingTasks: Array<{
    task: string;
    status: 'pending' | 'completed';
  }>;
}

// ==================== 新增类型（与后端对齐） ====================

/**
 * Token 统计信息
 */
export interface TokenStats {
  total_tokens: number;
  message_count: number;
  estimated_cost_usd?: number;
}

/**
 * 归档信息
 */
export interface ArchiveInfo {
  id: string;
  timestamp: number;
  message_count: number;
  token_count: number;
  summary_preview: string;
}

/**
 * 技术概念条目（后端对齐版本）
 */
export interface TechConcept {
  name: string;
  description: string;
  category: string; // "concept", "pattern", "algorithm", etc.
  mentions: number; // 提及次数
}

/**
 * 文件变更记录（后端对齐版本）
 */
export interface FileChange {
  path: string;
  action: string; // "created", "modified", "deleted"
  reason: string;
  timestamp: number;
}

/**
 * 错误和修复记录（后端对齐版本）
 */
export interface ErrorFix {
  error_message: string;
  error_type: string;
  solution: string;
  file_path?: string;
  timestamp: number;
}

/**
 * 待办任务（后端对齐版本）
 */
export interface TodoTask {
  id: string;
  description: string;
  status: string; // "pending", "in_progress", "completed"
  priority: string; // "low", "medium", "high"
  created_at: number;
}

/**
 * 会话笔记（后端对齐版本）
 */
export interface SessionNotesData {
  session_id: string;
  project_root: string;
  started_at: number;
  updated_at: number;
  tech_concepts: TechConcept[];
  file_changes: FileChange[];
  error_fixes: ErrorFix[];
  todo_tasks: TodoTask[];
  summary: string;
}

/**
 * 对话总结配置
 */
export interface SummaryConfig {
  token_threshold?: number; // 默认 150k
  message_threshold?: number; // 默认 100
  keep_last_n?: number; // 压缩时保留的消息数，默认 10
}

/**
 * 对话压缩结果
 */
export interface CompactResult {
  original_count: number;
  compressed_count: number;
  summary: string;
  messages: Message[];
}

/**
 * 消息类型（简化版，与主类型兼容）
 */
export interface Message {
  role: string;
  content: string | ContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * 内容部分
 */
export interface ContentPart {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  // 其他字段根据需要添加
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * AI 提供商配置
 */
export interface AIProviderConfig {
  provider: string;
  models: string[];
  api_key?: string;
  base_url?: string;
}
