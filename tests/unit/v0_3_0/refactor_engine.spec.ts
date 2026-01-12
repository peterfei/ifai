/**
 * v0.3.0 智能重构建议 - 单元测试
 *
 * 对应用例文档:
 * - REF-UNIT-01: RefactorEngine 扫描代码质量
 * - REF-UNIT-02: 生成重构补丁 generate_patch
 *
 * TDD 原则: 先写测试，再写接口，最后写实现
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ========== 接口定义 (Trait) ==========

/**
 * 代码异味类型
 */
export enum CodeSmellType {
  LongFunction = 'long_function',
  DuplicateCode = 'duplicate_code',
  ComplexCondition = 'complex_condition',
  MagicNumber = 'magic_number',
  LargeClass = 'large_class',
  FeatureEnvy = 'feature_envy',
  DataClumps = 'data_clumps',
}

/**
 * 代码复杂度指标
 */
export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  linesOfCode: number;
  nestingDepth: number;
  parameterCount: number;
  maintainabilityIndex: number;
}

/**
 * 代码异味检测结果
 */
export interface CodeSmell {
  id: string;
  type: CodeSmellType;
  severity: 'low' | 'medium' | 'high';
  filePath: string;
  line: number;
  column: number;
  endLine: number;
  message: string;
  suggestion?: string;
  metrics?: ComplexityMetrics;
}

/**
 * 重构操作类型
 */
export enum RefactorOperation {
  ExtractMethod = 'extract_method',
  ExtractVariable = 'extract_variable',
  RenameSymbol = 'rename_symbol',
  MoveFile = 'move_file',
  InlineMethod = 'inline_method',
  IntroduceParameter = 'introduce_parameter',
}

/**
 * 代码变更（补丁）
 */
export interface CodePatch {
  operation: RefactorOperation;
  filePath: string;
  originalCode: string;
  newCode: string;
  startLine: number;
  endLine: number;
  description: string;
}

/**
 * 重构建议
 */
export interface RefactorSuggestion {
  id: string;
  title: string;
  description: string;
  smell: CodeSmell;
  patch?: CodePatch;
  estimatedRisk: 'low' | 'medium' | 'high';
  autoFixable: boolean;
}

/**
 * 扫描结果
 */
export interface ScanResult {
  smells: CodeSmell[];
  suggestions: RefactorSuggestion[];
  scanDuration: number;
  filesScanned: number;
}

/**
 * 重构引擎接口 (Trait)
 */
export interface IRefactorEngine {
  /**
   * 初始化引擎
   */
  initialize(config?: RefactorConfig): Promise<void>;

  /**
   * 扫描代码质量
   * @param filePath 文件路径或目录路径
   */
  scan(filePath: string): Promise<ScanResult>;

  /**
   * 生成重构补丁
   * @param smellId 代码异味 ID
   * @param options 补丁选项
   */
  generatePatch(smellId: string, options?: PatchOptions): Promise<CodePatch | null>;

  /**
   * 应用重构补丁
   * @param patch 补丁对象
   */
  applyPatch(patch: CodePatch): Promise<boolean>;

  /**
   * 分析代码复杂度
   * @param code 代码字符串
   */
  analyzeComplexity(code: string): ComplexityMetrics;

  /**
   * 查找重复代码
   * @param filePaths 文件路径列表
   */
  findDuplicateCode(filePaths: string[]): Promise<CodeSmell[]>;

  /**
   * 清理资源
   */
  dispose(): Promise<void>;
}

export interface RefactorConfig {
  maxFileSize: number;
  enableExperimental: boolean;
  severityThreshold: 'low' | 'medium' | 'high';
}

export interface PatchOptions {
  newName?: string;
  extractToTopLevel?: boolean;
  preserveComments?: boolean;
}

// ========== Mock 实现 (社区版) ==========

/**
 * 社区版 Mock 实现
 * 返回示例建议 (Example Suggestion)
 */
export class MockRefactorEngine implements IRefactorEngine {
  private _initialized = false;
  private _config: RefactorConfig | null = null;

  async initialize(config?: RefactorConfig): Promise<void> {
    this._config = config || {
      maxFileSize: 1024 * 1024, // 1MB
      enableExperimental: false,
      severityThreshold: 'medium',
    };
    this._initialized = true;
    console.log('[Community Mode] MockRefactorEngine initialized');
  }

