/**
 * Test Dataset: Tool Classification System (v0.3.3)
 *
 * 包含用于工具分类系统测试的标准数据集
 */

// ============================================================================
// Types
// ============================================================================

export type ToolCategory =
  | 'file_operations'
  | 'code_generation'
  | 'code_analysis'
  | 'terminal_commands'
  | 'ai_chat'
  | 'search_operations'
  | 'no_tool_needed';

export interface ClassificationTestCase {
  input: string;
  expected: ToolCategory;
  expectedLayer?: 1 | 2 | 3;
  description?: string;
  tags?: string[];
}

export interface CategoryDataset {
  cases: ClassificationTestCase[];
  expectedAccuracy: number;
  description: string;
}

// ============================================================================
// Layer 1: Exact Match Dataset (100% expected accuracy)
// ============================================================================

export const exactMatchDataset: CategoryDataset = {
  description: 'Layer 1: 精确匹配 - 命令格式、函数调用、纯命令',
  expectedAccuracy: 1.0,
  cases: [
    // Slash Commands
    { input: '/read', expected: 'file_operations', expectedLayer: 1, description: 'Read command', tags: ['slash'] },
    { input: '/read file.txt', expected: 'file_operations', expectedLayer: 1, description: 'Read with path', tags: ['slash'] },
    { input: '/explore', expected: 'file_operations', expectedLayer: 1, description: 'Explore command', tags: ['slash'] },
    { input: '/explore src', expected: 'file_operations', expectedLayer: 1, description: 'Explore with path', tags: ['slash'] },
    { input: '/list', expected: 'file_operations', expectedLayer: 1, description: 'List command', tags: ['slash'] },
    { input: '/list tests', expected: 'file_operations', expectedLayer: 1, description: 'List with path', tags: ['slash'] },
    { input: '/help', expected: 'ai_chat', expectedLayer: 1, description: 'Help command', tags: ['slash'] },

    // Agent Functions
    { input: 'agent_read_file(rel_path="README.md")', expected: 'file_operations', expectedLayer: 1, description: 'Read file function', tags: ['function'] },
    { input: 'agent_list_dir(rel_path="src")', expected: 'file_operations', expectedLayer: 1, description: 'List dir function', tags: ['function'] },
    { input: 'agent_write_file(rel_path="test.txt", content="hello")', expected: 'file_operations', expectedLayer: 1, description: 'Write file function', tags: ['function'] },
    { input: 'agent_search(query="test")', expected: 'search_operations', expectedLayer: 1, description: 'Search function', tags: ['function'] },

    // Pure Commands
    { input: 'ls', expected: 'terminal_commands', expectedLayer: 1, description: 'List files', tags: ['bash'] },
    { input: 'ls -la', expected: 'terminal_commands', expectedLayer: 1, description: 'List detailed', tags: ['bash'] },
    { input: 'pwd', expected: 'terminal_commands', expectedLayer: 1, description: 'Print directory', tags: ['bash'] },
    { input: 'cd src', expected: 'terminal_commands', expectedLayer: 1, description: 'Change directory', tags: ['bash'] },

    // Git Commands
    { input: 'git status', expected: 'terminal_commands', expectedLayer: 1, description: 'Git status', tags: ['git', 'bash'] },
    { input: 'git log', expected: 'terminal_commands', expectedLayer: 1, description: 'Git log', tags: ['git', 'bash'] },
    { input: 'git diff', expected: 'terminal_commands', expectedLayer: 1, description: 'Git diff', tags: ['git', 'bash'] },
    { input: 'git add .', expected: 'terminal_commands', expectedLayer: 1, description: 'Git add', tags: ['git', 'bash'] },
    { input: 'git commit -m "message"', expected: 'terminal_commands', expectedLayer: 1, description: 'Git commit', tags: ['git', 'bash'] },

    // NPM Commands
    { input: 'npm run dev', expected: 'terminal_commands', expectedLayer: 1, description: 'NPM run dev', tags: ['npm', 'bash'] },
    { input: 'npm test', expected: 'terminal_commands', expectedLayer: 1, description: 'NPM test', tags: ['npm', 'bash'] },
    { input: 'npm install', expected: 'terminal_commands', expectedLayer: 1, description: 'NPM install', tags: ['npm', 'bash'] },
    { input: 'npm run build', expected: 'terminal_commands', expectedLayer: 1, description: 'NPM build', tags: ['npm', 'bash'] },

    // Yarn Commands
    { input: 'yarn dev', expected: 'terminal_commands', expectedLayer: 1, description: 'Yarn dev', tags: ['yarn', 'bash'] },
    { input: 'yarn build', expected: 'terminal_commands', expectedLayer: 1, description: 'Yarn build', tags: ['yarn', 'bash'] },
    { input: 'yarn add react', expected: 'terminal_commands', expectedLayer: 1, description: 'Yarn add', tags: ['yarn', 'bash'] },

    // PNPM Commands
    { input: 'pnpm install', expected: 'terminal_commands', expectedLayer: 1, description: 'PNPM install', tags: ['pnpm', 'bash'] },
    { input: 'pnpm test', expected: 'terminal_commands', expectedLayer: 1, description: 'PNPM test', tags: ['pnpm', 'bash'] },

    // Cargo Commands
    { input: 'cargo build', expected: 'terminal_commands', expectedLayer: 1, description: 'Cargo build', tags: ['cargo', 'bash'] },
    { input: 'cargo test', expected: 'terminal_commands', expectedLayer: 1, description: 'Cargo test', tags: ['cargo', 'bash'] },
    { input: 'cargo run', expected: 'terminal_commands', expectedLayer: 1, description: 'Cargo run', tags: ['cargo', 'bash'] },
    { input: 'cargo check', expected: 'terminal_commands', expectedLayer: 1, description: 'Cargo check', tags: ['cargo', 'bash'] },

    // Node/Python Commands
    { input: 'node script.js', expected: 'terminal_commands', expectedLayer: 1, description: 'Node script', tags: ['node', 'bash'] },
    { input: 'python main.py', expected: 'terminal_commands', expectedLayer: 1, description: 'Python script', tags: ['python', 'bash'] },
    { input: 'python3 -m pip install', expected: 'terminal_commands', expectedLayer: 1, description: 'Python3 pip', tags: ['python', 'bash'] },
  ]
};

