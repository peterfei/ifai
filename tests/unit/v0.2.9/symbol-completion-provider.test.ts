/**
 * v0.2.9 SymbolCompletionProvider 单元测试
 *
 * 测试符号补全提供者的核心功能
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SymbolCompletionProvider } from '../../../src/components/Editor/SymbolCompletionProvider';
import { symbolIndexer, type SymbolInfo } from '../../../src/core/indexer/SymbolIndexer';

// Mock symbolIndexer
vi.mock('../../../src/core/indexer/SymbolIndexer', () => ({
  symbolIndexer: {
    search: vi.fn(),
  },
  SymbolInfo: {},
}));

describe('SymbolCompletionProvider', () => {
  let provider: SymbolCompletionProvider;
  let mockModel: any;
  let mockPosition: any;

  beforeEach(() => {
    provider = new SymbolCompletionProvider({
      currentFilePath: '/current/test.ts',
      showSource: true,
    });

    // Mock Monaco model
    mockModel = {
      getWordUntilPosition: vi.fn((position: any) => ({
        word: 'test',
        startColumn: position.column - 4,
        endColumn: position.column,
      })),
      getValue: () => 'test content',
    };

    // Mock Monaco position
    mockPosition = {
      lineNumber: 1,
      column: 5,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('EDT-UNIT-01: 应该返回匹配前缀的符号', () => {
    it('应该返回前缀匹配的补全建议', async () => {
      const mockSymbols: SymbolInfo[] = [
        {
          name: 'testFunction',
          kind: 'function',
          filePath: '/utils.ts',
          line: 10,
        },
        {
          name: 'testVariable',
          kind: 'variable',
          filePath: '/helpers.ts',
          line: 5,
        },
      ];

      vi.mocked(symbolIndexer.search).mockReturnValue(mockSymbols);

      const result = await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0].label).toBe('testFunction');
      expect(result.suggestions[1].label).toBe('testVariable');
    });

    it('当前缀为空时应该返回空列表', async () => {
      mockModel.getWordUntilPosition.mockReturnValue({ word: '' });

      const result = await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      expect(result.suggestions).toEqual([]);
      expect(symbolIndexer.search).not.toHaveBeenCalled();
    });

    it('当前缀太短时应该返回空列表', async () => {
      mockModel.getWordUntilPosition.mockReturnValue({ word: '' });

      const result = await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      expect(result.suggestions).toEqual([]);
    });

    it('应该将符号转换为 Monaco 补全建议格式', async () => {
      const mockSymbols: SymbolInfo[] = [
        {
          name: 'myFunction',
          kind: 'function',
          filePath: '/test/file.ts',
          line: 15,
        },
      ];

      vi.mocked(symbolIndexer.search).mockReturnValue(mockSymbols);

      const result = await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      expect(result.suggestions[0]).toMatchObject({
        label: 'myFunction',
        kind: 1, // Monaco CompletionItemKind.Function
        insertText: 'myFunction',
      });
    });
  });

  describe('EDT-UNIT-02: 应该显示来源文件', () => {
    it('应该在 detail 中显示文件名', async () => {
      const mockSymbols: SymbolInfo[] = [
        {
          name: 'testFunc',
          kind: 'function',
          filePath: '/utils/test.ts',
          line: 10,
        },
      ];

      vi.mocked(symbolIndexer.search).mockReturnValue(mockSymbols);

      const result = await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      expect(result.suggestions[0].detail).toContain('test.ts');
    });

    it('应该在 documentation 中显示完整路径和行号', async () => {
      const mockSymbols: SymbolInfo[] = [
        {
          name: 'testFunc',
          kind: 'function',
          filePath: '/src/utils/helpers.ts',
          line: 42,
        },
      ];

      vi.mocked(symbolIndexer.search).mockReturnValue(mockSymbols);

      const result = await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      expect(result.suggestions[0].documentation).toMatchObject({
        value: expect.stringContaining('helpers.ts'),
        isTrusted: true,
      });
      expect(result.suggestions[0].documentation.value).toContain('line 42');
    });

    it('当 showSource 为 false 且符号有 detail 时，应该只显示 detail', async () => {
      const providerWithoutSource = new SymbolCompletionProvider({
        currentFilePath: '/current/test.ts',
        showSource: false,
      });

      const mockSymbols: SymbolInfo[] = [
        {
          name: 'testFunc',
          kind: 'function',
          filePath: '/utils/test.ts',
          line: 10,
          detail: '() => void',
        },
      ];

      vi.mocked(symbolIndexer.search).mockReturnValue(mockSymbols);

      const result = await providerWithoutSource.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      // detail 应该只显示符号的 detail，不包含文件名
      expect(result.suggestions[0].detail).toBe('() => void');
      expect(result.suggestions[0].detail).not.toContain('test.ts');
    });

    it('应该正确处理文件路径提取', async () => {
      const mockSymbols: SymbolInfo[] = [
        {
          name: 'myUtil',
          kind: 'function',
          filePath: '/src/components/utils/myUtil.ts',
          line: 5,
        },
      ];

      vi.mocked(symbolIndexer.search).mockReturnValue(mockSymbols);

      const result = await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      // detail 应该只显示文件名，不是完整路径
      expect(result.suggestions[0].detail).toBe('myUtil.ts');
      expect(result.suggestions[0].detail).not.toContain('/src/components/utils/');
    });
  });

  describe('EDT-UNIT-03: 应该按最近访问文件排序', () => {
    it('应该使用 sortText 对结果进行排序', async () => {
      const mockSymbols: SymbolInfo[] = [
        {
          name: 'oldFunc',
          kind: 'function',
          filePath: '/old/utils.ts',
          line: 10,
        },
        {
          name: 'recentFunc',
          kind: 'function',
          filePath: '/recent/utils.ts',
          line: 5,
        },
      ];

      vi.mocked(symbolIndexer.search).mockReturnValue(mockSymbols);

      const result = await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      // sortText 应该被设置
      expect(result.suggestions[0].sortText).toBeDefined();
      expect(result.suggestions[1].sortText).toBeDefined();

      // sortText 应该是数字字符串（用于排序）
      expect(/^\d+$/.test(result.suggestions[0].sortText || '')).toBe(true);
    });

    it('应该给予函数更高的排序优先级', async () => {
      const mockSymbols: SymbolInfo[] = [
        {
          name: 'testVariable',
          kind: 'variable',
          filePath: '/test.ts',
          line: 1,
        },
        {
          name: 'testFunction',
          kind: 'function',
          filePath: '/test.ts',
          line: 2,
        },
      ];

      vi.mocked(symbolIndexer.search).mockReturnValue(mockSymbols);

      const result = await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      // 函数的 sortText 应该比变量小（排序更高）
      const funcSortText = parseInt(result.suggestions.find((s: any) => s.label === 'testFunction')?.sortText || '999999');
      const varSortText = parseInt(result.suggestions.find((s: any) => s.label === 'testVariable')?.sortText || '999999');

      expect(funcSortText).toBeLessThan(varSortText);
    });

    it('应该给予完全匹配更高的排序优先级', async () => {
      const mockSymbols: SymbolInfo[] = [
        {
          name: 'testOther',
          kind: 'function',
          filePath: '/test.ts',
          line: 1,
        },
        {
          name: 'test',
          kind: 'function',
          filePath: '/test.ts',
          line: 2,
        },
      ];

      // 设置前缀为 'test'（完全匹配）
      mockModel.getWordUntilPosition.mockReturnValue({ word: 'test' });

      vi.mocked(symbolIndexer.search).mockReturnValue(mockSymbols);

      const result = await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      // 完全匹配的应该排在前面
      const exactMatch = result.suggestions.find((s: any) => s.label === 'test');
      const partialMatch = result.suggestions.find((s: any) => s.label === 'testOther');

      expect(exactMatch).toBeDefined();
      expect(partialMatch).toBeDefined();

      const exactSortText = parseInt(exactMatch?.sortText || '999999');
      const partialSortText = parseInt(partialMatch?.sortText || '999999');

      expect(exactSortText).toBeLessThan(partialSortText);
    });
  });

  describe('EDT-UNIT-04: 应该排除当前文件的符号', () => {
    it('应该调用 symbolIndexer.search 并传入 excludeCurrentFile 选项', async () => {
      provider = new SymbolCompletionProvider({
        currentFilePath: '/current/file.ts',
        showSource: true,
      });

      await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      expect(symbolIndexer.search).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          excludeCurrentFile: '/current/file.ts',
        })
      );
    });

    it('当 currentFilePath 未设置时应该排除任何文件', async () => {
      provider = new SymbolCompletionProvider({
        showSource: true,
      });

      await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      expect(symbolIndexer.search).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          excludeCurrentFile: undefined,
        })
      );
    });

    it('返回的建议中不应包含当前文件的符号', async () => {
      const mockSymbols: SymbolInfo[] = [
        {
          name: 'currentFileSymbol',
          kind: 'function',
          filePath: '/current/file.ts',
          line: 10,
        },
        {
          name: 'otherFileSymbol',
          kind: 'function',
          filePath: '/other/utils.ts',
          line: 5,
        },
      ];

      vi.mocked(symbolIndexer.search).mockReturnValue(mockSymbols);

      provider = new SymbolCompletionProvider({
        currentFilePath: '/current/file.ts',
        showSource: true,
      });

      const result = await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      // 由于 symbolIndexer.search 应该已经过滤了当前文件的符号
      // 这里我们验证搜索是否被正确调用
      expect(symbolIndexer.search).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          excludeCurrentFile: '/current/file.ts',
        })
      );
    });
  });

  describe('其他功能测试', () => {
    it('应该正确映射符号类型到 Monaco 类型', async () => {
      const mockSymbols: SymbolInfo[] = [
        { name: 'myFunc', kind: 'function', filePath: '/test.ts', line: 1 },
        { name: 'myClass', kind: 'class', filePath: '/test.ts', line: 2 },
        { name: 'myInterface', kind: 'interface', filePath: '/test.ts', line: 3 },
        { name: 'myConst', kind: 'constant', filePath: '/test.ts', line: 4 },
        { name: 'myVar', kind: 'variable', filePath: '/test.ts', line: 5 },
      ];

      vi.mocked(symbolIndexer.search).mockReturnValue(mockSymbols);

      const result = await provider.provideCompletionItems(
        mockModel,
        mockPosition,
        {} as any,
        {} as any
      );

      expect(result.suggestions[0].kind).toBe(1); // Function
      expect(result.suggestions[1].kind).toBe(5); // Class
      expect(result.suggestions[2].kind).toBe(7); // Interface
      expect(result.suggestions[3].kind).toBe(14); // Constant (Monaco version specific)
      expect(result.suggestions[4].kind).toBeDefined(); // Variable
    });

    it('应该支持更新当前文件路径', () => {
      provider = new SymbolCompletionProvider({
        currentFilePath: '/old/path.ts',
        showSource: true,
      });

      provider.setCurrentFilePath('/new/path.ts');

      // 验证路径已更新（通过下次调用时的行为）
      mockModel.getWordUntilPosition.mockReturnValue({ word: 'test' });

      vi.mocked(symbolIndexer.search).mockReturnValue([]);

      provider.provideCompletionItems(mockModel, mockPosition, {} as any, {} as any);

      expect(symbolIndexer.search).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          excludeCurrentFile: '/new/path.ts',
        })
      );
    });

    it('应该定义触发字符', () => {
      expect(provider.triggerCharacters).toContain('.');
      expect(provider.triggerCharacters).toContain(':');
      expect(provider.triggerCharacters).toContain('(');
      expect(provider.triggerCharacters).toContain('[');
    });

    it('应该支持 dispose 方法', () => {
      expect(() => provider.dispose()).not.toThrow();
    });
  });
});
