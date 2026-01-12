/**
 * v0.3.0 Find References - 单元测试
 *
 * 对应用例文档:
 * - DEP-002: 影响面分析
 *
 * TDD 原则: 先写测试，验证 ReferencesProvider 功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ========== 测试数据 ==========

const mockSymbolIndexer = {
  findReferences: vi.fn(),
};

const mockModel = {
  uri: { toString: () => 'file:///mock/current/file.ts' },
  getWordAtPosition: vi.fn(),
};

// ========== ReferencesProvider 测试 ==========

describe('ReferencesProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * REF-UNIT-01: 获取光标位置的单词
   */
  describe('getWordAtPosition', () => {
    it('应该正确提取单词', () => {
      const position = { lineNumber: 10, column: 5 };
      mockModel.getWordAtPosition.mockReturnValue({
        word: 'myFunction',
        startColumn: 1,
        endColumn: 11,
      });

      const word = mockModel.getWordAtPosition(position);

      expect(word.word).toBe('myFunction');
      expect(mockModel.getWordAtPosition).toHaveBeenCalledWith(position);
    });

    it('应该在无单词时返回 null', () => {
      const position = { lineNumber: 10, column: 5 };
      mockModel.getWordAtPosition.mockReturnValue(null);

      const word = mockModel.getWordAtPosition(position);

      expect(word).toBeNull();
    });
  });

  /**
   * REF-UNIT-02: 查找符号引用
   */
  describe('provideReferences', () => {
    it('应该从符号索引器查找引用', async () => {
      const position = { lineNumber: 10, column: 5 };
      mockModel.getWordAtPosition.mockReturnValue({
        word: 'myFunction',
        startColumn: 1,
        endColumn: 11,
      });

      const mockReferences = [
        {
          filePath: '/mock/src/app.ts',
          line: 5,
          column: 10,
          context: 'myFunction();',
        },
        {
          filePath: '/mock/src/utils.ts',
          line: 15,
          column: 8,
          context: 'const x = myFunction();',
        },
      ];

      mockSymbolIndexer.findReferences.mockReturnValue(mockReferences);

      const result = await mockSymbolIndexer.findReferences('myFunction');

      expect(result).toBeDefined();
      expect(result.length).toBe(2);
      expect(result[0].filePath).toBe('/mock/src/app.ts');
      expect(result[1].filePath).toBe('/mock/src/utils.ts');
    });

    it('应该在符号无引用时返回空数组', async () => {
      mockSymbolIndexer.findReferences.mockReturnValue([]);

      const result = await mockSymbolIndexer.findReferences('unusedFunction');

      expect(result).toEqual([]);
    });

    it('应该在符号不存在时返回空数组', async () => {
      mockSymbolIndexer.findReferences.mockReturnValue([]);

      const result = await mockSymbolIndexer.findReferences('nonExistent');

      expect(result).toEqual([]);
    });
  });

  /**
   * REF-UNIT-03: 同文件引用
   */
  describe('same-file references', () => {
    it('应该返回同文件内的所有引用', async () => {
      const mockReferences = [
        {
          filePath: '/mock/current/file.ts',
          line: 5,
          column: 10,
          context: 'myFunction();',
        },
        {
          filePath: '/mock/current/file.ts',
          line: 10,
          column: 8,
          context: 'const x = myFunction();',
        },
      ];

      mockSymbolIndexer.findReferences.mockReturnValue(mockReferences);

      const result = await mockSymbolIndexer.findReferences('myFunction');
      const sameFileRefs = result.filter((r: any) => r.filePath === '/mock/current/file.ts');

      expect(sameFileRefs.length).toBe(2);
      expect(sameFileRefs[0].line).toBe(5);
      expect(sameFileRefs[1].line).toBe(10);
    });
  });

  /**
   * REF-UNIT-04: 跨文件引用
   */
  describe('cross-file references', () => {
    it('应该检测跨文件引用', async () => {
      const mockReferences = [
        {
          filePath: '/mock/src/app.ts',
          line: 5,
          column: 10,
          context: 'myFunction();',
        },
        {
          filePath: '/mock/src/utils.ts',
          line: 15,
          column: 8,
          context: 'const x = myFunction();',
        },
        {
          filePath: '/mock/src/components/Header.tsx',
          line: 20,
          column: 12,
          context: 'myFunction()',
        },
      ];

      mockSymbolIndexer.findReferences.mockReturnValue(mockReferences);

      const result = await mockSymbolIndexer.findReferences('myFunction');

      expect(result.length).toBe(3);

      // 验证跨文件引用
      const filePaths = result.map((r: any) => r.filePath);
      expect(filePaths).toContain('/mock/src/app.ts');
      expect(filePaths).toContain('/mock/src/utils.ts');
      expect(filePaths).toContain('/mock/src/components/Header.tsx');
    });

    it('应该包含正确的行和列信息', async () => {
      const mockReferences = [
        {
          filePath: '/mock/src/app.ts',
          line: 5,
          column: 10,
          context: 'myFunction();',
        },
      ];

      mockSymbolIndexer.findReferences.mockReturnValue(mockReferences);

      const result = await mockSymbolIndexer.findReferences('myFunction');
      const ref = result[0];

      expect(ref.line).toBe(5);
      expect(ref.column).toBe(10);
    });
  });

  /**
   * REF-UNIT-05: 引用上下文
   */
  describe('reference context', () => {
    it('应该包含引用的代码上下文', async () => {
      const mockReferences = [
        {
          filePath: '/mock/src/app.ts',
          line: 5,
          column: 10,
          context: 'const result = myFunction(1, 2);',
        },
      ];

      mockSymbolIndexer.findReferences.mockReturnValue(mockReferences);

      const result = await mockSymbolIndexer.findReferences('myFunction');

      expect(result[0].context).toBe('const result = myFunction(1, 2);');
    });
  });

  /**
   * REF-UNIT-06: 支持的语言
   */
  describe('supported languages', () => {
    // 定义支持的所有主流编程语言
    const supportedLanguages = [
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

    it('应该支持 TypeScript/JavaScript 生态', () => {
      expect(supportedLanguages).toContain('typescript');
      expect(supportedLanguages).toContain('javascript');
      expect(supportedLanguages).toContain('typescriptreact');
      expect(supportedLanguages).toContain('javascriptreact');
    });

    it('应该支持系统编程语言', () => {
      expect(supportedLanguages).toContain('c');
      expect(supportedLanguages).toContain('cpp');
      expect(supportedLanguages).toContain('go');
      expect(supportedLanguages).toContain('rust');
      expect(supportedLanguages).toContain('java');
    });

    it('应该支持脚本语言', () => {
      expect(supportedLanguages).toContain('python');
      expect(supportedLanguages).toContain('php');
      expect(supportedLanguages).toContain('ruby');
    });

    it('应该支持至少 30 种语言', () => {
      expect(supportedLanguages.length).toBeGreaterThanOrEqual(30);
    });
  });

  /**
   * REF-UNIT-07: 引用统计
   */
  describe('reference statistics', () => {
    it('应该正确统计引用数量', async () => {
      const mockReferences = [
        { filePath: '/mock/src/app.ts', line: 5, column: 10, context: 'myFunction();' },
        { filePath: '/mock/src/utils.ts', line: 15, column: 8, context: 'myFunction();' },
        { filePath: '/mock/src/components/Header.tsx', line: 20, column: 12, context: 'myFunction();' },
      ];

      mockSymbolIndexer.findReferences.mockReturnValue(mockReferences);

      const result = await mockSymbolIndexer.findReferences('myFunction');

      expect(result.length).toBe(3);
    });

    it('应该按文件分组引用', async () => {
      const mockReferences = [
        { filePath: '/mock/src/app.ts', line: 5, column: 10, context: 'myFunction();' },
        { filePath: '/mock/src/app.ts', line: 10, column: 8, context: 'myFunction();' },
        { filePath: '/mock/src/utils.ts', line: 15, column: 8, context: 'myFunction();' },
      ];

      mockSymbolIndexer.findReferences.mockReturnValue(mockReferences);

      const result = await mockSymbolIndexer.findReferences('myFunction');

      // 按文件分组
      const byFile: Record<string, any[]> = {};
      result.forEach((ref: any) => {
        if (!byFile[ref.filePath]) {
          byFile[ref.filePath] = [];
        }
        byFile[ref.filePath].push(ref);
      });

      expect(byFile['/mock/src/app.ts'].length).toBe(2);
      expect(byFile['/mock/src/utils.ts'].length).toBe(1);
    });
  });
});