// ============================================================================
// Layer 2: Rule-Based Dataset (90%+ expected accuracy)
// ============================================================================

export const ruleBasedDataset: CategoryDataset = {
  description: 'Layer 2: 规则匹配 - 关键词、模式匹配',
  expectedAccuracy: 0.90,
  cases: [
    // File Operations Keywords (Chinese)
    { input: '读取文件', expected: 'file_operations', expectedLayer: 2, description: 'Read (CN)', tags: ['keyword', 'file'] },
    { input: '打开配置', expected: 'file_operations', expectedLayer: 2, description: 'Open (CN)', tags: ['keyword', 'file'] },
    { input: '查看代码', expected: 'file_operations', expectedLayer: 2, description: 'View (CN)', tags: ['keyword', 'file'] },
    { input: '保存修改', expected: 'file_operations', expectedLayer: 2, description: 'Save (CN)', tags: ['keyword', 'file'] },
    { input: '重命名文件', expected: 'file_operations', expectedLayer: 2, description: 'Rename (CN)', tags: ['keyword', 'file'] },
    { input: '删除文件', expected: 'file_operations', expectedLayer: 2, description: 'Delete (CN)', tags: ['keyword', 'file'] },

    // File Operations Keywords (English)
    { input: 'read file', expected: 'file_operations', expectedLayer: 2, description: 'Read (EN)', tags: ['keyword', 'file'] },
    { input: 'open file', expected: 'file_operations', expectedLayer: 2, description: 'Open (EN)', tags: ['keyword', 'file'] },
    { input: 'view file', expected: 'file_operations', expectedLayer: 2, description: 'View (EN)', tags: ['keyword', 'file'] },
    { input: 'save file', expected: 'file_operations', expectedLayer: 2, description: 'Save (EN)', tags: ['keyword', 'file'] },
    { input: 'rename file', expected: 'file_operations', expectedLayer: 2, description: 'Rename (EN)', tags: ['keyword', 'file'] },
    { input: 'delete file', expected: 'file_operations', expectedLayer: 2, description: 'Delete (EN)', tags: ['keyword', 'file'] },

    // Terminal Commands Keywords
    { input: '执行 git', expected: 'terminal_commands', expectedLayer: 2, description: 'Execute git (CN)', tags: ['keyword', 'terminal'] },
    { input: '运行 npm', expected: 'terminal_commands', expectedLayer: 2, description: 'Run npm (CN)', tags: ['keyword', 'terminal'] },
    { input: '执行 cargo', expected: 'terminal_commands', expectedLayer: 2, description: 'Execute cargo (CN)', tags: ['keyword', 'terminal'] },
    { input: '运行测试', expected: 'terminal_commands', expectedLayer: 2, description: 'Run tests (CN)', tags: ['keyword', 'terminal'] },
    { input: '构建项目', expected: 'terminal_commands', expectedLayer: 2, description: 'Build project (CN)', tags: ['keyword', 'terminal'] },

    // Code Generation Keywords
    { input: '生成函数', expected: 'code_generation', expectedLayer: 2, description: 'Generate function (CN)', tags: ['keyword', 'codegen'] },
    { input: '创建组件', expected: 'code_generation', expectedLayer: 2, description: 'Create component (CN)', tags: ['keyword', 'codegen'] },
    { input: '写一个类', expected: 'code_generation', expectedLayer: 2, description: 'Write class (CN)', tags: ['keyword', 'codegen'] },
    { input: '重构代码', expected: 'code_generation', expectedLayer: 2, description: 'Refactor code (CN)', tags: ['keyword', 'codegen'] },
    { input: '优化函数', expected: 'code_generation', expectedLayer: 2, description: 'Optimize function (CN)', tags: ['keyword', 'codegen'] },

    // Code Analysis Keywords
    { input: '解释代码', expected: 'code_analysis', expectedLayer: 2, description: 'Explain code (CN)', tags: ['keyword', 'analysis'] },
    { input: '分析性能', expected: 'code_analysis', expectedLayer: 2, description: 'Analyze performance (CN)', tags: ['keyword', 'analysis'] },
    { input: '检查错误', expected: 'code_analysis', expectedLayer: 2, description: 'Check errors (CN)', tags: ['keyword', 'analysis'] },
    { input: '代码审查', expected: 'code_analysis', expectedLayer: 2, description: 'Code review (CN)', tags: ['keyword', 'analysis'] },

    // Search Operations Keywords
    { input: '查找代码', expected: 'search_operations', expectedLayer: 2, description: 'Find code (CN)', tags: ['keyword', 'search'] },
    { input: '搜索函数', expected: 'search_operations', expectedLayer: 2, description: 'Search function (CN)', tags: ['keyword', 'search'] },
    { input: '定位引用', expected: 'search_operations', expectedLayer: 2, description: 'Locate reference (CN)', tags: ['keyword', 'search'] },
    { input: '找所有', expected: 'search_operations', expectedLayer: 2, description: 'Find all (CN)', tags: ['keyword', 'search'] },
  ]
};

