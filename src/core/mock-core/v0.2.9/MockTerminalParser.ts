import { ITerminalParser, ParsedError, FixPatch } from '../../interfaces/v0.2.9/ITerminalParser';

export class MockTerminalParser implements ITerminalParser {
  parse(output: string): ParsedError | null {
    // 简单的 Mock 实现：仅检测特定的测试字符串
    // 实际商业版会包含复杂的正则状态机
    const rustMatch = output.match(/error\[(?<code>E\d+)\]:\s+(?<msg>.+)\n\s+-->\s+(?<file>.+):(?<line>\d+):(?<col>\d+)/);
    
    if (rustMatch && rustMatch.groups) {
      return {
        type: 'rust',
        code: rustMatch.groups.code,
        message: rustMatch.groups.msg,
        file: rustMatch.groups.file,
        line: parseInt(rustMatch.groups.line, 10),
        column: parseInt(rustMatch.groups.col, 10)
      };
    }
    return null;
  }

  async generateFix(error: ParsedError): Promise<FixPatch | null> {
    return {
      description: 'Mock fix for ' + error.code,
      original: 'old_code',
      modified: 'new_code'
    };
  }
}