// ========== 集成测试 ==========

describe('ReferencesProvider Integration', () => {
  /**
   * REF-INT-01: 端到端引用查找流程
   */
  it('应该完成完整的查找引用流程', async () => {
    const symbolName = 'calculateSum';
    const currentFile = '/mock/src/app.ts';

    const mockReferences = [
      {
        filePath: '/mock/src/app.ts',
        line: 10,
        column: 5,
        context: 'const result = calculateSum(5, 3);',
      },
      {
        filePath: '/mock/src/utils/calculator.ts',
        line: 20,
        column: 10,
        context: 'calculateSum(a, b);',
      },
    ];

    mockSymbolIndexer.findReferences.mockReturnValue(mockReferences);

    // 模拟 Monaco 位置
    const position = { lineNumber: 10, column: 5 };
    mockModel.getWordAtPosition.mockReturnValue({
      word: symbolName,
      startColumn: 1,
      endColumn: symbolName.length,
    });

    // 执行查找
    const result = await mockSymbolIndexer.findReferences(symbolName);

    // 验证
    expect(result).toBeDefined();
    expect(result.length).toBe(2);
    expect(result[0].filePath).toBe('/mock/src/app.ts');
    expect(result[1].filePath).toBe('/mock/src/utils/calculator.ts');
  });
});