// ============================================================================
// Layer 3: LLM Classification Dataset (85%+ expected accuracy)
// ============================================================================

export const llmClassificationDataset: CategoryDataset = {
  description: 'Layer 3: LLM 分类 - 复杂查询、歧义输入',
  expectedAccuracy: 0.85,
  cases: [
    // Code Generation (Complex)
    { input: '生成一个 React 组件，包含 useState 和 useEffect', expected: 'code_generation', expectedLayer: 3, description: 'Complex component gen', tags: ['llm', 'codegen'] },
    { input: '帮我写一个 TypeScript 函数来处理异步操作', expected: 'code_generation', expectedLayer: 3, description: 'Async function gen', tags: ['llm', 'codegen'] },
    { input: '创建一个中间件来验证 JWT token', expected: 'code_generation', expectedLayer: 3, description: 'Middleware gen', tags: ['llm', 'codegen'] },
    { input: '重构这段代码，使其更加模块化', expected: 'code_generation', expectedLayer: 3, description: 'Refactor request', tags: ['llm', 'codegen'] },
    { input: '优化这个查询的性能', expected: 'code_generation', expectedLayer: 3, description: 'Optimization gen', tags: ['llm', 'codegen'] },

    // Code Analysis (Complex)
    { input: '帮我分析一下这个项目的架构', expected: 'code_analysis', expectedLayer: 3, description: 'Architecture analysis', tags: ['llm', 'analysis'] },
    { input: '解释这段代码的工作原理', expected: 'code_analysis', expectedLayer: 3, description: 'Code explanation', tags: ['llm', 'analysis'] },
    { input: '检查这段代码有什么潜在的问题', expected: 'code_analysis', expectedLayer: 3, description: 'Bug detection', tags: ['llm', 'analysis'] },
    { input: '这个函数的时间复杂度是多少', expected: 'code_analysis', expectedLayer: 3, description: 'Complexity analysis', tags: ['llm', 'analysis'] },
    { input: '审查这个 PR 的代码变更', expected: 'code_analysis', expectedLayer: 3, description: 'PR review', tags: ['llm', 'analysis'] },

    // AI Chat (Q&A)
    { input: '什么是 React 的虚拟 DOM', expected: 'ai_chat', expectedLayer: 3, description: 'Concept question', tags: ['llm', 'chat'] },
    { input: '解释 TypeScript 中的泛型', expected: 'ai_chat', expectedLayer: 3, description: 'Type explanation', tags: ['llm', 'chat'] },
    { input: '如何正确使用 useEffect', expected: 'ai_chat', expectedLayer: 3, description: 'Usage question', tags: ['llm', 'chat'] },
    { input: 'Promise 和 async/await 有什么区别', expected: 'ai_chat', expectedLayer: 3, description: 'Comparison question', tags: ['llm', 'chat'] },
    { input: '给我讲解一下 RESTful API 的设计原则', expected: 'ai_chat', expectedLayer: 3, description: 'Design principles', tags: ['llm', 'chat'] },

    // Ambiguous Queries
    { input: '检查一下', expected: 'no_tool_needed', expectedLayer: 3, description: 'Ambiguous request', tags: ['llm', 'ambiguous'] },
    { input: '看看这个', expected: 'file_operations', expectedLayer: 3, description: 'Context dependent', tags: ['llm', 'ambiguous'] },
    { input: '处理一下', expected: 'code_generation', expectedLayer: 3, description: 'Vague action', tags: ['llm', 'ambiguous'] },
  ]
};

