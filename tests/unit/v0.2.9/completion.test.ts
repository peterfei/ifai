import { describe, it, expect } from 'vitest';
import { MockSymbolCompletion } from '../../../src/core/mock-core/v0.2.9/MockSymbolCompletion';
import { CompletionSymbol } from '../../../src/core/interfaces/v0.2.9/ISymbolCompletion';

describe('Symbol Completion Logic (Mock Implementation)', () => {
  const completion = new MockSymbolCompletion();

  it('EDT-UNIT-01: 应该能根据光标位置识别当前作用域', () => {
    const code = `
    function calculate() {
      const x = 1;
      // Cursor Here
    }
    `;
    const cursorLine = 3;
    
    // 调用 Mock 的 Scope 分析器
    const scope = completion.analyzeScope(code, cursorLine);

    expect(scope).toEqual(expect.objectContaining({ type: 'function' }));
  });

  it('EDT-UNIT-02: 应该优先推荐本地作用域内的符号', () => {
    const localVar: CompletionSymbol = { name: 'localVal', kind: 'var', scope: 'local', score: 0 };
    const globalVar: CompletionSymbol = { name: 'globalVal', kind: 'var', scope: 'global', score: 0 };

    // 随便获取一个 Scope 用于测试
    const scope = completion.analyzeScope('', 0);

    const scoreLocal = completion.calculateRelevance(localVar, scope);
    const scoreGlobal = completion.calculateRelevance(globalVar, scope);

    expect(scoreLocal).toBeGreaterThan(scoreGlobal);
  });
});