  async scan(filePath: string): Promise<ScanResult> {
    this._ensureInitialized();

    // 返回固定的 "示例建议" (Example Suggestion)
    return {
      smells: [
        {
          id: 'mock-smell-1',
          type: CodeSmellType.LongFunction,
          severity: 'medium',
          filePath,
          line: 1,
          column: 0,
          endLine: 50,
          message: 'Example: This function is longer than recommended',
          suggestion: 'Consider breaking this function into smaller pieces',
        },
      ],
      suggestions: [
        {
          id: 'mock-suggestion-1',
          title: 'Extract Method (Example)',
          description: 'This is a placeholder suggestion for Community Edition',
          smell: {
            id: 'mock-smell-1',
            type: CodeSmellType.LongFunction,
            severity: 'medium',
            filePath,
            line: 1,
            column: 0,
            endLine: 50,
            message: 'Example smell',
          },
          estimatedRisk: 'low',
          autoFixable: false, // 社区版不支持自动修复
        },
      ],
      scanDuration: 100,
      filesScanned: 1,
    };
  }

  async generatePatch(smellId: string, options?: PatchOptions): Promise<CodePatch | null> {
    this._ensureInitialized();

    // 返回空 Patch 或 No-op (社区版不生成实际补丁)
    return {
      operation: RefactorOperation.ExtractMethod,
      filePath: '',
      originalCode: '',
      newCode: '// This is a no-op patch for Community Edition\n// Upgrade to Commercial for full refactoring support',
      startLine: 0,
      endLine: 0,
      description: 'No-op patch (Community Edition)',
    };
  }

  async applyPatch(patch: CodePatch): Promise<boolean> {
    this._ensureInitialized();
    // 社区版：不实际应用补丁
    console.warn('[Community Mode] Patch application is not supported');
    return false;
  }

  analyzeComplexity(code: string): ComplexityMetrics {
    this._ensureInitialized();

    // 简单的行数统计作为示例
    const lines = code.split('\n').length;
    return {
      cyclomaticComplexity: 1,
      linesOfCode: lines,
      nestingDepth: 0,
      parameterCount: 0,
      maintainabilityIndex: 50,
    };
  }

  async findDuplicateCode(filePaths: string[]): Promise<CodeSmell[]> {
    this._ensureInitialized();
    // 社区版：返回空结果
    return [];
  }

  async dispose(): Promise<void> {
    this._initialized = false;
    this._config = null;
  }

  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('MockRefactorEngine not initialized. Call initialize() first.');
    }
  }
}

// ========== 测试套件 ==========

