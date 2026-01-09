/**
 * 编辑器命令行核心类型定义
 *
 * 此文件定义了社区版与商业私有库之间的契约。
 */

export type CommandOutputType = 'text' | 'html' | 'error' | 'toast';

/**
 * Store 操作回调接口
 */
export interface StoreCallbacks {
  file?: {
    saveCurrentFile?: () => Promise<{ success: boolean; path?: string; error?: string }>;
    openFile?: (path: string) => Promise<{ success: boolean; error?: string }>;
    saveAllFiles?: () => Promise<{ success: boolean; count: number; error?: string }>;
    updateFileContent?: (id: string, content: string) => Promise<void>;
    setFileDirty?: (id: string, isDirty: boolean) => void;
    getOpenedFiles?: () => Array<{ id: string; path: string; name: string; isDirty: boolean }>;
  };
  editor?: {
    getActiveEditor?: () => any | null; // Monaco editor instance
    formatDocument?: () => Promise<{ success: boolean; error?: string }>;
    executeAction?: (actionId: string) => Promise<{ success: boolean; error?: string }>;
  };
  layout?: {
    splitVertical?: () => Promise<{ success: boolean; error?: string }>;
    splitHorizontal?: () => Promise<{ success: boolean; error?: string }>;
  };
  settings?: {
    set?: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>;
    get?: (key: string) => Promise<unknown>;
  };
}

/**
 * 命令执行上下文
 */
export interface CommandContext {
  /** 当前活跃文件 ID */
  activeFileId?: string;
  /** 当前选中的文本范围 */
  selection?: { start: number; end: number };
  /** 工作区路径 */
  workspace?: string;
  /** 编辑器状态 */
  editorState?: {
    readonly: boolean;
    language: string;
  };
  /** Store 操作回调 */
  stores?: StoreCallbacks;
  /** 额外的上下文数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 命令执行结果
 */
export interface CommandResult {
  /** 是否执行成功 */
  success: boolean;
  /** 结果消息（支持 Markdown） */
  message: string;
  /** 附加数据 */
  data?: unknown;
  /** 输出类型 */
  outputType: CommandOutputType;
  /** 错误码（用于国际化） */
  errorCode?: string;
  /** 详细错误信息 */
  details?: unknown;
  /** 执行时间戳 */
  timestamp?: number;
}

/**
 * 命令建议项
 */
export interface CommandSuggestion {
  /** 建议文本 */
  text: string;
  /** 建议描述 */
  description?: string;
  /** 图标（支持 emoji 或图标名称） */
  icon?: string;
  /** 建议类型 */
  type?: 'command' | 'file' | 'symbol';
}

/**
 * 命令行配置选项
 */
export interface ICommandLineConfig {
  /** 最大历史记录数 */
  maxHistory?: number;
  /** 防抖延迟（毫秒） */
  debounceMs?: number;
  /** 是否启用遥测 */
  enableTelemetry?: boolean;
  /** 自定义命令前缀 */
  commandPrefix?: string;
}

/**
 * 诊断信息
 */
export interface ICommandDiagnostics {
  /** 核心类型 */
  type: 'mock' | 'pro';
  /** 版本号 */
  version: string;
  /** 加载耗时（毫秒） */
  loadTime: number;
  /** 是否已初始化 */
  initialized: boolean;
}

/**
 * 命令行执行引擎接口
 */
export interface ICommandLineCore {
  /**
   * 初始化引擎（如加载插件、索引）
   */
  initialize(): Promise<void>;

  /**
   * 执行用户输入的指令
   * @param input 原始输入字符串，如 ":w"
   * @param context 执行上下文
   */
  execute(input: string, context: CommandContext): Promise<CommandResult>;

  /**
   * 获取输入时的实时建议
   * @param query 查询字符串（不包含前缀）
   */
  getSuggestions(query: string): Promise<CommandSuggestion[]>;

  /**
   * 获取诊断信息
   */
  getDiagnostics?(): ICommandDiagnostics;

  /**
   * 资源释放
   */
  dispose(): void;
}
