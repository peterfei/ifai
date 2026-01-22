/**
 * E2E Test: Accuracy Validation (v0.3.3)
 *
 * 测试工具分类系统的准确率：
 * 1. 测试数据集覆盖
 * 2. 各类别准确率
 * 3. 总体准确率目标
 */

import { test, expect } from '@playwright/test';

// ============================================================================
// Types
// ============================================================================

type ToolCategory =
  | 'file_operations'
  | 'code_generation'
  | 'code_analysis'
  | 'terminal_commands'
  | 'ai_chat'
  | 'search_operations'
  | 'no_tool_needed';

interface TestCase {
  input: string;
  expected: ToolCategory;
  description?: string;
}

interface AccuracyResult {
  total: number;
  correct: number;
  accuracy: number;
  byCategory: Record<ToolCategory, {
    total: number;
    correct: number;
    accuracy: number;
  }>;
}

// ============================================================================
// Test Dataset
// ============================================================================

const testDataset: TestCase[] = [
  // ============================================================================
  // File Operations
  // ============================================================================
  { input: '打开 README.md', expected: 'file_operations', description: '中文：打开' },
  { input: '查看 src/index.ts', expected: 'file_operations', description: '中文：查看' },
  { input: '读取 package.json', expected: 'file_operations', description: '中文：读取' },
  { input: '保存文件', expected: 'file_operations', description: '中文：保存' },
  { input: '重命名文件', expected: 'file_operations', description: '中文：重命名' },
  { input: '删除文件', expected: 'file_operations', description: '中文：删除' },
  { input: 'read config.json', expected: 'file_operations', description: '英文：read' },
  { input: 'open .env', expected: 'file_operations', description: '英文：open' },
  { input: 'view src/App.tsx', expected: 'file_operations', description: '英文：view' },
  { input: 'save the file', expected: 'file_operations', description: '英文：save' },

  // ============================================================================
  // Terminal Commands
  // ============================================================================
  { input: 'git status', expected: 'terminal_commands', description: 'Git 状态' },
  { input: 'git log', expected: 'terminal_commands', description: 'Git 日志' },
  { input: 'git diff', expected: 'terminal_commands', description: 'Git 差异' },
  { input: '执行 git 命令', expected: 'terminal_commands', description: '中文：执行 git' },
  { input: 'npm run dev', expected: 'terminal_commands', description: 'NPM 运行' },
  { input: 'npm install', expected: 'terminal_commands', description: 'NPM 安装' },
  { input: 'npm test', expected: 'terminal_commands', description: 'NPM 测试' },
  { input: '运行 npm', expected: 'terminal_commands', description: '中文：运行 npm' },
  { input: 'cargo build', expected: 'terminal_commands', description: 'Cargo 构建' },
  { input: 'cargo test', expected: 'terminal_commands', description: 'Cargo 测试' },
  { input: '执行 cargo', expected: 'terminal_commands', description: '中文：执行 cargo' },
  { input: 'yarn add react', expected: 'terminal_commands', description: 'Yarn 添加' },
  { input: 'pnpm install', expected: 'terminal_commands', description: 'PNPM 安装' },

  // ============================================================================
  // Code Generation
  // ============================================================================
  { input: '生成一个函数', expected: 'code_generation', description: '中文：生成函数' },
  { input: '帮我写个组件', expected: 'code_generation', description: '中文：写组件' },
  { input: '创建一个类', expected: 'code_generation', description: '中文：创建类' },
  { input: '重构这段代码', expected: 'code_generation', description: '中文：重构' },
  { input: '优化这个函数', expected: 'code_generation', description: '中文：优化' },
  { input: 'generate code', expected: 'code_generation', description: '英文：generate' },
  { input: 'write a function', expected: 'code_generation', description: '英文：write' },
  { input: 'create component', expected: 'code_generation', description: '英文：create' },
  { input: 'refactor this', expected: 'code_generation', description: '英文：refactor' },

  // ============================================================================
  // Code Analysis
  // ============================================================================
  { input: '解释这段代码', expected: 'code_analysis', description: '中文：解释代码' },
  { input: '分析性能', expected: 'code_analysis', description: '中文：分析性能' },
  { input: '检查错误', expected: 'code_analysis', description: '中文：检查错误' },
  { input: '代码审查', expected: 'code_analysis', description: '中文：代码审查' },
  { input: '理解逻辑', expected: 'code_analysis', description: '中文：理解逻辑' },
  { input: 'explain this code', expected: 'code_analysis', description: '英文：explain' },
  { input: 'analyze performance', expected: 'code_analysis', description: '英文：analyze' },
  { input: 'find bugs', expected: 'code_analysis', description: '英文：find bugs' },
  { input: 'code review', expected: 'code_analysis', description: '英文：code review' },

  // ============================================================================
  // AI Chat (Q&A)
  // ============================================================================
  { input: '什么是闭包？', expected: 'ai_chat', description: '中文：概念解释' },
  { input: '解释 TypeScript', expected: 'ai_chat', description: '中文：技术解释' },
  { input: '如何使用 Hook', expected: 'ai_chat', description: '中文：使用方法' },
  { input: 'Promise 怎么用', expected: 'ai_chat', description: '中文：用法询问' },
  { input: 'what is a closure', expected: 'ai_chat', description: '英文：概念解释' },
  { input: 'explain typescript', expected: 'ai_chat', description: '英文：技术解释' },
  { input: 'how to use hooks', expected: 'ai_chat', description: '英文：使用方法' },
  { input: 'async/await tutorial', expected: 'ai_chat', description: '英文：教程请求' },

  // ============================================================================
  // Search Operations
  // ============================================================================
  { input: '查找所有 useState', expected: 'search_operations', description: '中文：查找' },
  { input: '搜索 auth 相关代码', expected: 'search_operations', description: '中文：搜索' },
  { input: '定位这个函数', expected: 'search_operations', description: '中文：定位' },
  { input: '找所有引用', expected: 'search_operations', description: '中文：找引用' },
  { input: 'find all references', expected: 'search_operations', description: '英文：find' },
  { input: 'search for imports', expected: 'search_operations', description: '英文：search' },
  { input: 'locate this function', expected: 'search_operations', description: '英文：locate' },
];