// ============================================================================
// Edge Cases Dataset
// ============================================================================

export const edgeCasesDataset: CategoryDataset = {
  description: '边界情况测试 - 空、特殊字符、长文本',
  expectedAccuracy: 0.70,
  cases: [
    // Empty/Invalid
    { input: '', expected: 'ai_chat', description: 'Empty string', tags: ['edge'] },
    { input: '   ', expected: 'ai_chat', description: 'Whitespace only', tags: ['edge'] },
    { input: '\n\n', expected: 'ai_chat', description: 'Newlines only', tags: ['edge'] },
    { input: '???', expected: 'ai_chat', description: 'Question marks only', tags: ['edge'] },
    { input: '...', expected: 'ai_chat', description: 'Dots only', tags: ['edge'] },

    // Very Short
    { input: 'x', expected: 'ai_chat', description: 'Single character', tags: ['edge'] },
    { input: '测试', expected: 'ai_chat', description: 'Very short CN', tags: ['edge'] },
    { input: 'test', expected: 'ai_chat', description: 'Very short EN', tags: ['edge'] },

    // Very Long
    { input: '分析' + 'x'.repeat(1000), expected: 'code_analysis', description: 'Very long text', tags: ['edge'] },
    {
      input: '请帮我分析以下代码的性能问题，包括时间复杂度、空间复杂度，以及可能的优化方案' + 'y'.repeat(500),
      expected: 'code_analysis',
      description: 'Long complex query',
      tags: ['edge']
    },

    // Special Characters
    { input: '@#$%', expected: 'ai_chat', description: 'Special chars only', tags: ['edge'] },
    { input: '读取文件.txt', expected: 'file_operations', description: 'File extension', tags: ['edge'] },
    { input: '/path/to/file', expected: 'file_operations', description: 'File path', tags: ['edge'] },

    // Mixed Language
    { input: 'read the README 文件', expected: 'file_operations', description: 'Mixed EN-CN', tags: ['edge', 'mixed'] },
    { input: '帮我 执行 git status', expected: 'terminal_commands', description: 'Mixed CN-EN', tags: ['edge', 'mixed'] },
    { input: '分析这段 code 的逻辑', expected: 'code_analysis', description: 'Mixed CN-EN-code', tags: ['edge', 'mixed'] },

    // Code Snippets
    {
      input: '分析这段代码: function hello() { return "world"; }',
      expected: 'code_analysis',
      description: 'Code snippet',
      tags: ['edge', 'code']
    },
    {
      input: '生成一个函数: async function fetch() { return await getData(); }',
      expected: 'code_generation',
      description: 'Code with keyword',
      tags: ['edge', 'code']
    },

    // Multi-intent
    { input: '读取 package.json 然后分析依赖', expected: 'file_operations', description: 'Two intents', tags: ['edge', 'multi-intent'] },
    { input: '先检查代码再生成测试', expected: 'code_analysis', description: 'Sequential tasks', tags: ['edge', 'multi-intent'] },
  ]
};

