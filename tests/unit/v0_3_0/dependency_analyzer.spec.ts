/**
 * v0.3.0 跨仓库依赖分析 - 单元测试
 *
 * 对应用例文档:
 * - DEP-UNIT-01: DependencyAnalyzer trait 初始化
 * - DEP-UNIT-02: 索引单个文件 index_file(path)
 * - DEP-UNIT-03: 跨仓库路径解析
 *
 * TDD 原则: 先写测试，再写接口，最后写实现
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ========== 接口定义 (Trait) ==========
// 这些接口定义应该与实际实现保持一致
// 在 TDD 流程中，这些接口是先于实现编写的

/**
 * 符号类型枚举
 */
export enum SymbolKind {
  Class = 'class',
  Function = 'function',
  Variable = 'variable',
  Interface = 'interface',
  TypeAlias = 'type',
  Enum = 'enum',
  Module = 'module',
}

/**
 * 符号信息接口
 */
export interface SymbolInfo {
  id: string;
  name: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  column: number;
  documentation?: string;
  children?: SymbolInfo[];
}

/**
 * 索引结果接口
 */
export interface IndexResult {
  symbols: SymbolInfo[];
  success: boolean;
  error?: string;
}

/**
 * 路径解析结果接口
 */
export interface PathResolution {
  resolvedPath: string;
  exists: boolean;
  isCrossRepo: boolean;
}

/**
 * 依赖分析器接口 (Trait)
 * 这是社区版和商业版都需要实现的核心接口
 */
export interface IDependencyAnalyzer {
  /**
   * 初始化分析器
   * @param config 配置选项
   */
  initialize(config?: AnalyzerConfig): Promise<void>;

  /**
   * 索引单个文件
   * @param filePath 文件路径
   */
  indexFile(filePath: string): Promise<IndexResult>;

  /**
   * 解析跨仓库路径
   * @param importPath 导入路径
   * @param basePath 基础路径
   */
  resolvePath(importPath: string, basePath: string): PathResolution;

  /**
   * 查找符号定义
   * @param symbolName 符号名称
   * @param filePath 文件路径
   */
  findDefinition(symbolName: string, filePath: string): Promise<SymbolInfo | null>;

  /**
   * 查找符号引用
   * @param symbolName 符号名称
   */
  findReferences(symbolName: string): Promise<string[]>;

  /**
   * 分析影响面
   * @param symbolName 符号名称
   */
  analyzeImpact(symbolName: string): Promise<ImpactAnalysisResult>;

  /**
   * 清理索引
   */
  dispose(): Promise<void>;
}

export interface AnalyzerConfig {
  workspaceRoot: string;
  enableCrossRepo: boolean;
  indexingDepth?: number;
}

export interface ImpactAnalysisResult {
  symbol: string;
  affectedFiles: string[];
  affectedCount: number;
  isBreakingChange: boolean;
}

// ========== Mock 实现 (社区版) ==========
/**
 * 社区版 Mock 实现
 * 返回占位符数据，确保不崩溃
 */
export class MockDependencyAnalyzer implements IDependencyAnalyzer {
  private _initialized = false;
  private _config: AnalyzerConfig | null = null;

  async initialize(config?: AnalyzerConfig): Promise<void> {
    this._config = config || { workspaceRoot: '.', enableCrossRepo: false };
    this._initialized = true;
    console.log('[Community Mode] MockDependencyAnalyzer initialized');
  }

  async indexFile(filePath: string): Promise<IndexResult> {
    this._ensureInitialized();

    // 返回虚构的符号列表 (Mock Symbols)
    return {
      symbols: [
        {
          id: `mock-${filePath}-1`,
          name: 'MockSymbol',
          kind: SymbolKind.Class,
          filePath,
          line: 1,
          column: 0,
          documentation: 'This is a mock symbol for Community Edition',
        },
      ],
      success: true,
    };
  }

  resolvePath(importPath: string, basePath: string): PathResolution {
    this._ensureInitialized();

    // 社区版：仅识别当前工作区路径
    if (importPath.startsWith('../') || importPath.startsWith('..\\')) {
      return {
        resolvedPath: `${basePath}/${importPath}`,
        exists: false,
        isCrossRepo: true, // 标记为跨仓库但不实际解析
      };
    }

    return {
      resolvedPath: `${basePath}/${importPath}`,
      exists: true,
      isCrossRepo: false,
    };
  }

  async findDefinition(symbolName: string, filePath: string): Promise<SymbolInfo | null> {
    this._ensureInitialized();
    // 社区版：返回 null 或占位符
    return null;
  }

  async findReferences(symbolName: string): Promise<string[]> {
    this._ensureInitialized();
    // 社区版：返回空数组或仅当前文件
    return [];
  }

  async analyzeImpact(symbolName: string): Promise<ImpactAnalysisResult> {
    this._ensureInitialized();
    // 社区版：返回占位符结果
    return {
      symbol: symbolName,
      affectedFiles: [],
      affectedCount: 0,
      isBreakingChange: false,
    };
  }

  async dispose(): Promise<void> {
    this._initialized = false;
    this._config = null;
  }

  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('MockDependencyAnalyzer not initialized. Call initialize() first.');
    }
  }
}

// ========== 测试套件 ==========

