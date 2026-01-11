export type SymbolKind = 'var' | 'func' | 'class' | 'interface';
export type SymbolScope = 'local' | 'global' | 'module';

export interface CompletionSymbol {
  name: string;
  kind: SymbolKind;
  scope: SymbolScope;
  documentation?: string;
  score: number; // 排序权重
}

export interface IScopeInfo {
  type: string;
  startLine: number;
  endLine: number;
}

export interface ISymbolCompletion {
  /**
   * 分析给定位置的作用域
   */
  analyzeScope(code: string, line: number): IScopeInfo;

  /**
   * 获取补全建议并计算权重
   */
  calculateRelevance(symbol: CompletionSymbol, scope: IScopeInfo): number;
}
