/**
 * v0.2.9 符号补全提供者
 *
 * 为 Monaco Editor 提供基于符号索引的代码补全
 */

import * as monaco from 'monaco-editor';
import { symbolIndexer, SymbolInfo } from '../../core/indexer/SymbolIndexer';

export interface CompletionProviderOptions {
  /** 当前文件路径（用于排除当前文件的符号） */
  currentFilePath?: string;

  /** 是否显示来源文件 */
  showSource?: boolean;
}

/**
 * Monaco 符号补全提供者
 */
export class SymbolCompletionProvider implements monaco.languages.CompletionItemProvider {
  private currentFilePath: string | undefined;
  private showSource: boolean;

  constructor(options: CompletionProviderOptions = {}) {
    this.currentFilePath = options.currentFilePath;
    this.showSource = options.showSource ?? true;
  }

  /**
   * 触发字符
   */
  triggerCharacters = ['.', ':', '(', '[', '"', "'", ' ', '@'];

  /**
   * 提供补全建议
   */
  provideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext,
    token: monaco.CancellationToken
  ): monaco.languages.ProviderResult<monaco.languages.CompletionList> {
    const wordUntil = model.getWordUntilPosition(position);
    const prefix = wordUntil.word;

    // 如果前缀为空或太短，不触发补全
    if (!prefix || prefix.length < 1) {
      return { suggestions: [] };
    }

    // 从符号索引器搜索匹配的符号
    const symbols = symbolIndexer.search(prefix, {
      maxResults: 50,
      excludeCurrentFile: this.currentFilePath,
    });

    // 转换为 Monaco 补全建议
    const suggestions = symbols.map((symbol) =>
      this.symbolToSuggestion(symbol, prefix)
    );

    console.log(
      `[SymbolCompletionProvider] Found ${suggestions.length} suggestions for prefix "${prefix}"`
    );

    return {
      suggestions,
    };
  }

  /**
   * 将符号信息转换为 Monaco 补全建议
   */
  private symbolToSuggestion(
    symbol: SymbolInfo,
    prefix: string
  ): monaco.languages.CompletionItem {
    const kind = this.mapSymbolKind(symbol.kind);
    const fileName = this.getFileName(symbol.filePath);

    // 构建详情（包含来源文件）
    let detail = symbol.detail || '';
    if (this.showSource) {
      detail = detail ? `${detail} (${fileName})` : fileName;
    }

    return {
      label: symbol.name,
      kind: kind,
      detail: detail,
      documentation: symbol.documentation || {
        value: `Defined in \`${fileName}\` at line ${symbol.line}`,
        isTrusted: true,
      },
      insertText: symbol.name,
      sortText: this.getSortText(symbol, prefix),
      // 添加额外的元数据
      range: undefined, // Monaco 会自动处理替换范围
      command: symbol.documentation
        ? {
            id: 'editor.action.showHover',
            title: 'Show documentation',
          }
        : undefined,
    };
  }

  /**
   * 映射符号类型到 Monaco 类型
   */
  private mapSymbolKind(kind: SymbolInfo['kind']): monaco.languages.CompletionItemKind {
    const mapping: Record<SymbolInfo['kind'], monaco.languages.CompletionItemKind> = {
      function: monaco.languages.CompletionItemKind.Function,
      method: monaco.languages.CompletionItemKind.Method,
      class: monaco.languages.CompletionItemKind.Class,
      interface: monaco.languages.CompletionItemKind.Interface,
      variable: monaco.languages.CompletionItemKind.Variable,
      constant: monaco.languages.CompletionItemKind.Constant,
      type: monaco.languages.CompletionItemKind.TypeParameter,
    };

    return mapping[kind] || monaco.languages.CompletionItemKind.Value;
  }

  /**
   * 获取文件名（不含路径）
   */
  private getFileName(filePath: string): string {
    const parts = filePath.split('/');
    return parts[parts.length - 1] || filePath;
  }

  /**
   * 获取排序文本
   * 最近访问的文件中的符号优先
   */
  private getSortText(symbol: SymbolInfo, prefix: string): string {
    // 检查符号是否完全匹配前缀
    const exactMatch = symbol.name === prefix;

    // 检查符号是否以小写开头（通常是局部变量/函数）
    const startsWithLower = symbol.name[0] === symbol.name[0].toLowerCase();

    // 基础分数
    let score = 0;

    // 完全匹配优先
    if (exactMatch) {
      score += 1000;
    }

    // 驼峰命名优先
    if (startsWithLower) {
      score += 100;
    }

    // 函数/方法优先
    if (symbol.kind === 'function' || symbol.kind === 'method') {
      score += 50;
    }

    // 使用分数构建排序文本（分数越高，排序文本越小）
    return String(999999 - score).padStart(6, '0');
  }

  /**
   * 更新当前文件路径
   */
  setCurrentFilePath(filePath: string | undefined): void {
    this.currentFilePath = filePath;
  }

  /**
   * 解析提供者
   */
  dispose(): void {
    // 没有需要清理的资源
  }
}

/**
 * 注册符号补全提供者
 *
 * @param languages 要注册的语言列表（默认为 ['typescript', 'javascript', 'typescriptreact', 'javascriptreact']）
 * @param options 提供者选项
 * @returns 清理函数
 */
export function registerSymbolCompletionProvider(
  languages: string[] = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact', 'python', 'rust'],
  options?: CompletionProviderOptions
): () => void {
  const providers: monaco.IDisposable[] = [];

  const provider = new SymbolCompletionProvider(options);

  for (const language of languages) {
    const disposable = monaco.languages.registerCompletionItemProvider(language, provider);
    providers.push(disposable);
    console.log(`[SymbolCompletionProvider] Registered for language: ${language}`);
  }

  // 返回清理函数
  return () => {
    for (const disposable of providers) {
      disposable.dispose();
    }
    console.log('[SymbolCompletionProvider] Disposed all providers');
  };
}

/**
 * v0.2.9: 注册符号补全提供者到 Monaco Editor
 *
 * 这个函数在 MonacoEditor 组件的 onMount 回调中调用
 */
export function setupSymbolCompletion(
  monaco: any,
  currentFilePath?: string
): () => void {
  console.log('[SymbolCompletionProvider] Setting up symbol completion...');

  const provider = new SymbolCompletionProvider({
    currentFilePath,
    showSource: true,
  });

  // 注册到所有语言
  const languages = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact', 'python', 'rust'];
  const disposables = languages.map(lang =>
    monaco.languages.registerCompletionItemProvider(lang, provider)
  );

  return () => {
    for (const d of disposables) {
      d.dispose();
    }
    console.log('[SymbolCompletionProvider] Disposed');
  };
}
