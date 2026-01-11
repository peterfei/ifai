export interface ParsedError {
  type: 'rust' | 'node' | 'go' | 'unknown';
  code?: string;
  message: string;
  file: string;
  line: number;
  column?: number;
}

export interface FixPatch {
  description: string;
  original: string;
  modified: string;
}

export interface ITerminalParser {
  /**
   * 解析终端输出，提取错误信息
   */
  parse(output: string): ParsedError | null;

  /**
   * (可选) 基于错误生成修复建议 - 商业版才会有真实实现
   */
  generateFix?(error: ParsedError): Promise<FixPatch | null>;
}
