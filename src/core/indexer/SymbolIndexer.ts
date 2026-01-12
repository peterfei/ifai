/**
 * v0.2.9 符号索引系统
 *
 * 负责扫描文件、提取符号、建立索引
 * 用于代码补全和符号导航
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface SymbolInfo {
  /** 符号名称 */
  name: string;

  /** 符号类型 */
  kind: 'function' | 'class' | 'interface' | 'variable' | 'constant' | 'type' | 'method';

  /** 定义所在的文件路径 */
  filePath: string;

  /** 定义所在的行号（1-based） */
  line: number;

  /** 可选：定义所在的列号 */
  column?: number;

  /** 可选：父级符号（如类的方法） */
  parent?: string;

  /** 可选：文档说明 */
  documentation?: string;

  /** 可选：函数签名或类型定义 */
  detail?: string;

  /** 最后访问时间（用于 LRU 排序） */
  lastAccessed?: number;
}

/**
 * 符号引用信息
 */
export interface SymbolReference {
  /** 引用所在的文件路径 */
  filePath: string;

  /** 引用所在的行号（1-based） */
  line: number;

  /** 引用所在的列号（1-based） */
  column: number;

  /** 引用的代码上下文 */
  context: string;

  /** 引用的符号名称 */
  symbolName: string;

  /** 是否是定义位置 */
  isDefinition?: boolean;
}

export interface FileIndex {
  /** 文件路径 */
  filePath: string;

  /** 文件中的所有符号 */
  symbols: SymbolInfo[];

  /** 索引时间 */
  indexedAt: number;
}

export interface IndexerConfig {
  /** 最大索引文件数 */
  maxFiles?: number;

  /** 是否启用增量索引 */
  incrementalIndexing?: boolean;
}

// ============================================================================
// SymbolIndexer 实现
// ============================================================================

export class SymbolIndexer {
  private fileIndex: Map<string, FileIndex> = new Map();
  private symbolIndex: Map<string, SymbolInfo[]> = new Map(); // symbol name -> symbols
  private recentFiles: string[] = []; // LRU cache for recently accessed files
  private fileContentCache: Map<string, string> = new Map(); // v0.3.0: 文件内容缓存
  private config: IndexerConfig;

  constructor(config: IndexerConfig = {}) {
    this.config = {
      maxFiles: 1000,
      incrementalIndexing: true,
      ...config,
    };
  }

  /**
   * 索引单个文件
   */
  async indexFile(filePath: string, content: string): Promise<SymbolInfo[]> {
    const symbols = this.extractSymbols(content, filePath);

    console.log(`[SymbolIndexer] Extracted ${symbols.length} symbols from ${filePath}:`, symbols.map(s => s.name));

    // 更新文件索引
    const fileIndex: FileIndex = {
      filePath,
      symbols,
      indexedAt: Date.now(),
    };
    this.fileIndex.set(filePath, fileIndex);

    // v0.3.0: 缓存文件内容（用于 findReferences）
    this.fileContentCache.set(filePath, content);

    // 更新符号索引
    for (const symbol of symbols) {
      const existing = this.symbolIndex.get(symbol.name) || [];
      existing.push(symbol);
      this.symbolIndex.set(symbol.name, existing);
    }

    // 更新 LRU
    this.updateRecentFiles(filePath);

    console.log(`[SymbolIndexer] Indexed ${filePath}: ${symbols.length} symbols`);
    return symbols;
  }

