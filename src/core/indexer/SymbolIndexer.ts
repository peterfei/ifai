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

class SymbolIndexer {
  private fileIndex: Map<string, FileIndex> = new Map();
  private symbolIndex: Map<string, SymbolInfo[]> = new Map(); // symbol name -> symbols
  private recentFiles: string[] = []; // LRU cache for recently accessed files
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
    const constMatch = line.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=/);
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
