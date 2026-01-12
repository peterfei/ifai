/**
 * v0.3.0 Go to Definition 提供者
 *
 * 为 Monaco Editor 提供"转到定义"功能
 * 基于符号索引实现跨文件符号导航
 */

import * as monaco from 'monaco-editor';
import { symbolIndexer, SymbolInfo } from '../../core/indexer/SymbolIndexer';

export interface DefinitionProviderOptions {
  /** 当前文件路径（用于排除当前文件的符号） */
  currentFilePath?: string;

  /** 是否启用跨文件跳转 */
  enableCrossFile?: boolean;

  /** 跨文件跳转回调 */
  onCrossFileJump?: (definition: SymbolInfo) => void | Promise<void>;
}

/**
 * 获取光标位置的单词
 */
function getWordAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.Position
): string | null {
  const word = model.getWordAtPosition(position);
  return word?.word || null;
}

/**
 * 符号定义提供者
 */
export class DefinitionProvider implements monaco.languages.DefinitionProvider {
  private currentFilePath: string | undefined;
  private enableCrossFile: boolean;
  private onCrossFileJump?: (definition: SymbolInfo) => void | Promise<void>;

  constructor(options: DefinitionProviderOptions = {}) {
    this.currentFilePath = options.currentFilePath;
    this.enableCrossFile = options.enableCrossFile ?? true;
    this.onCrossFileJump = options.onCrossFileJump;
  }

  /**
   * 提供定义位置
   */
  async provideDefinition(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.Location | monaco.languages.Location[]> {
    // 1. 获取光标位置的单词
    const symbolName = getWordAtPosition(model, position);

    if (!symbolName) {
      console.log('[DefinitionProvider] No word at position');
      return null;
    }

    console.log(`[DefinitionProvider] Looking for definition: ${symbolName}`);

    // 2. 从符号索引器查找定义
    const definition = symbolIndexer.getSymbolDefinition(symbolName);

    if (!definition) {
      console.log(`[DefinitionProvider] No definition found for: ${symbolName}`);
      return null;
    }

    // 3. 检查是否跨文件
    const isCrossFile = definition.filePath !== this.currentFilePath;

    if (isCrossFile && !this.enableCrossFile) {
      console.log(`[DefinitionProvider] Cross-file navigation disabled for: ${symbolName}`);
      return null;
    }

    console.log(`[DefinitionProvider] Found definition:`, {
      symbol: symbolName,
      file: definition.filePath,
      line: definition.line,
      column: definition.column || 1,
    });

    // 4. 跨文件跳转
    if (isCrossFile) {
      // 调用回调处理跨文件跳转
      if (this.onCrossFileJump) {
        await this.onCrossFileJump(definition);
      }
      // 返回 null 表示已在回调中处理
      return null;
    }

    // 5. 同文件跳转 - 返回 location
    return {
      uri: model.uri.toString(),
      range: {
        startLineNumber: definition.line,
        startColumn: definition.column || 1,
        endLineNumber: definition.line,
        endColumn: definition.column ? definition.column + symbolName.length : 1000,
      },
    };
  }

  /**
   * 更新当前文件路径
   */
  setCurrentFilePath(filePath: string | undefined): void {
    this.currentFilePath = filePath;
  }

  /**
   * 设置是否启用跨文件跳转
   */
  setEnableCrossFile(enable: boolean): void {
    this.enableCrossFile = enable;
  }

  /**
   * 设置跨文件跳转回调
   */
  setOnCrossFileJump(callback: (definition: SymbolInfo) => void | Promise<void>): void {
    this.onCrossFileJump = callback;
  }
}

/**
 * 注册定义提供者
 *
 * @param languages 要注册的语言列表（默认支持所有主流语言）
 * @param options 提供者选项
 * @returns 清理函数
 */
export function registerDefinitionProvider(
  languages: string[] = [
    // JavaScript/TypeScript 生态
    'typescript',
    'javascript',
    'typescriptreact',
    'javascriptreact',
    'jsx',
    'tsx',
    // 系统编程语言
    'c',
    'cpp',
    'go',
    'rust',
    'java',
    'csharp',
    // 脚本语言
    'python',
    'php',
    'ruby',
    'perl',
    'lua',
    // 移动/现代语言
    'swift',
    'kotlin',
    'dart',
    'scala',
    // Web/前端
    'html',
    'css',
    'scss',
    'less',
    // 数据/配置
    'json',
    'yaml',
    'xml',
    'toml',
    // 标记语言
    'markdown',
    // 数据库
    'sql',
    'postgresql',
    'mysql',
    // Shell
    'shell',
    'bash',
    'powershell',
    // 其他
    'graphql',
    'dockerfile',
    'terraform',
  ],
  options?: DefinitionProviderOptions
): () => void {
  const providers: monaco.IDisposable[] = [];

  const provider = new DefinitionProvider(options);

  for (const language of languages) {
    const disposable = monaco.languages.registerDefinitionProvider(language, provider);
    providers.push(disposable);
    console.log(`[DefinitionProvider] Registered for language: ${language}`);
  }

  // 返回清理函数
  return () => {
    for (const disposable of providers) {
      disposable.dispose();
    }
    console.log('[DefinitionProvider] Disposed all providers');
  };
}

/**
 * v0.3.0: 设置定义提供者到 Monaco Editor
 *
 * 这个函数在 MonacoEditor 组件的 onMount 回调中调用
 *
 * @param monaco Monaco 实例
 * @param currentFilePath 当前文件路径
 * @param onCrossFileJump 跨文件跳转回调
 * @returns 清理函数
 */
export function setupDefinitionProvider(
  monaco: any,
  currentFilePath?: string,
  onCrossFileJump?: (definition: SymbolInfo) => void | Promise<void>
): () => void {
  console.log('[DefinitionProvider] Setting up definition provider...');

  const provider = new DefinitionProvider({
    currentFilePath,
    enableCrossFile: true,
    onCrossFileJump,
  });

  // 注册到所有支持的主流编程语言
  const languages = [
    // JavaScript/TypeScript 生态
    'typescript',
    'javascript',
    'typescriptreact',
    'javascriptreact',
    'jsx',
    'tsx',
    // 系统编程语言
    'c',
    'cpp',
    'go',
    'rust',
    'java',
    'csharp',
    // 脚本语言
    'python',
    'php',
    'ruby',
    'perl',
    'lua',
    // 移动/现代语言
    'swift',
    'kotlin',
    'dart',
    'scala',
    // Web/前端
    'html',
    'css',
    'scss',
    'less',
    // 数据/配置
    'json',
    'yaml',
    'xml',
    'toml',
    // 标记语言
    'markdown',
    // 数据库
    'sql',
    'postgresql',
    'mysql',
    // Shell
    'shell',
    'bash',
    'powershell',
    // 其他
    'graphql',
    'dockerfile',
    'terraform',
  ];

  const disposables = languages.map(lang =>
    monaco.languages.registerDefinitionProvider(lang, provider)
  );

  console.log(`[DefinitionProvider] Registered for ${languages.length} languages`);

  return () => {
    for (const d of disposables) {
      d.dispose();
    }
    console.log('[DefinitionProvider] Disposed');
  };
}