describe('RefactorEngine - Community Edition (Mock)', () => {
  let engine: MockRefactorEngine;

  beforeEach(() => {
    engine = new MockRefactorEngine();
  });

  /**
   * REF-UNIT-01: RefactorEngine 扫描代码质量
   * 预期行为: 返回固定的 "示例建议" (Example Suggestion)
   */
  describe('REF-UNIT-01: 代码质量扫描', () => {
    it('应该返回示例建议', async () => {
      await engine.initialize();

      const result = await engine.scan('/test/path/sample.ts');

      expect(result.smells).toBeDefined();
      expect(result.smells.length).toBeGreaterThan(0);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('示例建议应该包含必要的元数据', async () => {
      await engine.initialize();

      const result = await engine.scan('/test/path/sample.ts');
      const firstSmell = result.smells[0];

      expect(firstSmell.id).toBeDefined();
      expect(firstSmell.type).toBe(CodeSmellType.LongFunction);
      expect(firstSmell.severity).toBe('medium');
      expect(firstSmell.filePath).toBe('/test/path/sample.ts');
      expect(firstSmell.message).toContain('Example');
    });

    it('扫描结果应该包含统计信息', async () => {
      await engine.initialize();

      const result = await engine.scan('/test/path/sample.ts');

      expect(result.scanDuration).toBeGreaterThanOrEqual(0);
      expect(result.filesScanned).toBe(1);
    });

    it('应该使用默认配置初始化', async () => {
      await engine.initialize();

      const result = await engine.scan('/test/path/sample.ts');

      expect(result).toBeDefined();
    });
  });

  /**
   * REF-UNIT-02: 生成重构补丁 generate_patch
   * 预期行为: 返回空 Patch 或 No-op
   */
  describe('REF-UNIT-02: 生成重构补丁', () => {
    it('应该返回 No-op 补丁', async () => {
      await engine.initialize();

      const patch = await engine.generatePatch('mock-smell-1');

      expect(patch).not.toBeNull();
      expect(patch?.operation).toBeDefined();
      expect(patch?.description).toContain('Community Edition');
    });

    it('补丁应该不包含实际代码变更', async () => {
      await engine.initialize();

      const patch = await engine.generatePatch('mock-smell-1');

      expect(patch?.originalCode).toBe('');
      expect(patch?.newCode).toContain('no-op');
    });

    it('应该支持补丁选项', async () => {
      await engine.initialize();

      const patch = await engine.generatePatch('mock-smell-1', {
        newName: 'extractedFunction',
        extractToTopLevel: true,
      });

      expect(patch).not.toBeNull();
    });
  });

  /**
   * 补丁应用测试
   */
  describe('补丁应用', () => {
    it('applyPatch 应该返回 false (社区版不支持)', async () => {
      await engine.initialize();

      const result = await engine.applyPatch({
        operation: RefactorOperation.ExtractMethod,
        filePath: '/test/file.ts',
        originalCode: 'old code',
        newCode: 'new code',
        startLine: 1,
        endLine: 10,
        description: 'Test patch',
      });

      expect(result).toBe(false);
    });

    it('应该记录警告日志', async () => {
      await engine.initialize();
      const consoleSpy = vi.spyOn(console, 'warn');

      await engine.applyPatch({
        operation: RefactorOperation.ExtractMethod,
        filePath: '/test/file.ts',
        originalCode: '',
        newCode: '',
        startLine: 0,
        endLine: 0,
        description: '',
      });

      expect(consoleSpy).toHaveBeenCalledWith('[Community Mode] Patch application is not supported');
    });
  });

  /**
   * 复杂度分析测试
   */
  describe('复杂度分析', () => {
    it('应该分析代码复杂度', () => {
      engine.initialize(); // 同步调用用于复杂度分析测试

      const code = `
        function test() {
          const a = 1;
          const b = 2;
          return a + b;
        }
      `;

      const metrics = engine.analyzeComplexity(code);

      expect(metrics).toBeDefined();
      expect(metrics.linesOfCode).toBeGreaterThan(0);
      expect(metrics.cyclomaticComplexity).toBeGreaterThanOrEqual(1);
    });

    it('应该处理空代码', () => {
      engine.initialize();

      const metrics = engine.analyzeComplexity('');

      expect(metrics.linesOfCode).toBe(1); // 空字符串算作一行
    });
  });

  /**
   * 重复代码检测测试
   */
  describe('重复代码检测', () => {
    it('findDuplicateCode 应该返回空数组 (社区版)', async () => {
      await engine.initialize();

      const duplicates = await engine.findDuplicateCode([
        '/test/file1.ts',
        '/test/file2.ts',
      ]);

      expect(duplicates).toEqual([]);
    });
  });

  /**
   * 资源管理测试
   */
  describe('资源管理', () => {
    it('dispose 应该清理资源', async () => {
      await engine.initialize();
      await engine.dispose();

      // dispose 后再次调用应该抛出错误
      await expect(engine.scan('/test/file.ts')).rejects.toThrow();
    });

    it('未初始化时调用方法应该抛出错误', async () => {
      const uninitializedEngine = new MockRefactorEngine();

      await expect(uninitializedEngine.scan('/test/file.ts')).rejects.toThrow(
        'MockRefactorEngine not initialized'
      );
    });
  });
});

/**
 * 商业版测试占位符
 */
describe('RefactorEngine - Commercial Edition (Core Integration)', () => {
  describe.skip('REF-COMM-01: 真实 AST 分析', () => {
    it('应该运行 AST 复杂度算法并返回真实问题列表', async () => {
      // 商业版实现测试
    });
  });

  describe.skip('REF-COMM-02: 结构化代码补丁', () => {
    it('应该基于 AST 生成结构化修改 Diff', async () => {
      // 商业版实现测试
    });
  });

  describe.skip('REF-COMM-03: 自动重构应用', () => {
    it('应该能够应用生成的补丁', async () => {
      // 商业版实现测试
    });
  });
});
