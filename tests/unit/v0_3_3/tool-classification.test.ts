/**
 * Unit Test: Tool Classification System (v0.3.3)
 *
 * 测试三层工具分类系统：
 * - Layer 1: 精确匹配 (<1ms)
 * - Layer 2: 规则分类 (~5ms)
 * - Layer 3: Qwen 0.5B 推理 (~200ms)
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Types
// ============================================================================

type ClassificationLayer = 1 | 2 | 3;

interface ToolClassificationResult {
  layer: ClassificationLayer;
  category: ToolCategory;
  tool?: string;
  confidence: number;
  match_type?: 'exact_command' | 'slash_command' | 'agent_function' | 'keyword' | 'llm';
  latency_ms?: number;
}

type ToolCategory =
  | 'file_operations'
  | 'code_generation'
  | 'code_analysis'
  | 'terminal_commands'
  | 'ai_chat'
  | 'search_operations'
  | 'no_tool_needed';

// ============================================================================
// Mock Implementation (待实现后替换为真实导入)
// ============================================================================

/**
 * 工具分类函数（模拟实现）
 * TODO: 替换为真实的 classifyTool 实现
 */
function classifyTool(input: string): ToolClassificationResult {
  // 这是占位实现，真实实现将在 Rust 后端
  const start = performance.now();

  // Layer 1: 精确匹配
  if (input.startsWith('/')) {
    return {
      layer: 1,
      category: 'file_operations',
      tool: 'agent_read_file',
      confidence: 1.0,
      match_type: 'slash_command',
      latency_ms: performance.now() - start
    };
  }

  // Layer 2: 规则匹配
  if (input.includes('读取') || input.includes('打开')) {
    return {
      layer: 2,
      category: 'file_operations',
      confidence: 0.9,
      match_type: 'keyword',
      latency_ms: performance.now() - start
    };
  }

  // Layer 3: LLM 推理
  return {
    layer: 3,
    category: 'ai_chat',
    confidence: 0.8,
    match_type: 'llm',
    latency_ms: performance.now() - start
  };
}

// ============================================================================
// Layer 1: Exact Match Tests
// ============================================================================

