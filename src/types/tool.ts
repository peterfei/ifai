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

// ============================================================================
// P3: 工具系统 UI 类型定义
// ============================================================================

/**
 * 工具描述响应（从后端获取）
 */
export interface ToolDescriptionResponse {
  /** 工具名称 */
  name: string;

  /** 工具描述 */
  description: string;

  /** 输入参数 JSON Schema */
  input_schema: any;

  /** 所需权限级别 */
  required_permission: string;

  /** 工具分类 */
  category: string;

  /** 是否为危险操作 */
  is_dangerous: boolean;

  /** 示例用法 */
  examples: string[];

  /** 参数说明 */
  parameter_descriptions: Record<string, string>;
}

/**
 * 工具列表响应
 */
export interface ToolListResponse {
  /** 所有工具 */
  tools: ToolDescriptionResponse[];

  /** 按分类组织的工具 */
  by_category: Record<string, ToolDescriptionResponse[]>;

  /** 按权限组织的工具 */
  by_permission: Record<string, ToolDescriptionResponse[]>;

  /** 统计信息 */
  stats: ToolStatsResponse;
}

/**
 * 工具统计信息
 */
export interface ToolStatsResponse {
  /** 总工具数 */
  total_count: number;

  /** 各分类数量 */
  category_counts: Record<string, number>;

  /** 各权限级别数量 */
  permission_counts: Record<string, number>;
}

/**
 * 工具分类
 */
export enum ToolCategory {
  File = 'File',
  Search = 'Search',
  Command = 'Command',
  Network = 'Network',
  System = 'System',
  Other = 'Other',
}

/**
 * 权限级别
 */
export enum ToolPermission {
  ReadOnly = 'ReadOnly',
  WorkspaceWrite = 'WorkspaceWrite',
  Prompt = 'Prompt',
  DangerFullAccess = 'DangerFullAccess',
  Allow = 'Allow',
}

/**
 * 工具过滤器
 */
export interface ToolFilter {
  /** 搜索关键词 */
  searchQuery: string;

  /** 选中的分类 */
  categories: ToolCategory[];

  /** 选中的权限级别 */
  permissions: ToolPermission[];
}
