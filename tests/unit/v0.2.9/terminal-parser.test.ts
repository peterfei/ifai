import { describe, it, expect } from 'vitest';
import { MockTerminalParser } from '../../../src/core/mock-core/v0.2.9/MockTerminalParser';

describe('Smart Terminal Loop: Error Parser (Mock Implementation)', () => {
  const parser = new MockTerminalParser();

  it('TRM-UNIT-01: 应该能解析标准的 Rust 编译器错误', () => {
    const input = `
error[E0425]: cannot find value \`unknown_var\` in this scope
  --> src/main.rs:10:5
   |
10 |     unknown_var
   |     ^^^^^^^^^^^ not found in this scope
`;
    const result = parser.parse(input);
    
    expect(result).not.toBeNull();
    expect(result).toEqual({
      type: 'rust',
      code: 'E0425',
      message: 'cannot find value \`unknown_var\` in this scope',
      file: 'src/main.rs',
      line: 10,
      column: 5
    });
  });

  it('TRM-UNIT-02: 应该能处理 Node.js 堆栈跟踪 (待实现)', () => {
    // Mock 实现暂不支持 Node.js 解析，验证其返回 null 或待定行为
    const input = `
ReferenceError: x is not defined
    at Object.<anonymous> (/Users/user/project/app.js:5:1)
`;
    const result = parser.parse(input);
    // 在当前 Mock 实现中，我们期望它尚不能解析非 Rust 错误
    expect(result).toBeNull(); 
  });
});