describe('Tool Classification - Layer 1: Exact Match', () => {
  describe('Slash Command Patterns', () => {
    it('should match /read commands', () => {
      const result = classifyTool('/read src/App.tsx');
      expect(result.layer).toBe(1);
      expect(result.tool).toBe('agent_read_file');
      expect(result.confidence).toBe(1.0);
      expect(result.match_type).toBe('slash_command');
      expect(result.latency_ms).toBeLessThan(5);
    });

    it('should match /explore commands', () => {
      const result = classifyTool('/explore src/components');
      expect(result.layer).toBe(1);
      expect(result.tool).toBe('agent_list_dir');
      expect(result.confidence).toBe(1.0);
      expect(result.latency_ms).toBeLessThan(5);
    });

    it('should match /list commands', () => {
      const result = classifyTool('/list tests');
      expect(result.layer).toBe(1);
      expect(result.tool).toBe('agent_list_dir');
      expect(result.confidence).toBe(1.0);
    });

    it('should match /help command', () => {
      const result = classifyTool('/help');
      expect(result.layer).toBe(1);
      expect(result.category).toBe('ai_chat');
    });
  });

  describe('agent_xxx() Function Patterns', () => {
    it('should match agent_read_file() format', () => {
      const result = classifyTool('agent_read_file(rel_path="README.md")');
      expect(result.layer).toBe(1);
      expect(result.tool).toBe('agent_read_file');
      expect(result.confidence).toBe(1.0);
      expect(result.match_type).toBe('agent_function');
    });

    it('should match agent_list_dir() format', () => {
      const result = classifyTool('agent_list_dir(rel_path="src")');
      expect(result.layer).toBe(1);
      expect(result.tool).toBe('agent_list_dir');
      expect(result.confidence).toBe(1.0);
    });

    it('should match agent_write_file() format', () => {
      const result = classifyTool('agent_write_file(rel_path="test.txt", content="hello")');
      expect(result.layer).toBe(1);
      expect(result.tool).toBe('agent_write_file');
      expect(result.confidence).toBe(1.0);
    });

    it('should handle multiple arguments', () => {
      const result = classifyTool('agent_search(query="useState", scope="src")');
      expect(result.layer).toBe(1);
      expect(result.tool).toBe('agent_search');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('Pure Command Patterns', () => {
    const pureCommands = [
      { input: 'ls', expected_tool: 'bash' },
      { input: 'ls -la', expected_tool: 'bash' },
      { input: 'pwd', expected_tool: 'bash' },
      { input: 'cd src', expected_tool: 'bash' },
      { input: 'git status', expected_tool: 'bash' },
      { input: 'git log', expected_tool: 'bash' },
      { input: 'git diff', expected_tool: 'bash' },
      { input: 'npm run dev', expected_tool: 'bash' },
      { input: 'npm test', expected_tool: 'bash' },
      { input: 'npm install', expected_tool: 'bash' },
      { input: 'yarn build', expected_tool: 'bash' },
      { input: 'pnpm test', expected_tool: 'bash' },
      { input: 'cargo build', expected_tool: 'bash' },
      { input: 'cargo test', expected_tool: 'bash' },
      { input: 'cargo run', expected_tool: 'bash' },
      { input: 'node script.js', expected_tool: 'bash' },
      { input: 'python main.py', expected_tool: 'bash' },
      { input: 'python3 -m pip install', expected_tool: 'bash' },
    ];

    pureCommands.forEach(({ input, expected_tool }) => {
      it(`should classify "${input}" as bash`, () => {
        const result = classifyTool(input);
        expect(result.layer).toBe(1);
        expect(result.tool).toBe(expected_tool);
        expect(result.confidence).toBe(1.0);
        expect(result.match_type).toBe('exact_command');
        expect(result.latency_ms).toBeLessThan(5);
      });
    });
  });

  describe('Layer 1 Performance', () => {
    it('should complete all Layer 1 classifications in <5ms', () => {
      const inputs = ['/read file.txt', 'agent_read_file(rel_path="x")', 'ls'];
      const latencies: number[] = [];

      inputs.forEach(input => {
        const result = classifyTool(input);
        if (result.layer === 1 && result.latency_ms !== undefined) {
          latencies.push(result.latency_ms);
        }
      });

      const maxLatency = Math.max(...latencies);
      expect(maxLatency).toBeLessThan(5);
    });
  });
});

// ============================================================================
// Layer 2: Rule-Based Tests
// ============================================================================

describe('Tool Classification - Layer 2: Rule-Based', () => {
  describe('File Operations Keywords', () => {
    const fileOpsTests = [
      { input: '读取 README.md', expected: 'file_operations' },
      { input: '打开 config.json', expected: 'file_operations' },
      { input: '查看 src/index.ts', expected: 'file_operations' },
      { input: '查看文件', expected: 'file_operations' },
      { input: '保存文件', expected: 'file_operations' },
      { input: 'read package.json', expected: 'file_operations' },
      { input: 'open .env', expected: 'file_operations' },
      { input: 'view src/App.tsx', expected: 'file_operations' },
      { input: 'save this file', expected: 'file_operations' },
      { input: '重命名文件', expected: 'file_operations' },
      { input: 'rename file.txt', expected: 'file_operations' },
      { input: '删除文件', expected: 'file_operations' },
      { input: 'delete file.txt', expected: 'file_operations' },
    ];

    fileOpsTests.forEach(({ input, expected }) => {
      it(`should classify "${input}" as ${expected}`, () => {
        const result = classifyTool(input);
        expect(result.layer).toBe(2);
        expect(result.category).toBe(expected);
        expect(result.match_type).toBe('keyword');
        expect(result.confidence).toBeGreaterThan(0.7);
        expect(result.latency_ms).toBeLessThan(20);
      });
    });
  });

  describe('Terminal Commands Keywords', () => {
    const terminalTests = [
      { input: '执行 git log', expected: 'terminal_commands' },
      { input: '运行 npm install', expected: 'terminal_commands' },
      { input: '执行 cargo test', expected: 'terminal_commands' },
      { input: 'git diff', expected: 'terminal_commands' },
      { input: 'npm run build', expected: 'terminal_commands' },
      { input: '运行测试', expected: 'terminal_commands' },
      { input: '构建项目', expected: 'terminal_commands' },
      { input: 'install dependencies', expected: 'terminal_commands' },
      { input: 'yarn add react', expected: 'terminal_commands' },
      { input: 'pnpm install', expected: 'terminal_commands' },
    ];

    terminalTests.forEach(({ input, expected }) => {
      it(`should classify "${input}" as ${expected}`, () => {
        const result = classifyTool(input);
        expect(result.layer).toBe(2);
        expect(result.category).toBe(expected);
        expect(result.match_type).toBe('keyword');
      });
    });
  });

  describe('Code Generation Keywords', () => {
    const codeGenTests = [
      { input: '生成一个函数', expected: 'code_generation' },
      { input: '帮我写个组件', expected: 'code_generation' },
      { input: '创建一个类', expected: 'code_generation' },
      { input: 'generate code', expected: 'code_generation' },
      { input: 'write a function', expected: 'code_generation' },
      { input: 'create component', expected: 'code_generation' },
      { input: '重构这段代码', expected: 'code_generation' },
      { input: 'optimize function', expected: 'code_generation' },
    ];

    codeGenTests.forEach(({ input, expected }) => {
      it(`should classify "${input}" as ${expected}`, () => {
        const result = classifyTool(input);
        expect(result.layer).toBe(2);
        expect(result.category).toBe(expected);
      });
    });
  });

  describe('Code Analysis Keywords', () => {
    const analysisTests = [
      { input: '解释这段代码', expected: 'code_analysis' },
      { input: '分析性能', expected: 'code_analysis' },
      { input: '检查错误', expected: 'code_analysis' },
      { input: 'explain this code', expected: 'code_analysis' },
      { input: 'analyze performance', expected: 'code_analysis' },
      { input: 'find bugs', expected: 'code_analysis' },
    ];

    analysisTests.forEach(({ input, expected }) => {
      it(`should classify "${input}" as ${expected}`, () => {
        const result = classifyTool(input);
        expect(result.layer).toBeGreaterThanOrEqual(2);
        expect(result.category).toBe(expected);
      });
    });
  });

  describe('Search Operations Keywords', () => {
    const searchTests = [
      { input: '查找所有 useState', expected: 'search_operations' },
      { input: '搜索 auth 相关代码', expected: 'search_operations' },
      { input: '定位这个函数', expected: 'search_operations' },
      { input: 'find all references', expected: 'search_operations' },
      { input: 'search for imports', expected: 'search_operations' },
      { input: 'locate this function', expected: 'search_operations' },
    ];

    searchTests.forEach(({ input, expected }) => {
      it(`should classify "${input}" as ${expected}`, () => {
        const result = classifyTool(input);
        expect(result.layer).toBeGreaterThanOrEqual(2);
        expect(result.category).toBe(expected);
      });
    });
  });

  describe('AI Chat Keywords', () => {
    const chatTests = [
      { input: '什么是闭包？', expected: 'ai_chat' },
      { input: '解释 TypeScript', expected: 'ai_chat' },
      { input: '如何使用 Hook', expected: 'ai_chat' },
      { input: 'what is a closure', expected: 'ai_chat' },
      { input: 'explain typescript', expected: 'ai_chat' },
      { input: 'how to use hooks', expected: 'ai_chat' },
    ];

    chatTests.forEach(({ input, expected }) => {
      it(`should classify "${input}" as ${expected}`, () => {
        const result = classifyTool(input);
        expect(result.layer).toBeGreaterThanOrEqual(2);
        expect(result.category).toBe(expected);
      });
    });
  });

  describe('Layer 2 Performance', () => {
    it('should complete all Layer 2 classifications in <20ms', () => {
      const inputs = ['读取文件', '执行 git', '生成代码'];
      const latencies: number[] = [];

      inputs.forEach(input => {
        const result = classifyTool(input);
        if (result.layer === 2 && result.latency_ms !== undefined) {
          latencies.push(result.latency_ms);
        }
      });

      const maxLatency = Math.max(...latencies);
      expect(maxLatency).toBeLessThan(20);
    });
  });
});

// ============================================================================
// Layer 3: Qwen LLM Tests
// ============================================================================

describe('Tool Classification - Layer 3: Qwen LLM', () => {
  describe('Complex Queries Requiring LLM', () => {
    it('should classify complex analysis queries', () => {
      const complexInput = '帮我分析一下这个项目的架构，看看有什么可以优化的地方';
      const result = classifyTool(complexInput);
      expect(result.layer).toBe(3);
      expect(result.match_type).toBe('llm');
      expect(['code_analysis', 'ai_chat']).toContain(result.category);
    });

    it('should classify ambiguous queries', () => {
      const ambiguousInput = '检查一下';
      const result = classifyTool(ambiguousInput);
      expect(result.layer).toBeGreaterThanOrEqual(2);
    });

    it('should classify context-dependent queries', () => {
      const contextInput = '这个文件有什么问题';
      const result = classifyTool(contextInput);
      expect(result.layer).toBe(3);
      expect(['code_analysis', 'file_operations']).toContain(result.category);
    });

    it('should classify multi-intent queries', () => {
      const multiIntentInput = '读取 package.json 然后分析依赖';
      const result = classifyTool(multiIntentInput);
      expect(result.layer).toBeGreaterThanOrEqual(2);
    });
  });

  describe('LLM Confidence Levels', () => {
    it('should return confidence score for LLM classifications', () => {
      const result = classifyTool('分析代码结构');
      if (result.layer === 3) {
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Layer 3 Performance', () => {
    it('should complete LLM classification in <300ms', () => {
      const complexInput = '分析这个项目的性能瓶颈';
      const result = classifyTool(complexInput);

      if (result.layer === 3 && result.latency_ms !== undefined) {
        expect(result.latency_ms).toBeLessThan(300);
      }
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Tool Classification - Edge Cases', () => {
  describe('Empty and Invalid Input', () => {
    it('should handle empty input', () => {
      const result = classifyTool('');
      expect(result.category).toBe('ai_chat');
    });

    it('should handle whitespace-only input', () => {
      const result = classifyTool('   ');
      expect(result.category).toBe('ai_chat');
    });

    it('should handle very short input', () => {
      const result = classifyTool('x');
      expect(result.layer).toBeGreaterThanOrEqual(2);
    });

    it('should handle special characters', () => {
      const result = classifyTool('???');
      expect(result).toBeDefined();
    });
  });

  describe('Long Input', () => {
    it('should handle very long input', () => {
      const longInput = '分析' + 'x'.repeat(1000);
      const result = classifyTool(longInput);
      expect(result).toBeDefined();
    });
  });

  describe('Mixed Language Input', () => {
    it('should handle mixed Chinese-English input', () => {
      const result = classifyTool('read the README file 文件');
      expect(result).toBeDefined();
    });

    it('should handle code snippets', () => {
      const codeInput = '分析这段代码: function hello() { return "world"; }';
      const result = classifyTool(codeInput);
      expect(['code_analysis', 'code_generation']).toContain(result.category);
    });
  });
});

// ============================================================================
// Priority and Fallback
// ============================================================================

describe('Tool Classification - Priority and Fallback', () => {
  it('should prioritize Layer 1 over Layer 2', () => {
    // "/read" could match both Layer 1 (slash command) and Layer 2 (keyword "read")
    const result = classifyTool('/read file.txt');
    expect(result.layer).toBe(1);
  });

  it('should prioritize exact matches over partial matches', () => {
    const result = classifyTool('ls');
    expect(result.layer).toBe(1);
    expect(result.tool).toBe('bash');
  });
});
