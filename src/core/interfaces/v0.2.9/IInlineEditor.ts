/**
 * v0.2.9 行内编辑接口
 *
 * 提供基于 AI 的代码编辑建议功能
 */

/**
 * 行内编辑请求
 */
export interface InlineEditorRequest {
  /** 用户的编辑指令（例如："添加错误处理"） */
  instruction: string;

  /** 原始代码 */
  code: string;

  /** 代码语言（例如："typescript", "python"） */
  language: string;

  /** 文件路径（用于上下文） */
  filePath?: string;

  /** 用户选中的代码片段 */
  selectedCode?: string;

  /** 光标位置信息 */
  cursorPosition?: {
    line: number;
    column: number;
  };
}

/**
 * 行内编辑响应
 */
export interface InlineEditorResponse {
  /** 原始代码 */
  originalCode: string;

  /** 修改后的代码 */
  modifiedCode: string;

  /** 编辑指令 */
  instruction: string;

  /** 是否成功 */
  success: boolean;

  /** 错误信息 */
  error?: string;

  /** 编辑摘要 */
  summary?: string;

  /** 应用的更改说明 */
  changes?: string[];
}

/**
 * 行内编辑选项
 */
export interface InlineEditorOptions {
  /** 是否使用流式响应 */
  stream?: boolean;

  /** 进度回调 (chunk: string) => void */
  onProgress?: (chunk: string) => void;

  /** 完成回调 */
  onComplete?: (response: InlineEditorResponse) => void;

  /** 错误回调 */
  onError?: (error: Error) => void;
}

/**
 * v0.2.9 行内编辑服务接口
 *
 * 提供基于 AI 的代码编辑建议功能
 */
export interface IInlineEditor {
  /**
   * 应用代码编辑
   *
   * @param request 编辑请求
   * @param options 编辑选项
   * @returns 编辑响应
   */
  applyEdit(
    request: InlineEditorRequest,
    options?: InlineEditorOptions
  ): Promise<InlineEditorResponse>;

  /**
   * 流式应用代码编辑
   *
   * @param request 编辑请求
   * @param onProgress 进度回调
   * @returns 编辑响应
   */
  applyEditStream(
    request: InlineEditorRequest,
    onProgress: (chunk: string) => void
  ): Promise<InlineEditorResponse>;

  /**
   * 检查服务是否可用
   */
  isAvailable(): Promise<boolean>;

  /**
   * 获取服务提供商信息
   */
  getProviderInfo(): {
    name: string;
    version: string;
    features: string[];
  };
}