// ============================================================================
// Complete Dataset
// ============================================================================

export const completeDataset: ClassificationTestCase[] = [
  ...exactMatchDataset.cases,
  ...ruleBasedDataset.cases,
  ...llmClassificationDataset.cases,
  ...edgeCasesDataset.cases,
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 按类别分组测试用例
 */
export function groupByCategory(cases: ClassificationTestCase[]): Record<ToolCategory, ClassificationTestCase[]> {
  const grouped: Record<string, ClassificationTestCase[]> = {};

  for (const testCase of cases) {
    if (!grouped[testCase.expected]) {
      grouped[testCase.expected] = [];
    }
    grouped[testCase.expected].push(testCase);
  }

  return grouped as Record<ToolCategory, ClassificationTestCase[]>;
}

/**
 * 按层级分组测试用例
 */
export function groupByLayer(cases: ClassificationTestCase[]): Record<number, ClassificationTestCase[]> {
  const grouped: Record<number, ClassificationTestCase[]> = {
    1: [],
    2: [],
    3: [],
  };

  for (const testCase of cases) {
    const layer = testCase.expectedLayer ?? 3;
    grouped[layer].push(testCase);
  }

  return grouped;
}

/**
 * 按标签筛选测试用例
 */
export function filterByTag(cases: ClassificationTestCase[], tag: string): ClassificationTestCase[] {
  return cases.filter(tc => tc.tags?.includes(tag));
}

/**
 * 获取数据集统计信息
 */
export function getDatasetStats(cases: ClassificationTestCase[]) {
  const byCategory = groupByCategory(cases);
  const byLayer = groupByLayer(cases);

  return {
    total: cases.length,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([cat, cases]) => [cat, cases.length])
    ),
    byLayer: {
      1: byLayer[1].length,
      2: byLayer[2].length,
      3: byLayer[3].length,
    },
  };
}

// 导出默认数据集
export default {
  exactMatchDataset,
  ruleBasedDataset,
  llmClassificationDataset,
  edgeCasesDataset,
  completeDataset,
};