// ============================================================================
// Helpers
// ============================================================================

/**
 * 执行分类并返回结果
 */
async function classifyTool(page: Page, input: string): Promise<ToolCategory> {
  await page.locator('[data-testid="chat-input"]').fill(input);
  await page.locator('[data-testid="chat-send-button"]').click();

  // 等待分类指示器出现
  await page.waitForSelector('[data-testid="tool-classification-indicator"]', {
    timeout: 5000
  });

  // 从指示器中提取分类信息
  const indicatorText = await page.locator('[data-testid="tool-classification-indicator"]').textContent();

  // 解析分类（实现需要根据实际 UI 调整）
  // 这里假设指示器包含类别名称
  for (const category of [
    'file_operations',
    'code_generation',
    'code_analysis',
    'terminal_commands',
    'ai_chat',
    'search_operations',
    'no_tool_needed'
  ]) {
    if (indicatorText?.includes(category)) {
      return category as ToolCategory;
    }
  }

  // 默认返回 ai_chat
  return 'ai_chat';
}

/**
 * 运行完整测试数据集
 */
async function runAccuracyTest(page: Page): Promise<AccuracyResult> {
  const result: AccuracyResult = {
    total: testDataset.length,
    correct: 0,
    accuracy: 0,
    byCategory: {} as any
  };

  // 初始化分类统计
  for (const category of [
    'file_operations',
    'code_generation',
    'code_analysis',
    'terminal_commands',
    'ai_chat',
    'search_operations',
    'no_tool_needed'
  ] as ToolCategory[]) {
    result.byCategory[category] = {
      total: 0,
      correct: 0,
      accuracy: 0
    };
  }

  // 运行每个测试用例
  for (const testCase of testDataset) {
    const classified = await classifyTool(page, testCase.input);
    const isCorrect = classified === testCase.expected;

    if (isCorrect) {
      result.correct++;
      result.byCategory[testCase.expected].correct++;
    }

    result.byCategory[testCase.expected].total++;

    // 清理并等待
    await page.waitForTimeout(100);
  }

  // 计算准确率
  result.accuracy = result.correct / result.total;

  for (const category of Object.keys(result.byCategory)) {
    const stats = result.byCategory[category as ToolCategory];
    stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
  }

  return result;
}