  /**
   * 从代码内容中提取符号
   */
  private extractSymbols(content: string, filePath: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const lines = content.split('\n');

    // 获取文件扩展名以确定语言
    const ext = this.getFileExtension(filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // 跳过注释和空行
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || trimmedLine === '') {
        continue;
      }

      // TypeScript/JavaScript 符号提取
      if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
        symbols.push(...this.extractTypeScriptSymbols(trimmedLine, filePath, lineNumber));
      }
      // Python 符号提取
      else if (ext === 'py') {
        symbols.push(...this.extractPythonSymbols(trimmedLine, filePath, lineNumber));
      }
      // Rust 符号提取
      else if (ext === 'rs') {
        symbols.push(...this.extractRustSymbols(trimmedLine, filePath, lineNumber));
      }
    }

    return symbols;
  }

  /**
   * 提取 TypeScript/JavaScript 符号
   */
  private extractTypeScriptSymbols(line: string, filePath: string, lineNumber: number): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    // import { symbols } from 'module' - v0.2.9: 索引入口的符号
    const importMatch = line.match(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"]/);
    if (importMatch) {
      const importedSymbols = importMatch[1].split(',').map(s => s.trim().split(' as ')[0].trim());
      const module = importMatch[2];
      for (const symbolName of importedSymbols) {
        if (symbolName) {
          symbols.push({
            name: symbolName,
            kind: 'function',
            filePath,
            line: lineNumber,
            detail: `imported from ${module}`,
          });
        }
      }
    }

    // function name() {}
    const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      symbols.push({
        name: funcMatch[1],
        kind: 'function',
        filePath,
        line: lineNumber,
        detail: this.extractFunctionSignature(line),
      });
    }

    // const name = () => {}
    const arrowFuncMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/);
    if (arrowFuncMatch) {
      symbols.push({
        name: arrowFuncMatch[1],
        kind: 'function',
        filePath,
        line: lineNumber,
        detail: '() => void',
      });
    }

    // class Name {}
    const classMatch = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        kind: 'class',
        filePath,
        line: lineNumber,
      });
    }

    // interface Name {}
    const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
    if (interfaceMatch) {
      symbols.push({
        name: interfaceMatch[1],
        kind: 'interface',
        filePath,
        line: lineNumber,
      });
    }

    // type Name = ...
    const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)/);
    if (typeMatch) {
      symbols.push({
        name: typeMatch[1],
        kind: 'type',
        filePath,
        line: lineNumber,
      });
    }

    // export const Name = value OR const Name = value (v0.2.9: also index non-exported consts)
    const constMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/);
    if (constMatch) {
      symbols.push({
        name: constMatch[1],
        kind: 'constant',
        filePath,
        line: lineNumber,
      });
    }

    // 方法定义（在类内部）
    const methodMatch = line.match(/(\w+)\s*\([^)]*\)\s*[:{]/);
    if (methodMatch && !line.includes('function') && !line.includes('=>')) {
      symbols.push({
        name: methodMatch[1],
        kind: 'method',
        filePath,
        line: lineNumber,
      });
    }

    return symbols;
  }

  /**
   * 提取 Python 符号
   */
  private extractPythonSymbols(line: string, filePath: string, lineNumber: number): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    // def function_name():
    const funcMatch = line.match(/(?:async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) {
      symbols.push({
        name: funcMatch[1],
        kind: 'function',
        filePath,
        line: lineNumber,
      });
    }

    // class ClassName:
    const classMatch = line.match(/class\s+(\w+)/);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        kind: 'class',
        filePath,
        line: lineNumber,
      });
    }

    // CONSTANT_NAME = value
    const constMatch = line.match(/([A-Z_][A-Z0-9_]*)\s*=/);
    if (constMatch) {
      symbols.push({
        name: constMatch[1],
        kind: 'constant',
        filePath,
        line: lineNumber,
      });
    }

    return symbols;
  }

  /**
   * 提取 Rust 符号
   */
  private extractRustSymbols(line: string, filePath: string, lineNumber: number): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    // fn function_name()
    const funcMatch = line.match(/(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
    if (funcMatch) {
      symbols.push({
        name: funcMatch[1],
        kind: 'function',
        filePath,
        line: lineNumber,
      });
    }

    // struct Name {}
    const structMatch = line.match(/(?:pub\s+)?struct\s+(\w+)/);
    if (structMatch) {
      symbols.push({
        name: structMatch[1],
        kind: 'class',
        filePath,
        line: lineNumber,
      });
    }

    // enum Name {}
    const enumMatch = line.match(/(?:pub\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      symbols.push({
        name: enumMatch[1],
        kind: 'type',
        filePath,
        line: lineNumber,
      });
    }

    // trait Name {}
    const traitMatch = line.match(/(?:pub\s+)?trait\s+(\w+)/);
    if (traitMatch) {
      symbols.push({
        name: traitMatch[1],
        kind: 'interface',
        filePath,
        line: lineNumber,
      });
    }

    // impl Type {}
    const implMatch = line.match(/impl\s+(\w+)/);
    if (implMatch) {
      symbols.push({
        name: implMatch[1],
        kind: 'class',
        filePath,
        line: lineNumber,
      });
    }

    // const NAME: Type = value
    const constMatch = line.match(/(?:pub\s+)?const\s+(\w+)\s*:/);
    if (constMatch) {
      symbols.push({
        name: constMatch[1],
        kind: 'constant',
        filePath,
        line: lineNumber,
      });
    }

    return symbols;
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(filePath: string): string {
    const match = filePath.match(/\.(\w+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * 提取函数签名（简化版）
   */
  private extractFunctionSignature(line: string): string {
    // 提取括号内的参数
    const paramsMatch = line.match(/\(([^)]*)\)/);
    if (paramsMatch) {
      return `(${paramsMatch[1]}) => void`;
    }
    return '() => void';
  }

  /**
   * 搜索符号（前缀匹配）
   */
  search(prefix: string, options?: { maxResults?: number; excludeCurrentFile?: string }): SymbolInfo[] {
    const results: SymbolInfo[] = [];
    const maxResults = options?.maxResults || 50;

    for (const [name, symbols] of this.symbolIndex) {
      if (name.startsWith(prefix)) {
        for (const symbol of symbols) {
          // 排除当前文件（如果指定）
          if (options?.excludeCurrentFile && symbol.filePath === options.excludeCurrentFile) {
            continue;
          }

          // 根据最近访问文件提升权重
          const score = this.calculateSymbolScore(symbol);
          (symbol as any).score = score;

          results.push(symbol);
        }
      }
    }

    // 按分数排序，最近访问的文件中的符号优先
    results.sort((a, b) => ((b as any).score || 0) - ((a as any).score || 0));

    return results.slice(0, maxResults);
  }

  /**
   * 获取特定文件的所有符号
   */
  getFileSymbols(filePath: string): SymbolInfo[] {
    const index = this.fileIndex.get(filePath);
    return index?.symbols || [];
  }

  /**
   * 获取符号定义
   */
  getSymbolDefinition(symbolName: string): SymbolInfo | undefined {
    const symbols = this.symbolIndex.get(symbolName);
    if (symbols && symbols.length > 0) {
      // 返回最近访问的文件中的符号
      return this.getHighestPrioritySymbol(symbols);
    }
    return undefined;
  }

  /**
   * v0.3.0: 查找符号的所有引用
   *
   * @param symbolName 符号名称
   * @returns 符号引用列表
   */
  findReferences(symbolName: string): SymbolReference[] {
    const references: SymbolReference[] = [];

    // 获取符号定义
    const definition = this.getSymbolDefinition(symbolName);
    if (definition) {
      // 添加定义位置作为引用
      references.push({
        filePath: definition.filePath,
        line: definition.line,
        column: definition.column || 1,
        context: this.extractLineContext(definition.filePath, definition.line),
        symbolName: symbolName,
        isDefinition: true,
      });
    }

    // 搜索所有已索引文件中的引用
    for (const [filePath, fileIndex] of this.fileIndex) {
      // 跳过定义位置（已经添加过）
      if (definition && filePath === definition.filePath) {
        continue;
      }

      const fileReferences = this.findReferencesInFile(filePath, symbolName);
      references.push(...fileReferences);
    }

    return references;
  }

  /**
   * 在文件中查找符号引用
   */
  private findReferencesInFile(filePath: string, symbolName: string): SymbolReference[] {
    const references: SymbolReference[] = [];
    const fileIndex = this.fileIndex.get(filePath);

    if (!fileIndex) {
      return references;
    }

    // 读取文件内容（这里需要从 fileStore 获取）
    // 注意：这是一个简化实现，实际应该缓存文件内容
    const fileContent = this.getCachedFileContent(filePath);
    if (!fileContent) {
      return references;
    }

    const lines = fileContent.split('\n');

    // 创建正则表达式来匹配符号
    // 需要确保匹配的是完整的单词，而不是部分匹配
    const regex = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, 'g');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // 跳过注释行
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*')) {
        continue;
      }

      // 查找匹配
      let match;
      while ((match = regex.exec(line)) !== null) {
        const column = match.index + 1; // Monaco 使用 1-based 列号

        // 排除定义行（已经在前面添加过）
        const isDef = fileIndex.symbols.some(
          s => s.name === symbolName && s.line === lineNumber
        );

        if (!isDef) {
          references.push({
            filePath,
            line: lineNumber,
            column,
            context: this.extractLineContext(filePath, lineNumber),
            symbolName,
            isDefinition: false,
          });
        }
      }
    }

    return references;
  }

  /**
   * 提取行上下文
   */
  private extractLineContext(filePath: string, lineNumber: number): string {
    const fileContent = this.getCachedFileContent(filePath);
    if (!fileContent) {
      return '';
    }

    const lines = fileContent.split('\n');
    if (lineNumber > 0 && lineNumber <= lines.length) {
      return lines[lineNumber - 1].trim();
    }

    return '';
  }

  /**
   * 获取缓存的文件内容
   */
  private getCachedFileContent(filePath: string): string | null {
    return this.fileContentCache.get(filePath) || null;
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 计算符号权重（基于最近访问文件）
   */
  private calculateSymbolScore(symbol: SymbolInfo): number {
    let score = 0;

    // 最近访问的文件中的符号权重更高
    const fileIndex = this.recentFiles.indexOf(symbol.filePath);
    if (fileIndex !== -1) {
      score += (this.recentFiles.length - fileIndex) * 10;
    }

    // 常见符号类型权重
    switch (symbol.kind) {
      case 'function':
      case 'method':
        score += 5;
        break;
      case 'class':
      case 'interface':
        score += 3;
        break;
      case 'constant':
        score += 2;
        break;
    }

    return score;
  }

  /**
   * 获取最高优先级的符号（来自最近访问的文件）
   */
  private getHighestPrioritySymbol(symbols: SymbolInfo[]): SymbolInfo {
    let highest = symbols[0];
    let highestScore = this.calculateSymbolScore(highest);

    for (let i = 1; i < symbols.length; i++) {
      const score = this.calculateSymbolScore(symbols[i]);
      if (score > highestScore) {
        highest = symbols[i];
        highestScore = score;
      }
    }

    return highest;
  }

  /**
   * 更新最近访问文件列表（LRU）
   */
  private updateRecentFiles(filePath: string): void {
    const index = this.recentFiles.indexOf(filePath);
    if (index !== -1) {
      // 移到前面
      this.recentFiles.splice(index, 1);
    }
    this.recentFiles.unshift(filePath);

    // 限制大小
    if (this.recentFiles.length > (this.config.maxFiles || 100)) {
      this.recentFiles = this.recentFiles.slice(0, this.config.maxFiles);
    }
  }

  /**
   * 清除索引
   */
  clear(): void {
    this.fileIndex.clear();
    this.symbolIndex.clear();
    this.recentFiles = [];
    this.fileContentCache.clear(); // v0.3.0: 清除文件内容缓存
  }

  /**
   * 获取索引统计
   */
  getStats(): { filesIndexed: number; totalSymbols: number; recentFiles: string[] } {
    let totalSymbols = 0;
    for (const index of this.fileIndex.values()) {
      totalSymbols += index.symbols.length;
    }

    return {
      filesIndexed: this.fileIndex.size,
      totalSymbols,
      recentFiles: this.recentFiles.slice(0, 10), // 返回最近 10 个
    };
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const symbolIndexer = new SymbolIndexer();

// E2E 测试辅助
if (typeof window !== 'undefined') {
  (window as any).__SymbolIndexer = SymbolIndexer;
  (window as any).__symbolIndexer = symbolIndexer;
}
