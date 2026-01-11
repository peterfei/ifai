import { ISymbolCompletion, CompletionSymbol, IScopeInfo, SymbolScope } from '../../interfaces/v0.2.9/ISymbolCompletion';

export class MockSymbolCompletion implements ISymbolCompletion {
  analyzeScope(code: string, line: number): IScopeInfo {
    // Mock: 总是返回一个假定的函数作用域
    return {
      type: 'function',
      startLine: line > 1 ? line - 1 : 0,
      endLine: line + 5
    };
  }

  calculateRelevance(symbol: CompletionSymbol, scope: IScopeInfo): number {
    // Mock 算法：Local > Global
    if (symbol.scope === 'local') return 100;
    if (symbol.scope === 'module') return 50;
    return 10;
  }
}
