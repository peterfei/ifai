/**
 * v0.3.0 Find References 提供者
 *
 * 为 Monaco Editor 提供"查找所有引用"功能
 * 基于符号索引实现跨文件引用查找
 */

import * as monaco from 'monaco-editor';
import { symbolIndexer, SymbolReference } from '../../core/indexer/SymbolIndexer';

export interface ReferencesProviderOptions {
  /** 当前文件路径 */
  currentFilePath?: string;

  /** 是否启用跨文件引用查找 */
  enableCrossFile?: boolean;
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
 * 引用提供者
 */
export class ReferencesProvider implements monaco.languages.ReferenceProvider {
  private currentFilePath: string | undefined;
  private enableCrossFile: boolean;

  constructor(options: ReferencesProviderOptions = {}) {
    this.currentFilePath = options.currentFilePath;
    this.enableCrossFile = options.enableCrossFile ?? true;
  }

  /**
   * 提供引用位置
   */
  async provideReferences(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.ReferenceContext,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.Location[]> {
    // 1. 获取光标位置的单词
    const symbolName = getWordAtPosition(model, position);

    if (!symbolName) {
      console.log('[ReferencesProvider] No word at position');
      return [];
    }

    console.log(`[ReferencesProvider] Looking for references: ${symbolName}`);

    // 2. 从符号索引器查找引用
    const references = symbolIndexer.findReferences(symbolName);

    if (!references || references.length === 0) {
      console.log(`[ReferencesProvider] No references found for: ${symbolName}`);
      return [];
    }

    console.log(`[ReferencesProvider] Found ${references.length} references for: ${symbolName}`);

    // 3. 转换为 Monaco Location 格式
    const locations: monaco.languages.Location[] = [];

    for (const ref of references) {
      // 如果禁用跨文件查找，跳过其他文件
      if (!this.enableCrossFile && ref.filePath !== this.currentFilePath) {
        continue;
      }

      // 创建 URI（Monaco 使用 file:// 协议）
      const uri = monaco.Uri.file(ref.filePath);

      locations.push({
        uri,
        range: {
          startLineNumber: ref.line,
          startColumn: ref.column,
          endLineNumber: ref.line,
          endColumn: ref.column + symbolName.length,
        },
      });
    }

    return locations;
  }

  /**
   * 更新当前文件路径
   */
  setCurrentFilePath(filePath: string | undefined): void {
    this.currentFilePath = filePath;
  }

  /**
   * 设置是否启用跨文件引用查找
   */
  setEnableCrossFile(enable: boolean): void {
    this.enableCrossFile = enable;
  }
}

/**
 * 注册引用提供者
 *
 * @param languages 要注册的语言列表
 * @param options 提供者选项
 * @returns 清理函数
 */
export function registerReferencesProvider(
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
  options?: ReferencesProviderOptions
): () => void {
  const providers: monaco.IDisposable[] = [];

  const provider = new ReferencesProvider(options);

  for (const language of languages) {
    const disposable = monaco.languages.registerReferenceProvider(language, provider);
    providers.push(disposable);
    console.log(`[ReferencesProvider] Registered for language: ${language}`);
  }

  // 返回清理函数
  return () => {
    for (const disposable of providers) {
      disposable.dispose();
    }
    console.log('[ReferencesProvider] Disposed all providers');
  };
}

/**
 * v0.3.0: 设置引用提供者到 Monaco Editor
 *
 * 这个函数在 MonacoEditor 组件的 onMount 回调中调用
 *
 * @param monaco Monaco 实例
 * @param currentFilePath 当前文件路径
 * @returns 清理函数
 */
export function setupReferencesProvider(
  monaco: any,
  currentFilePath?: string
): () => void {
  console.log('[ReferencesProvider] Setting up references provider...');

  const provider = new ReferencesProvider({
    currentFilePath,
    enableCrossFile: true,
  });

  // 注册到所有支持的语言
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
    monaco.languages.registerReferenceProvider(lang, provider)
  );

  console.log(`[ReferencesProvider] Registered for ${languages.length} languages`);

  return () => {
    for (const d of disposables) {
      d.dispose();
    }
    console.log('[ReferencesProvider] Disposed');
  };
}