describe('DependencyAnalyzer - Community Edition (Mock)', () => {
  let analyzer: MockDependencyAnalyzer;

  beforeEach(() => {
    analyzer = new MockDependencyAnalyzer();
  });

  /**
   * DEP-UNIT-01: DependencyAnalyzer trait 初始化
   * 预期行为: 成功初始化 MockAnalyzer，日志记录 "Running in Community Mode"
   */
  describe('DEP-UNIT-01: 初始化测试', () => {
    it('应该成功初始化 MockAnalyzer', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      await analyzer.initialize({
        workspaceRoot: '/test/workspace',
        enableCrossRepo: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith('[Community Mode] MockDependencyAnalyzer initialized');
    });

    it('应该使用默认配置初始化', async () => {
      await analyzer.initialize();

      // 不应抛出异常
      expect(analyzer).toBeDefined();
    });

    it('未初始化时调用方法应该抛出错误', async () => {
      const uninitializedAnalyzer = new MockDependencyAnalyzer();

      await expect(uninitializedAnalyzer.indexFile('test.ts')).rejects.toThrow(
        'MockDependencyAnalyzer not initialized'
      );
    });
  });

  /**
   * DEP-UNIT-02: 索引单个文件 index_file(path)
   * 预期行为: 返回虚构的符号列表 (Mock Symbols)
   */
  describe('DEP-UNIT-02: 文件索引测试', () => {
    it('应该返回虚构的符号列表', async () => {
      await analyzer.initialize();

      const result = await analyzer.indexFile('/test/path/sample.ts');

      expect(result.success).toBe(true);
      expect(result.symbols).toBeDefined();
      expect(result.symbols.length).toBeGreaterThan(0);
      expect(result.symbols[0].name).toBe('MockSymbol');
    });

    it('返回的符号应该包含正确的元数据', async () => {
      await analyzer.initialize();

      const testFilePath = '/test/path/test.ts';
      const result = await analyzer.indexFile(testFilePath);

      const firstSymbol = result.symbols[0];
      expect(firstSymbol.id).toContain(testFilePath);
      expect(firstSymbol.filePath).toBe(testFilePath);
      expect(firstSymbol.kind).toBe(SymbolKind.Class);
      expect(firstSymbol.line).toBe(1);
      expect(firstSymbol.column).toBe(0);
    });

    it('应该处理无效文件路径而不崩溃', async () => {
      await analyzer.initialize();

      // 即使路径无效，Mock 实现也应返回成功结果
      const result = await analyzer.indexFile('');

      expect(result.success).toBe(true);
      expect(result.symbols).toBeDefined();
    });
  });

  /**
   * DEP-UNIT-03: 跨仓库路径解析
   * 预期行为: 仅识别当前工作区路径
   */
  describe('DEP-UNIT-03: 路径解析测试', () => {
    beforeEach(async () => {
      await analyzer.initialize();
    });

    it('应该识别当前工作区路径', () => {
      const result = analyzer.resolvePath('./localFile.ts', '/workspace');

      expect(result.exists).toBe(true);
      expect(result.isCrossRepo).toBe(false);
      expect(result.resolvedPath).toContain('localFile.ts');
    });

    it('应该标记跨仓库路径但不实际解析', () => {
      const result = analyzer.resolvePath('../sibling-repo/lib.ts', '/workspace');

      expect(result.isCrossRepo).toBe(true);
      expect(result.resolvedPath).toContain('sibling-repo');
    });

    it('应该正确处理相对路径', () => {
      const result = analyzer.resolvePath('../../parent/file.ts', '/workspace/subdir');

      expect(result.resolvedPath).toContain('parent');
      expect(result.resolvedPath).toContain('file.ts');
    });
  });

  /**
   * 额外测试: 符号查找与引用分析
   */
  describe('符号查找与引用', () => {
    it('findDefinition 应该返回 null (社区版)', async () => {
      await analyzer.initialize();

      const result = await analyzer.findDefinition('SomeSymbol', '/test/file.ts');

      expect(result).toBeNull();
    });

    it('findReferences 应该返回空数组 (社区版)', async () => {
      await analyzer.initialize();

      const result = await analyzer.findReferences('SomeSymbol');

      expect(result).toEqual([]);
    });
  });

  /**
   * 额外测试: 影响面分析
   */
  describe('影响面分析', () => {
    it('analyzeImpact 应该返回占位符结果', async () => {
      await analyzer.initialize();

      const result = await analyzer.analyzeImpact('User.name');

      expect(result.symbol).toBe('User.name');
      expect(result.affectedFiles).toEqual([]);
      expect(result.affectedCount).toBe(0);
      expect(result.isBreakingChange).toBe(false);
    });
  });

  /**
   * 资源清理测试
   */
  describe('资源管理', () => {
    it('dispose 应该清理资源', async () => {
      await analyzer.initialize();
      await analyzer.dispose();

      // dispose 后再次调用应该抛出错误
      await expect(analyzer.indexFile('test.ts')).rejects.toThrow();
    });
  });
});

/**
 * 商业版测试占位符
 *
 * 注意：商业版测试需要链接 ifainew-core
 * 这些测试应该在商业版 CI 环境中运行
 */
describe('DependencyAnalyzer - Commercial Edition (Core Integration)', () => {
  // TODO: 当商业版核心库可用时，实现这些测试

  describe.skip('DEP-COMM-01: 真实索引功能', () => {
    it('应该解析 AST 并提取真实符号', async () => {
      // 商业版实现测试
    });
  });

  describe.skip('DEP-COMM-02: 跨仓库依赖解析', () => {
    it('应该能够解析 ../sibling-repo 等相对路径依赖', async () => {
      // 商业版实现测试
    });
  });

  describe.skip('DEP-COMM-03: SQLite 索引引擎', () => {
    it('应该将符号存入数据库', async () => {
      // 商业版实现测试
    });
  });
});
