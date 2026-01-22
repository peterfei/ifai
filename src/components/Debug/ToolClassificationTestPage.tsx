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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                工具分类系统测试
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                三层分类架构测试 (Layer 1/2/3)
              </p>
            </div>
          </div>

          {/* 统计信息 */}
          {testResults.length > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Target className="w-4 h-4 text-green-500" />
                <span className="text-gray-600 dark:text-gray-400">
                  通过: <span className="font-semibold text-green-600">{passCount}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-red-500" />
                <span className="text-gray-600 dark:text-gray-400">
                  失败: <span className="font-semibold text-red-600">{failCount}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="text-gray-600 dark:text-gray-400">
                  平均: <span className="font-mono">{avgLatency.toFixed(1)}ms</span>
                </span>
              </div>
            </div>
          )}

          <button
            onClick={closeToolClassificationTest}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto p-6">
          {testResults.length === 0 ? (
            /* 空状态 */
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <Zap className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                工具分类系统测试
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
                运行预定义测试用例验证三层分类架构的正确性和性能
              </p>
              <div className="flex gap-3">
                <button
                  onClick={runQuickTest}
                  disabled={isRunning}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  快速测试 (10个)
                </button>
                <button
                  onClick={runAllTests}
                  disabled={isRunning}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  完整测试 ({testCases.length}个)
                </button>
              </div>
              {isRunning && (
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
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
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  快速测试
                </button>
                <button
                  onClick={runAllTests}
                  disabled={isRunning}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  完整测试
                </button>
                <button
                  onClick={() => setTestResults([])}
                  disabled={isRunning}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  清空结果
                </button>
              </div>

              {/* 结果表格 */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                        输入
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                        层级
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                        类别
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                        置信度
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                        延迟
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                        状态
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {testResults.map((result, index) => (
                      <tr
                        key={index}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${
                          selectedIndex === index ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                        onClick={() => setSelectedIndex(index)}
                      >
                        <td className="px-4 py-3">
                          <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                            {result.input}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                              result.result.layer === 'layer1'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : result.result.layer === 'layer2'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
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
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {result.result.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono">
                            {(result.result.confidence * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-mono ${
                              result.latency > 100
                                ? 'text-red-600'
                                : result.latency > 20
                                ? 'text-yellow-600'
                                : 'text-green-600'
                            }`}
                          >
                            {result.latency.toFixed(1)}ms
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {result.success ? (
                            <span className="inline-flex items-center gap-1 text-green-600">
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                              通过
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <div className="w-2 h-2 rounded-full bg-red-500" />
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
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    详细信息
                  </h4>
                  <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-auto">
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
