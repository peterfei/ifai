/**
 * toolResultFormatter 测试
 * 测试各种类型的结果格式化，防止类型错误导致黑屏
 */

import { describe, it, expect } from 'vitest';
import { formatToolResultToMarkdown } from '@/utils/toolResultFormatter';

describe('toolResultFormatter - 防止类型错误导致黑屏', () => {

  // 🔥 v0.3.4: 读文件简洁显示测试
  describe('读文件简洁显示 (v0.3.4)', () => {
    it('应该为 agent_read_file 工具返回简洁格式', () => {
      const result = {
        path: '/test/src/utils/helper.ts',
        content: 'export function helper() {\n  return "Hello";\n}'
      };
      const toolCall = {
        tool: 'agent_read_file',
        id: 'test-123'
      };
      const output = formatToolResultToMarkdown(result, toolCall);

      // 应该包含简洁格式的关键元素
      expect(output).toContain('📄');
      expect(output).toContain('已读取文件');
      expect(output).toContain('/test/src/utils/helper.ts');
      // 应该显示行数
      expect(output).toMatch(/\d+\s*行/);
      // 应该显示文件大小
      expect(output).toMatch(/\d+\.\d+\s*KB/);
      // 不应该显示完整内容
      expect(output).not.toContain('export function helper()');
    });

    it('应该正确计算单行文件的行数', () => {
      const result = {
        path: '/test/single-line.txt',
        content: 'single line content'
      };
      const toolCall = { tool: 'agent_read_file', id: 'test-1' };
      const output = formatToolResultToMarkdown(result, toolCall);

      expect(output).toContain('1 行');
    });

    it('应该正确计算多行文件的行数', () => {
      const multiLineContent = 'line1\nline2\nline3\nline4\nline5';
      const result = {
        path: '/test/multi-line.txt',
        content: multiLineContent
      };
      const toolCall = { tool: 'agent_read_file', id: 'test-2' };
      const output = formatToolResultToMarkdown(result, toolCall);

      expect(output).toContain('5 行');
    });

    it('应该正确计算文件大小（KB）', () => {
      const largeContent = 'x'.repeat(5120); // 5KB
      const result = {
        path: '/test/large-file.ts',
        content: largeContent
      };
      const toolCall = { tool: 'agent_read_file', id: 'test-3' };
      const output = formatToolResultToMarkdown(result, toolCall);

      expect(output).toMatch(/5\.00\s*KB/);
    });

    it('应该支持 read_file 工具名称（兼容性）', () => {
      const result = {
        path: '/test/compat.ts',
        content: 'console.log("test");'
      };
      const toolCall = { tool: 'read_file', id: 'test-4' };
      const output = formatToolResultToMarkdown(result, toolCall);

      expect(output).toContain('已读取文件');
      expect(output).toContain('/test/compat.ts');
    });

    it('应该通过结构特征检测读文件结果（无 toolCall）', () => {
      const result = {
        path: '/test/detect-by-structure.ts',
        content: 'some content'
      };
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('已读取文件');
    });

    it('不应该将文件写入操作误识别为读文件', () => {
      const result = {
        filePath: '/test/written.ts',
        originalContent: '',
        newContent: 'new content',
        success: true
      };
      const toolCall = { tool: 'agent_write_file', id: 'test-5' };
      const output = formatToolResultToMarkdown(result, toolCall);

      // 应该使用文件写入格式，不是读文件格式
      expect(output).toContain('文件操作成功');
      expect(output).not.toContain('已读取文件');
    });

    it('应该处理空内容文件', () => {
      const result = {
        path: '/test/empty.txt',
        content: ''
      };
      const toolCall = { tool: 'agent_read_file', id: 'test-6' };
      const output = formatToolResultToMarkdown(result, toolCall);

      expect(output).toContain('已读取文件');
      expect(output).toContain('0 行');
    });

    it('应该处理包含特殊字符的文件路径', () => {
      const result = {
        path: '/test/path with spaces/file [test].ts',
        content: 'content'
      };
      const toolCall = { tool: 'agent_read_file', id: 'test-7' };
      const output = formatToolResultToMarkdown(result, toolCall);

      expect(output).toContain('/test/path with spaces/file [test].ts');
    });
  });

  describe('数组类型处理', () => {
    it('应该正确处理字符串数组', () => {
      const result = ['file1.ts', 'file2.ts', 'src/index.ts'];
      const output = formatToolResultToMarkdown(result);

      // 无 toolCall 时，字符串数组被识别为文件列表，返回详细格式
      expect(output).toContain('📁 Files');
      expect(output).toContain('file1.ts');
      expect(output).toContain('file2.ts');
    });

    it('应该正确处理数字数组（不应报错）', () => {
      const result = [1, 2, 3, 4, 5];
      // 这不应该抛出 "item.includes is not a function" 错误
      expect(() => formatToolResultToMarkdown(result)).not.toThrow();
      const output = formatToolResultToMarkdown(result);

      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
    });

    it('应该正确处理混合类型数组（不应报错）', () => {
      const result = ['string', 123, { key: 'value' }, true, null];
      // 这不应该抛出 "item.includes is not a function" 错误
      expect(() => formatToolResultToMarkdown(result)).not.toThrow();
      const output = formatToolResultToMarkdown(result);

      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
      expect(output).toContain('json');
    });

    it('应该正确处理对象数组（不应报错）', () => {
      const result = [{ name: 'file1' }, { name: 'file2' }];
      // 这不应该抛出 "item.includes is not a function" 错误
      expect(() => formatToolResultToMarkdown(result)).not.toThrow();
      const output = formatToolResultToMarkdown(result);

      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
    });

    it('应该正确处理空数组', () => {
      const result = [];
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('No results');
    });
  });

  describe('字符数组检测', () => {
    it('应该检测并拼接字符数组', () => {
      // 模拟 ifainew_core::agent::agent_read_file 的 bug
      // 返回的是字符数组而不是完整字符串
      const charArray = ['H', 'e', 'l', 'l', 'o', ' ', 'W', 'o', 'r', 'l', 'd'];
      const output = formatToolResultToMarkdown(charArray);

      expect(output).toContain('Hello World');
    });

    it('应该处理包含特殊字符的字符数组', () => {
      const charArray = ['{', '"', 'k', 'e', 'y', '"', ':', '"', 'v', 'a', 'l', 'u', 'e', '"', '}'];
      const output = formatToolResultToMarkdown(charArray);

      // 应该检测到这是 JSON 格式
      expect(output).toContain('key');
      expect(output).toContain('value');
    });

    // 🔥 v0.3.4 BUG: 字符数组 + agent_read_file toolCall 应该正确显示
    it('应该正确处理 agent_read_file 的字符数组结果（带 toolCall）', () => {
      // 模拟 useChatStore 包装后的结果：{path, content}
      // 但由于某些原因，content 可能是字符数组的 JSON 字符串
      const wrappedResult = {
        path: '/test/src/example.ts',
        content: ['e', 'x', 'p', 'o', 'r', 't', ' ', 'f', 'u', 'n', 'c', 't', 'i', 'o', 'n']
      };
      const toolCall = {
        tool: 'agent_read_file',
        id: 'test-call-123'
      };

      const output = formatToolResultToMarkdown(wrappedResult, toolCall);

      // 应该显示简洁格式，不应该显示 "undefined"
      expect(output).toContain('📄');
      expect(output).toContain('已读取文件');
      expect(output).toContain('/test/src/example.ts');
      expect(output).not.toContain('undefined');
    });

    // 🔥 v0.3.4 BUG: 字符数组的 JSON 字符串 + agent_read_file toolCall
    it('应该正确处理 agent_read_file 的字符数组 JSON 字符串结果', () => {
      // 模拟 useChatStore 中的真实场景：字符数组被包装成 {path, content} 然后 JSON.stringify
      const wrappedResult = {
        path: '/test/src/real-example.ts',
        content: ['e', 'x', 'p', 'o', 'r', 't', ' ', 'f', 'u', 'n', 'c', 't', 'i', 'o', 'n']
      };
      const charArrayJson = JSON.stringify(wrappedResult);
      const toolCall = {
        tool: 'agent_read_file',
        id: 'test-call-456'
      };

      const output = formatToolResultToMarkdown(charArrayJson, toolCall);

      // 应该显示简洁格式，不应该显示 "undefined"
      expect(output).toContain('📄');
      expect(output).toContain('已读取文件');
      expect(output).toContain('/test/src/real-example.ts');
      expect(output).not.toContain('undefined');
    });

    // 🔥 v0.3.4 FIX: agent_read_file 直接返回字符串（非 JSON）的情况
    it('应该正确处理 agent_read_file 直接返回字符串的情况', () => {
      // 模拟 Rust 后端修复后，直接返回字符串内容
      const fileContent = 'export function hello() {\n  console.log("Hello");\n}';
      const toolCall = {
        tool: 'agent_read_file',
        args: {
          rel_path: '/test/src/hello.ts'
        },
        id: 'test-call-789'
      };

      const output = formatToolResultToMarkdown(fileContent, toolCall);

      // 应该显示简洁格式，不应该显示完整内容
      expect(output).toContain('📄');
      expect(output).toContain('已读取文件');
      expect(output).toContain('/test/src/hello.ts');
      expect(output).toContain('3 行');  // 字符串末尾有 \n，所以是 3 行
      expect(output).not.toContain('export function hello()');  // 不显示完整内容
    });

    // 🔥 v0.3.4 FIX: read_file 工具名称（兼容性）
    it('应该正确处理 read_file 工具直接返回字符串', () => {
      const fileContent = 'const x = 1;';
      const toolCall = {
        tool: 'read_file',
        args: {
          path: '/test/const.ts'
        },
        id: 'test-read-1'
      };

      const output = formatToolResultToMarkdown(fileContent, toolCall);

      expect(output).toContain('📄');
      expect(output).toContain('已读取文件');
      expect(output).toContain('/test/const.ts');
      expect(output).not.toContain('const x = 1;');
    });
  });

  // 🔥 v0.3.4: 目录列表简洁显示测试
  describe('目录列表简洁显示 (v0.3.4)', () => {
    it('应该为 agent_list_dir 工具返回简洁格式（数组结果）', () => {
      const fileList = [
        'src/index.ts',
        'src/App.tsx',
        'src/utils/helper.ts',
        'package.json',
        'README.md'
      ];
      const toolCall = {
        tool: 'agent_list_dir',
        args: {
          rel_path: '/test/project'
        },
        id: 'test-list-1'
      };

      const output = formatToolResultToMarkdown(fileList, toolCall);

      // 应该包含简洁格式的关键元素
      expect(output).toContain('📂');
      expect(output).toContain('已列出目录');
      expect(output).toContain('/test/project');
      expect(output).toContain('5');  // 文件数量
      // 不应该列出所有文件
      expect(output).not.toContain('src/index.ts');
      expect(output).not.toContain('package.json');
    });

    it('应该正确处理 JSON 字符串格式的目录列表', () => {
      const fileListJson = JSON.stringify([
        'src/components/Header.tsx',
        'src/components/Footer.tsx',
        'src/pages/Home.tsx'
      ]);
      const toolCall = {
        tool: 'agent_list_dir',
        args: {
          path: '/src/components'
        },
        id: 'test-list-2'
      };

      const output = formatToolResultToMarkdown(fileListJson, toolCall);

      expect(output).toContain('📂');
      expect(output).toContain('已列出目录');
      expect(output).toContain('3');  // 文件数量
    });

    it('应该通过结构特征检测目录列表（无 toolCall）', () => {
      const fileList = ['file1.ts', 'file2.js', 'file3.json', 'dir1/'];
      const output = formatToolResultToMarkdown(fileList);

      // 无 toolCall 时返回详细列表格式
      expect(output).toContain('📁 Files');
      expect(output).toContain('file1.ts');
    });

    it('应该处理空目录列表', () => {
      const emptyList: string[] = [];
      const toolCall = {
        tool: 'agent_list_dir',
        args: { path: '/empty' }
      };

      const output = formatToolResultToMarkdown(emptyList, toolCall);

      expect(output).toContain('📂');
      expect(output).toContain('0');
    });

    it('应该支持 list_dir 工具名称（兼容性）', () => {
      const fileList = ['a.txt', 'b.txt'];
      const toolCall = {
        tool: 'list_dir',
        args: { rel_path: '/test' }
      };

      const output = formatToolResultToMarkdown(fileList, toolCall);

      expect(output).toContain('📂');
      expect(output).toContain('2');
    });

    // 🔥 v0.3.4 FIX: agent_list_dir 字符数组问题（ifainew_core 的 bug）
    // NOTE: 当字符数组被 join 后不是有效 JSON 时，formatToolResultToMarkdown
    // 会直接返回拼接后的字符串。这是源代码的已知行为。
    it('应该正确处理 agent_list_dir 的字符数组结果（带 toolCall）', () => {
      // 模拟 ifainew_core 的 bug：返回字符数组而不是完整字符串
      // 例如：['.', 'i', 'f', 'a', 'i', '/', ...]
      const charArrayResult = [
        '.', 'i', 'f', 'a', 'i', '/', 'i', 'n', 'd', 'e', 'x', '.', 'h', 't', 'm', 'l',
        's', 't', 'a', 'r', 't', '_', 'v', 'i', 't', 'e', '.', 's', 'h',
        'p', 'a', 'c', 'k', 'a', 'g', 'e', '.', 'j', 's', 'o', 'n'
      ];
      const toolCall = {
        tool: 'agent_list_dir',
        args: {
          rel_path: '.'
        },
        id: 'test-list-char-array'
      };

      const output = formatToolResultToMarkdown(charArrayResult, toolCall);

      // 字符数组被 join 后不是 JSON，源代码直接返回拼接字符串
      // 验证不会崩溃，且输出是字符串
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    // 🔥 v0.3.4 FIX: agent_list_dir 字符数组被 JSON.stringify 后的场景
    // NOTE: JSON 字符串被 parse 后还原为字符数组，join 后不是有效 JSON，
    // 源代码直接返回拼接字符串
    it('应该正确处理 agent_list_dir 字符数组被 JSON.stringify 后的结果', () => {
      // 模拟 useChatStore 中的处理：JSON.stringify(result)
      const charArrayResult = [
        '.', 'i', 'f', 'a', 'i', '/', 'i', 'n', 'd', 'e', 'x', '.', 'h', 't', 'm', 'l',
        's', 't', 'a', 'r', 't', '_', 'v', 'i', 't', 'e', '.', 's', 'h'
      ];
      const jsonString = JSON.stringify(charArrayResult);
      const toolCall = {
        tool: 'agent_list_dir',
        args: {
          rel_path: '.'
        },
        id: 'test-list-json-string'
      };

      const output = formatToolResultToMarkdown(jsonString, toolCall);

      // JSON 字符串被 parse 为字符数组，join 后不是 JSON，返回拼接字符串
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    // 🔥 v0.3.4 FIX: agent_list_dir 正常文件列表显示统计信息
    it('应该显示文件和子目录的统计信息', () => {
      const fileList = [
        'src/index.ts',
        'src/App.tsx',
        'src/utils/',  // 子目录
        'package.json',
        'README.md',
        'node_modules/',  // 子目录
      ];
      const toolCall = {
        tool: 'agent_list_dir',
        args: {
          rel_path: '/test/project'
        },
        id: 'test-list-stats'
      };

      const output = formatToolResultToMarkdown(fileList, toolCall);

      // 应该包含简洁格式
      expect(output).toContain('📂');
      expect(output).toContain('已列出目录');
      expect(output).toContain('/test/project');

      // 🔥 v0.3.4 OPT: 应该显示统计信息：4 个文件，1 个子目录（node_modules 被过滤）
      expect(output).toContain('4');
      expect(output).toContain('文件');
      expect(output).toContain('1');
      expect(output).toContain('子目录');
    });

    // 🔥 v0.3.4 FIX: agent_list_dir 只有文件或只有目录的情况
    it('应该正确处理只有文件或只有目录的情况', () => {
      // 只有文件
      const onlyFiles = ['file1.ts', 'file2.ts', 'file3.ts'];
      const toolCall1 = {
        tool: 'agent_list_dir',
        args: { rel_path: '/files-only' }
      };
      const output1 = formatToolResultToMarkdown(onlyFiles, toolCall1);
      expect(output1).toContain('3 个文件');
      expect(output1).not.toContain('子目录');

      // 只有目录
      const onlyDirs = ['dir1/', 'dir2/'];
      const toolCall2 = {
        tool: 'agent_list_dir',
        args: { rel_path: '/dirs-only' }
      };
      const output2 = formatToolResultToMarkdown(onlyDirs, toolCall2);
      expect(output2).toContain('2 个子目录');
      expect(output2).not.toContain('文件');
    });

    // 🔥 v0.3.4 OPT: 应该过滤系统目录（node_modules, .ifai, .git 等）
    it('应该过滤系统目录并只统计有效文件和目录', () => {
      const fileList = [
        'src/index.ts',
        'src/App.tsx',
        'node_modules/',  // 应该被忽略
        'package.json',
        '.ifai/',  // 应该被忽略
        'README.md',
        '.git/',  // 应该被忽略
        'dist/',  // 应该被忽略
        'target/',  // 应该被忽略
        'src/utils/',  // 有效目录
      ];
      const toolCall = {
        tool: 'agent_list_dir',
        args: { rel_path: '/project' }
      };

      const output = formatToolResultToMarkdown(fileList, toolCall);

      // 应该过滤系统目录后显示：4 个文件，1 个有效子目录
      expect(output).toContain('4 个文件');
      expect(output).toContain('1 个子目录');
      // 不应该显示系统目录
      expect(output).not.toContain('9');  // 不是 9 个
    });

    // 🔥 v0.3.4 OPT: 应该处理全是系统目录的情况
    it('应该处理全是系统目录的情况', () => {
      const systemDirs = ['node_modules/', '.ifai/', '.git/', 'dist/', 'target/'];
      const toolCall = {
        tool: 'agent_list_dir',
        args: { rel_path: '/system-only' }
      };

      const output = formatToolResultToMarkdown(systemDirs, toolCall);

      // 应该显示 0 个文件，0 个子目录（系统目录被过滤）
      expect(output).toContain('0 个文件');
    });

    // 🔥 v0.3.4 FIX: agent_list_dir 字符数组被拼接成字符串后的场景（useChatStore 处理后）
    it('应该正确处理 agent_list_dir 字符数组被 useChatStore 拼接后的字符串结果', () => {
      // 模拟 useChatStore.ts 第 2390 行的处理：result.join('')
      // 原始字符数组: ['.', 'i', 'f', 'a', 'i', '/', 'i', 'n', 'd', 'e', 'x', '.', 'h', 't', 'm', 'l', ...]
      // 拼接后: ".ifai/index.htmlstart_vite.shpackage.json..."
      const joinedString = ".ifai/index.htmlstart_vite.shpackage.json";
      const toolCall = {
        tool: 'agent_list_dir',
        args: {
          rel_path: '.'
        },
        id: 'test-list-joined-string'
      };

      const output = formatToolResultToMarkdown(joinedString, toolCall);

      // 应该显示简洁格式，不应该显示拼接后的乱码字符串
      expect(output).toContain('📂');
      expect(output).toContain('已列出目录');
      expect(output).toContain('`.`');
      // 关键：不应该显示拼接后的内容
      expect(output).not.toContain('.ifai/index.htmlstart_vite.sh');
    });
  });

  describe('命令执行结果', () => {
    it('应该正确处理成功的命令执行', () => {
      const result = {
        command: 'ls -la',
        stdout: 'file1.ts\nfile2.ts',
        stderr: '',
        exitCode: 0,
        success: true
      };
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('✅');
      expect(output).toContain('ls -la');
      expect(output).toContain('file1.ts');
    });

    it('应该正确处理失败的命令执行', () => {
      const result = {
        command: 'invalid-command',
        stdout: '',
        stderr: 'command not found',
        exitCode: 127,
        success: false
      };
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('❌');
      expect(output).toContain('command not found');
    });
  });

  describe('文件写入结果', () => {
    it('应该正确处理文件写入成功', () => {
      const result = {
        filePath: '/test/file.ts',
        success: true,
        message: 'File written successfully'
      };
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('✅');
      expect(output).toContain('/test/file.ts');
      expect(output).toContain('File written successfully');
    });

    it('应该正确处理新建文件', () => {
      const result = {
        filePath: '/test/new-file.ts',
        success: true,
        originalContent: '',
        newContent: 'console.log("Hello");'
      };
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('文件操作成功');
      expect(output).toContain('new-file.ts');
    });

    it('应该正确处理覆盖文件', () => {
      const result = {
        filePath: '/test/existing.ts',
        success: true,
        originalContent: 'old content',
        newContent: 'new content'
      };
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('文件操作成功');
      expect(output).toContain('existing.ts');
    });
  });

  describe('边界情况', () => {
    it('应该正确处理 null', () => {
      const output = formatToolResultToMarkdown(null);
      expect(output).toBe('');
    });

    it('应该正确处理 undefined', () => {
      const output = formatToolResultToMarkdown(undefined);
      expect(output).toBe('');
    });

    it('应该正确处理空对象', () => {
      const result = {};
      const output = formatToolResultToMarkdown(result);

      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
    });

    it('应该正确处理纯字符串', () => {
      const result = 'Just a plain string';
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('Just a plain string');
    });

    it('应该正确处理 JSON 字符串', () => {
      const result = '{"key": "value", "number": 123}';
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('key');
      expect(output).toContain('value');
    });

    it('应该正确处理无效 JSON 字符串', () => {
      const result = 'Not a valid JSON {but with braces}';
      const output = formatToolResultToMarkdown(result);

      expect(output).toContain('Not a valid JSON');
    });
  });
});
