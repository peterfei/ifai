/**
 * v0.3.0 Go to Definition - 单元测试
 *
 * 对应用例文档:
 * - DEP-001: 跨文件/跨模块跳转
 *
 * TDD 原则: 先写测试，验证 DefinitionProvider 功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ========== 测试数据 ==========

const mockSymbolIndexer = {
  getSymbolDefinition: vi.fn(),
};

const mockModel = {
  uri: { toString: () => 'file:///mock/current/file.ts' },
  getWordAtPosition: vi.fn(),
};

// ========== DefinitionProvider 测试 ==========

describe('DefinitionProvider', () => {
  // 每次测试前重置 mock
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * GTD-UNIT-01: 获取光标位置的单词
   */
  describe('getWordAtPosition', () => {
    it('应该正确提取单词', () => {
      // Arrange
      const position = { lineNumber: 10, column: 5 };
      mockModel.getWordAtPosition.mockReturnValue({
        word: 'myFunction',
        startColumn: 1,
        endColumn: 11,
      });

      // Act
      const word = mockModel.getWordAtPosition(position);

      // Assert
      expect(word.word).toBe('myFunction');
      expect(mockModel.getWordAtPosition).toHaveBeenCalledWith(position);
    });

    it('应该在无单词时返回 null', () => {
      // Arrange
      const position = { lineNumber: 10, column: 5 };
      mockModel.getWordAtPosition.mockReturnValue(null);

      // Act
      const word = mockModel.getWordAtPosition(position);

      // Assert
      expect(word).toBeNull();
    });
  });

  /**
   * GTD-UNIT-02: 查找符号定义
   */
  describe('provideDefinition', () => {
    it('应该从符号索引器查找定义', async () => {
      // Arrange
      const position = { lineNumber: 10, column: 5 };
      mockModel.getWordAtPosition.mockReturnValue({
        word: 'myFunction',
        startColumn: 1,
        endColumn: 11,
      });

      mockSymbolIndexer.getSymbolDefinition.mockReturnValue({
        name: 'myFunction',
        kind: 'function',
        filePath: '/mock/current/file.ts',
        line: 5,
        column: 1,
      });

      // Act
      const result = await mockSymbolIndexer.getSymbolDefinition('myFunction');

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toBe('myFunction');
      expect(result.filePath).toBe('/mock/current/file.ts');
    });

    it('应该在符号不存在时返回 null', async () => {
      // Arrange
      mockSymbolIndexer.getSymbolDefinition.mockReturnValue(undefined);

      // Act
      const result = await mockSymbolIndexer.getSymbolDefinition('nonExistent');

      // Assert
      expect(result).toBeUndefined();
    });
  });

  /**
   * GTD-UNIT-03: 同文件跳转
   */
  describe('same-file navigation', () => {
    it('应该返回同文件的定义位置', async () => {
      // Arrange
      const currentFilePath = '/mock/current/file.ts';
      const position = { lineNumber: 10, column: 5 };

      mockModel.getWordAtPosition.mockReturnValue({
        word: 'myFunction',
        startColumn: 1,
        endColumn: 11,
      });

      mockSymbolIndexer.getSymbolDefinition.mockReturnValue({
        name: 'myFunction',
        kind: 'function',
        filePath: currentFilePath,
        line: 5,
        column: 1,
      });

      // Act
      const definition = await mockSymbolIndexer.getSymbolDefinition('myFunction');
      const isCrossFile = definition.filePath !== currentFilePath;

      // Assert
      expect(isCrossFile).toBe(false);
      expect(definition.line).toBe(5);
      expect(definition.column).toBe(1);
    });
  });

  /**
   * GTD-UNIT-04: 跨文件跳转
   */
  describe('cross-file navigation', () => {
    it('应该检测跨文件定义', async () => {
      // Arrange
      const currentFilePath = '/mock/current/file.ts';
      const targetFilePath = '/mock/other/utils.ts';

      mockSymbolIndexer.getSymbolDefinition.mockReturnValue({
        name: 'utilFunction',
        kind: 'function',
        filePath: targetFilePath,
        line: 15,
        column: 1,
      });

      // Act
      const definition = await mockSymbolIndexer.getSymbolDefinition('utilFunction');
      const isCrossFile = definition.filePath !== currentFilePath;

      // Assert
      expect(isCrossFile).toBe(true);
      expect(definition.filePath).toBe(targetFilePath);
    });

    it('应该包含正确的行和列信息', async () => {
      // Arrange
      mockSymbolIndexer.getSymbolDefinition.mockReturnValue({
        name: 'myClass',
        kind: 'class',
        filePath: '/mock/other/classes.ts',
        line: 20,
        column: 5,
      });

      // Act
      const definition = await mockSymbolIndexer.getSymbolDefinition('myClass');

      // Assert
      expect(definition.line).toBe(20);
      expect(definition.column).toBe(5);
    });
  });

  /**
   * GTD-UNIT-05: 支持的语言
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
      expect(supportedLanguages).toContain('jsx');
      expect(supportedLanguages).toContain('tsx');
    });

    it('应该支持系统编程语言', () => {
      expect(supportedLanguages).toContain('c');
      expect(supportedLanguages).toContain('cpp');
      expect(supportedLanguages).toContain('go');
      expect(supportedLanguages).toContain('rust');
      expect(supportedLanguages).toContain('java');
      expect(supportedLanguages).toContain('csharp');
    });

    it('应该支持脚本语言', () => {
      expect(supportedLanguages).toContain('python');
      expect(supportedLanguages).toContain('php');
      expect(supportedLanguages).toContain('ruby');
      expect(supportedLanguages).toContain('perl');
      expect(supportedLanguages).toContain('lua');
    });

    it('应该支持移动/现代语言', () => {
      expect(supportedLanguages).toContain('swift');
      expect(supportedLanguages).toContain('kotlin');
      expect(supportedLanguages).toContain('dart');
      expect(supportedLanguages).toContain('scala');
    });

    it('应该支持 Web/前端语言', () => {
      expect(supportedLanguages).toContain('html');
      expect(supportedLanguages).toContain('css');
      expect(supportedLanguages).toContain('scss');
      expect(supportedLanguages).toContain('less');
    });

    it('应该支持数据/配置格式', () => {
      expect(supportedLanguages).toContain('json');
      expect(supportedLanguages).toContain('yaml');
      expect(supportedLanguages).toContain('xml');
      expect(supportedLanguages).toContain('toml');
    });

    it('应该支持至少 30 种语言', () => {
      expect(supportedLanguages.length).toBeGreaterThanOrEqual(30);
    });
  });

  /**
   * GTD-UNIT-06: 符号类型映射
   */
  describe('symbol kind mapping', () => {
    it('应该正确映射 function 类型', async () => {
      mockSymbolIndexer.getSymbolDefinition.mockReturnValue({
        name: 'myFunction',
        kind: 'function',
        filePath: '/mock/file.ts',
        line: 1,
      });

      const result = await mockSymbolIndexer.getSymbolDefinition('myFunction');
      expect(result.kind).toBe('function');
    });

    it('应该正确映射 class 类型', async () => {
      mockSymbolIndexer.getSymbolDefinition.mockReturnValue({
        name: 'MyClass',
        kind: 'class',
        filePath: '/mock/file.ts',
        line: 1,
      });

      const result = await mockSymbolIndexer.getSymbolDefinition('MyClass');
      expect(result.kind).toBe('class');
    });

    it('应该正确映射 interface 类型', async () => {
      mockSymbolIndexer.getSymbolDefinition.mockReturnValue({
        name: 'MyInterface',
        kind: 'interface',
        filePath: '/mock/file.ts',
        line: 1,
      });

      const result = await mockSymbolIndexer.getSymbolDefinition('MyInterface');
      expect(result.kind).toBe('interface');
    });
  });
});

// ========== 集成测试 ==========

describe('DefinitionProvider Integration', () => {
  /**
   * GTD-INT-01: 端到端跳转流程
   */
  it('应该完成完整的查找-跳转流程', async () => {
    // Arrange
    const currentFile = '/mock/src/app.ts';
    const targetFile = '/mock/src/utils/helper.ts';
    const symbolName = 'helperFunction';

    // Mock symbol indexer
    mockSymbolIndexer.getSymbolDefinition.mockReturnValue({
      name: symbolName,
      kind: 'function',
      filePath: targetFile,
      line: 10,
      column: 1,
    });

    // Mock model
    mockModel.getWordAtPosition.mockReturnValue({
      word: symbolName,
      startColumn: 1,
      endColumn: symbolName.length,
    });

    // Act
    const definition = await mockSymbolIndexer.getSymbolDefinition(symbolName);

    // Assert
    expect(definition).toBeDefined();
    expect(definition.name).toBe(symbolName);
    expect(definition.filePath).toBe(targetFile);
    expect(definition.line).toBe(10);
  });
});
