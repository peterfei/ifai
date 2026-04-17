/**
 * 工具分类测试页面
 *
 * 开发调试页面，用于测试工具分类系统
 */

import React, { useEffect, useState } from 'react';
import { X, Play, RotateCcw, Zap, Clock, Target } from 'lucide-react';
import { ToolClassificationPanel } from '@/components/ToolClassification';
import { useDebugStore } from '@/stores/debugStore';
import { useToolClassificationStore } from '@/stores/toolClassificationStore';
import { useHistoryItems } from '@/stores/toolClassificationStore';
import { toolClassificationService } from '@/services/toolClassificationService';

interface TestResult {
  input: string;
  result: import('@/types/toolClassification').ClassificationResult;
  latency: number;
  success: boolean;
  error?: string;
}

/**
 * 测试页面组件
 */
export const ToolClassificationTestPage: React.FC = () => {
  const { closeToolClassificationTest } = useDebugStore();
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // 预定义测试用例
  const testCases = [
    // Layer 1: 精确匹配
    { input: '/read README.md', expected: 'layer1', category: 'file_operations' },
    { input: 'agent_read_file(rel_path="test.txt")', expected: 'layer1', category: 'file_operations' },
    { input: 'git status', expected: 'layer1', category: 'terminal_commands' },
    { input: 'npm run dev', expected: 'layer1', category: 'terminal_commands' },
    { input: 'cargo build', expected: 'layer1', category: 'terminal_commands' },

    // Layer 2: 规则分类
    { input: '读取文件', expected: 'layer2', category: 'file_operations' },
    { input: '打开配置', expected: 'layer2', category: 'file_operations' },
    { input: '生成函数', expected: 'layer2', category: 'code_generation' },
    { input: '创建组件', expected: 'layer2', category: 'code_generation' },
    { input: '解释代码', expected: 'layer2', category: 'code_analysis' },
    { input: '分析性能', expected: 'layer2', category: 'code_analysis' },
    { input: 'git 操作', expected: 'layer2', category: 'terminal_commands' },
    { input: '运行 npm', expected: 'layer2', category: 'terminal_commands' },
    { input: '查找代码', expected: 'layer2', category: 'search_operations' },
    { input: '搜索函数', expected: 'layer2', category: 'search_operations' },
    { input: '什么是闭包', expected: 'layer2', category: 'ai_chat' },
    { input: '怎么使用 Hook', expected: 'layer2', category: 'ai_chat' },

    // Layer 3: LLM 分类
    { input: '帮我分析一下这个项目的架构', expected: 'layer3', category: 'ai_chat' }, // 咨询类问题
    { input: '解释这段代码的工作原理', expected: 'layer3', category: 'code_analysis' }, // 明确提到"代码"
  ];

  /**
   * 运行所有测试
   */
  const runAllTests = async () => {
    setIsRunning(true);
    setTestResults([]);

    const results: TestResult[] = [];

    for (const testCase of testCases) {
      const startTime = performance.now();

      try {
        const response = await toolClassificationService.classify(testCase.input);
        const latency = performance.now() - startTime;

        results.push({
          input: testCase.input,
          result: response.result,
          latency,
          success:
            response.result.layer === testCase.expected &&
            response.result.category === testCase.category,
        });
      } catch (error) {
        const latency = performance.now() - startTime;
        results.push({
          input: testCase.input,
          result: {
            layer: 'layer1' as any,
            category: 'no_tool_needed' as any,
            confidence: 0,
            matchType: 'error',
          },
          latency,
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        });
      }

      // 小延迟避免过快调用
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    setTestResults(results);
    setIsRunning(false);
  };

  /**
   * 快速测试（仅前10个）
   */
  const runQuickTest = async () => {
    setIsRunning(true);
    setTestResults([]);

    const results: TestResult[] = [];
    const quickCases = testCases.slice(0, 10);

    for (const testCase of quickCases) {
      const startTime = performance.now();

      try {
        const response = await toolClassificationService.classify(testCase.input);
        const latency = performance.now() - startTime;

        results.push({
          input: testCase.input,
          result: response.result,
          latency,
          success:
            response.result.layer === testCase.expected &&
            response.result.category === testCase.category,
        });
      } catch (error) {
        const latency = performance.now() - startTime;
        results.push({
          input: testCase.input,
          result: {
            layer: 'layer1' as any,
            category: 'no_tool_needed' as any,
            confidence: 0,
            matchType: 'error',
          },
          latency,
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        });
      }
    }

    setTestResults(results);
    setIsRunning(false);
  };

  // 计算统计信息
  const passCount = testResults.filter((r) => r.success).length;
  const failCount = testResults.filter((r) => !r.success).length;
  const avgLatency =
    testResults.length > 0
      ? testResults.reduce((sum, r) => sum + r.latency, 0) / testResults.length
      : 0;
  const maxLatency =
    testResults.length > 0 ? Math.max(...testResults.map((r) => r.latency)) : 0;

  return (
    <div className="theme-backdrop-strong fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="theme-panel-elevated theme-border theme-shadow flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border">
        {/* 头部 */}
        <div className="theme-panel-muted theme-border flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="theme-surface-info flex h-10 w-10 items-center justify-center rounded-lg">
              <Zap className="theme-text-info h-5 w-5" />
            </div>
            <div>
              <h2 className="theme-text text-xl font-semibold">
                工具分类系统测试
              </h2>
              <p className="theme-text-subtle text-sm">
                三层分类架构测试 (Layer 1/2/3)
              </p>
            </div>
          </div>

          {/* 统计信息 */}
          {testResults.length > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Target className="theme-text-success h-4 w-4" />
                <span className="theme-text-subtle">
                  通过: <span className="theme-text-success font-semibold">{passCount}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="theme-surface-danger h-4 w-4 rounded-full" />
                <span className="theme-text-subtle">
                  失败: <span className="theme-text-danger font-semibold">{failCount}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="theme-text-info h-4 w-4" />
                <span className="theme-text-subtle">
                  平均: <span className="font-mono">{avgLatency.toFixed(1)}ms</span>
                </span>
              </div>
            </div>
          )}

          <button
            onClick={closeToolClassificationTest}
            className="theme-button-ghost rounded-lg p-2"
          >
            <X className="theme-text-subtle h-5 w-5" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto p-6">
          {testResults.length === 0 ? (
            /* 空状态 */
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="theme-surface-info mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                <Zap className="theme-text-info h-8 w-8" />
              </div>
              <h3 className="theme-text mb-2 text-lg font-semibold">
                工具分类系统测试
              </h3>
              <p className="theme-text-subtle mb-6 max-w-md">
                运行预定义测试用例验证三层分类架构的正确性和性能
              </p>
              <div className="flex gap-3">
                <button
                  onClick={runQuickTest}
                  disabled={isRunning}
                  className="theme-button-primary flex items-center gap-2 rounded-lg px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  快速测试 (10个)
                </button>
                <button
                  onClick={runAllTests}
                  disabled={isRunning}
                  className="theme-button-success flex items-center gap-2 rounded-lg px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  完整测试 ({testCases.length}个)
                </button>
              </div>
              {isRunning && (
                <div className="theme-text-subtle mt-4 flex items-center gap-2 text-sm">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span>测试运行中...</span>
                </div>
              )}
            </div>
          ) : (
            /* 测试结果 */
            <div className="space-y-4">
              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={runQuickTest}
                  disabled={isRunning}
                  className="theme-button-primary flex items-center gap-2 rounded-lg px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  快速测试
                </button>
                <button
                  onClick={runAllTests}
                  disabled={isRunning}
                  className="theme-button-success flex items-center gap-2 rounded-lg px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  完整测试
                </button>
                <button
                  onClick={() => setTestResults([])}
                  disabled={isRunning}
                  className="theme-button-secondary flex items-center gap-2 rounded-lg px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  清空结果
                </button>
              </div>

              {/* 结果表格 */}
              <div className="theme-border overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="theme-panel-muted">
                    <tr>
                      <th className="theme-text-muted px-4 py-3 text-left font-medium">
                        输入
                      </th>
                      <th className="theme-text-muted px-4 py-3 text-left font-medium">
                        层级
                      </th>
                      <th className="theme-text-muted px-4 py-3 text-left font-medium">
                        类别
                      </th>
                      <th className="theme-text-muted px-4 py-3 text-left font-medium">
                        置信度
                      </th>
                      <th className="theme-text-muted px-4 py-3 text-left font-medium">
                        延迟
                      </th>
                      <th className="theme-text-muted px-4 py-3 text-left font-medium">
                        状态
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {testResults.map((result, index) => (
                      <tr
                        key={index}
                        className={`theme-hoverable cursor-pointer ${
                          selectedIndex === index ? 'bg-blue-500/10' : ''
                        }`}
                        onClick={() => setSelectedIndex(index)}
                      >
                        <td className="px-4 py-3">
                          <code className="theme-code-inline rounded px-2 py-1 text-xs">
                            {result.input}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium ${
                              result.result.layer === 'layer1'
                                ? 'theme-badge-success'
                                : result.result.layer === 'layer2'
                                ? 'theme-badge-info'
                                : 'border-purple-500/20 bg-purple-500/10 text-purple-500'
                            }`}
                          >
                            {result.result.layer === 'layer1'
                              ? 'L1 精确匹配'
                              : result.result.layer === 'layer2'
                              ? 'L2 规则分类'
                              : 'L3 LLM分类'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="theme-text-subtle text-xs">
                            {result.result.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="theme-text text-xs font-mono">
                            {(result.result.confidence * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-mono ${
                              result.latency > 100
                                ? 'theme-text-danger'
                                : result.latency > 20
                                  ? 'theme-text-warning'
                                  : 'theme-text-success'
                            }`}
                          >
                            {result.latency.toFixed(1)}ms
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {result.success ? (
                            <span className="theme-text-success inline-flex items-center gap-1">
                              <div className="h-2 w-2 rounded-full bg-green-500" />
                              通过
                            </span>
                          ) : (
                            <span className="theme-text-danger inline-flex items-center gap-1">
                              <div className="h-2 w-2 rounded-full bg-red-500" />
                              失败
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 详细信息 */}
              {selectedIndex >= 0 && testResults[selectedIndex] && (
                <div className="theme-panel-muted theme-border rounded-lg border p-4">
                  <h4 className="theme-text-muted mb-2 text-sm font-medium">
                    详细信息
                  </h4>
                  <pre className="theme-code-surface theme-border overflow-auto rounded border p-3 text-xs">
                    {JSON.stringify(testResults[selectedIndex], null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ToolClassificationTestPage;