// ============================================================================
// Accuracy Validation Tests
// ============================================================================

test.describe('Tool Classification - Accuracy Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // 确保本地模型已加载
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'true');
    });

    await page.waitForLoadState('networkidle');
  });

  test.describe('Test Dataset Coverage', () => {
    test('should have comprehensive test dataset', () => {
      console.log(`\nTest Dataset Summary:`);
      console.log(`Total test cases: ${testDataset.length}\n`);

      // 按类别统计
      const byCategory: Record<string, number> = {};
      for (const testCase of testDataset) {
        byCategory[testCase.expected] = (byCategory[testCase.expected] || 0) + 1;
      }

      for (const [category, count] of Object.entries(byCategory)) {
        console.log(`  ${category}: ${count} cases`);
      }

      // 验证数据集大小
      expect(testDataset.length).toBeGreaterThan(50);

      // 验证每个类别都有测试用例
      expect(Object.keys(byCategory).length).toBeGreaterThanOrEqual(6);
    });
  });

  test.describe('Overall Accuracy Metrics', () => {
    test('should achieve >85% overall accuracy', async ({ page }) => {
      const result = await runAccuracyTest(page);

      console.log(`\nOverall Accuracy Report:`);
      console.log(`Total: ${result.total}`);
      console.log(`Correct: ${result.correct}`);
      console.log(`Accuracy: ${(result.accuracy * 100).toFixed(2)}%\n`);

      expect(result.accuracy).toBeGreaterThan(0.85);
    });

    test('should show detailed accuracy breakdown', async ({ page }) => {
      const result = await runAccuracyTest(page);

      console.log(`\nPer-Category Accuracy:`);

      const tableData: Array<{ category: string; total: number; correct: number; accuracy: string }> = [];

      for (const [category, stats] of Object.entries(result.byCategory)) {
        if (stats.total > 0) {
          const accuracyStr = `${(stats.accuracy * 100).toFixed(2)}%`;
          console.log(`  ${category}:`);
          console.log(`    Total: ${stats.total}`);
          console.log(`    Correct: ${stats.correct}`);
          console.log(`    Accuracy: ${accuracyStr}`);

          tableData.push({
            category,
            total: stats.total,
            correct: stats,
            accuracy: accuracyStr
          });
        }
      }

      // 验证每个主要类别的准确率
      const majorCategories: ToolCategory[] = [
        'file_operations',
        'terminal_commands',
        'code_generation',
        'code_analysis',
        'ai_chat',
        'search_operations'
      ];

      for (const category of majorCategories) {
        const stats = result.byCategory[category];
        if (stats.total > 0) {
          // 每个类别至少 70% 准确率
          expect(stats.accuracy).toBeGreaterThan(0.7);
        }
      }
    });
  });

  test.describe('Category-Specific Tests', () => {
    test('should achieve high accuracy for file operations', async ({ page }) => {
      const fileOpsTests = testDataset.filter(t => t.expected === 'file_operations');

      let correct = 0;
      for (const testCase of fileOpsTests) {
        const result = await classifyTool(page, testCase.input);
        if (result === testCase.expected) {
          correct++;
        }
        await page.waitForTimeout(50);
      }

      const accuracy = correct / fileOpsTests.length;

      console.log(`File Operations Accuracy: ${(accuracy * 100).toFixed(2)}% (${correct}/${fileOpsTests.length})`);
      expect(accuracy).toBeGreaterThan(0.85);
    });

    test('should achieve high accuracy for terminal commands', async ({ page }) => {
      const terminalTests = testDataset.filter(t => t.expected === 'terminal_commands');

      let correct = 0;
      for (const testCase of terminalTests) {
        const result = await classifyTool(page, testCase.input);
        if (result === testCase.expected) {
          correct++;
        }
        await page.waitForTimeout(50);
      }

      const accuracy = correct / terminalTests.length;

      console.log(`Terminal Commands Accuracy: ${(accuracy * 100).toFixed(2)}% (${correct}/${terminalTests.length})`);
      expect(accuracy).toBeGreaterThan(0.9); // Terminal commands should be very accurate
    });

    test('should handle mixed language inputs', async ({ page }) => {
      const mixedTests = [
        { input: 'read the README 文件', expected: 'file_operations' },
        { input: '执行 git 命令来查看 status', expected: 'terminal_commands' },
        { input: 'generate 生成一个函数', expected: 'code_generation' },
      ];

      let correct = 0;
      for (const testCase of mixedTests) {
        const result = await classifyTool(page, testCase.input);
        if (result === testCase.expected) {
          correct++;
        }
        await page.waitForTimeout(50);
      }

      const accuracy = correct / mixedTests.length;

      console.log(`Mixed Language Accuracy: ${(accuracy * 100).toFixed(2)}%`);
      expect(accuracy).toBeGreaterThan(0.6); // Mixed language is harder
    });
  });

  test.describe('Error Analysis', () => {
    test('should report misclassified examples', async ({ page }) => {
      const errors: Array<{ input: string; expected: string; actual: string }> = [];

      for (const testCase of testDataset) {
        const result = await classifyTool(page, testCase.input);

        if (result !== testCase.expected) {
          errors.push({
            input: testCase.input,
            expected: testCase.expected,
            actual: result
          });
        }

        await page.waitForTimeout(50);
      }

      console.log(`\nMisclassified Examples (${errors.length}):`);
      errors.slice(0, 10).forEach(error => {
        console.log(`  Input: "${error.input}"`);
        console.log(`  Expected: ${error.expected}`);
        console.log(`  Actual: ${error.actual}`);
        console.log();
      });

      // 错误率应该小于 15%
      const errorRate = errors.length / testDataset.length;
      expect(errorRate).toBeLessThan(0.15);
    });

    test('should identify systematic errors', async ({ page }) => {
      // 检查是否有系统性的错误模式
      const errorMap: Record<string, Array<{ input: string; expected: string; actual: string }>> = {};

      for (const testCase of testDataset) {
        const result = await classifyTool(page, testCase.input);

        if (result !== testCase.expected) {
          const errorKey = `${testCase.expected} → ${result}`;
          if (!errorMap[errorKey]) {
            errorMap[errorKey] = [];
          }
          errorMap[errorKey].push({
            input: testCase.input,
            expected: testCase.expected,
            actual: result
          });
        }

        await page.waitForTimeout(50);
      }

      console.log(`\nSystematic Error Patterns:`);
      for (const [pattern, cases] of Object.entries(errorMap)) {
        console.log(`  ${pattern}: ${cases.length} cases`);
        cases.slice(0, 3).forEach(c => {
          console.log(`    - "${c.input}"`);
        });
      }

      // 验证没有系统性错误（某个错误模式超过 5 次）
      for (const [pattern, cases] of Object.entries(errorMap)) {
        expect(cases.length).toBeLessThan(5);
      }
    });
  });
});

// ============================================================================
// Regression Tests
// ============================================================================

test.describe('Tool Classification - Accuracy Regression', () => {
  test('should maintain accuracy across multiple runs', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'true');
    });

    // 第一轮
    const run1Results: boolean[] = [];
    const sampleTests = testDataset.slice(0, 20);

    for (const testCase of sampleTests) {
      const result = await classifyTool(page, testCase.input);
      run1Results.push(result === testCase.expected);
      await page.waitForTimeout(50);
    }

    // 等待
    await page.waitForTimeout(1000);

    // 第二轮
    const run2Results: boolean[] = [];
    for (const testCase of sampleTests) {
      const result = await classifyTool(page, testCase.input);
      run2Results.push(result === testCase.expected);
      await page.waitForTimeout(50);
    }

    // 计算准确率
    const run1Accuracy = run1Results.filter(r => r).length / run1Results.length;
    const run2Accuracy = run2Results.filter(r => r).length / run2Results.length;

    console.log(`Run 1 Accuracy: ${(run1Accuracy * 100).toFixed(2)}%`);
    console.log(`Run 2 Accuracy: ${(run2Accuracy * 100).toFixed(2)}%`);

    // 两轮准确率应该接近（差异 < 10%）
    const accuracyDiff = Math.abs(run1Accuracy - run2Accuracy);
    expect(accuracyDiff).toBeLessThan(0.1);
  });
});
