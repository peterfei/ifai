/**
 * E2E Test: Performance Benchmarks (v0.3.3)
 *
 * 测试工具分类系统的性能基准：
 * 1. 延迟目标（P50, P95, P99）
 * 2. 吞吐量
 * 3. 并发处理
 */

import { test, expect } from '@playwright/test';

// ============================================================================
// Helpers
// ============================================================================

/**
 * 计算百分位数
 */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(index, sorted.length - 1)];
}

/**
 * 性能测试辅助类
 */
class PerformanceBenchmark {
  constructor(private page: Page) {}

  /**
   * 执行分类并测量延迟
   */
  async measureClassification(input: string): Promise<number> {
    const start = performance.now();

    await this.page.locator('[data-testid="chat-input"]').fill(input);
    await this.page.locator('[data-testid="chat-send-button"]').click();

    // 等待分类指示器出现
    await this.page.waitForSelector('[data-testid="tool-classification-indicator"]', {
      timeout: 5000
    });

    return performance.now() - start;
  }

  /**
   * 执行多次分类测试
   */
  async runMultipleClassifications(inputs: string[]): Promise<number[]> {
    const latencies: number[] = [];

    for (const input of inputs) {
      // 清空输入框
      await this.page.locator('[data-testid="chat-input"]').clear();

      const latency = await this.measureClassification(input);
      latencies.push(latency);

      // 短暂等待避免过快
      await this.page.waitForTimeout(50);
    }

    return latencies;
  }
}

// ============================================================================
// Performance Targets Tests
// ============================================================================

test.describe('Tool Classification - Performance Targets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // 确保本地模型已加载
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'true');
    });

    // 等待应用初始化
    await page.waitForLoadState('networkidle');
  });

  test.describe('Layer 1: Exact Match Performance', () => {
    test('should meet P95 latency target: <5ms', async ({ page }) => {
      const benchmark = new PerformanceBenchmark(page);
      const inputs = Array(100).fill('/read file.txt');

      const latencies = await benchmark.runMultipleClassifications(inputs);

      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);

      console.log(`Layer 1 Performance (ms):`);
      console.log(`  P50: ${p50.toFixed(2)}`);
      console.log(`  P95: ${p95.toFixed(2)}`);
      console.log(`  P99: ${p99.toFixed(2)}`);

      expect(p95).toBeLessThan(5);
    });

    test('should meet P99 latency target: <10ms', async ({ page }) => {
      const benchmark = new PerformanceBenchmark(page);
      const inputs = Array(100).fill('ls');

      const latencies = await benchmark.runMultipleClassifications(inputs);

      const p99 = percentile(latencies, 99);

      expect(p99).toBeLessThan(10);
    });

    test('should handle different command formats consistently', async ({ page }) => {
      const benchmark = new PerformanceBenchmark(page);
      const inputs = [
        ...Array(20).fill('/read file.txt'),
        ...Array(20).fill('ls -la'),
        ...Array(20).fill('agent_read_file(rel_path="test")'),
        ...Array(20).fill('git status'),
        ...Array(20).fill('npm run dev'),
      ];

      const latencies = await benchmark.runMultipleClassifications(inputs);

      const p95 = percentile(latencies, 95);
      expect(p95).toBeLessThan(5);
    });
  });

  test.describe('Layer 2: Rule-Based Performance', () => {
    test('should meet P95 latency target: <20ms', async ({ page }) => {
      const benchmark = new PerformanceBenchmark(page);
      const inputs = Array(100).fill('读取配置文件');

      const latencies = await benchmark.runMultipleClassifications(inputs);

      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);

      console.log(`Layer 2 Performance (ms):`);
      console.log(`  P50: ${p50.toFixed(2)}`);
      console.log(`  P95: ${p95.toFixed(2)}`);
      console.log(`  P99: ${p99.toFixed(2)}`);

      expect(p95).toBeLessThan(20);
    });

    test('should meet P99 latency target: <30ms', async ({ page }) => {
      const benchmark = new PerformanceBenchmark(page);
      const inputs = Array(100).fill('执行 git 命令');

      const latencies = await benchmark.runMultipleClassifications(inputs);

      const p99 = percentile(latencies, 99);
      expect(p99).toBeLessThan(30);
    });

    test('should handle different rule patterns consistently', async ({ page }) => {
      const benchmark = new PerformanceBenchmark(page);
      const inputs = [
        ...Array(20).fill('打开文件'),
        ...Array(20).fill('查看代码'),
        ...Array(20).fill('git log'),
        ...Array(20).fill('npm install'),
        ...Array(20).fill('生成函数'),
      ];

      const latencies = await benchmark.runMultipleClassifications(inputs);

      const p95 = percentile(latencies, 95);
      expect(p95).toBeLessThan(20);
    });
  });

  test.describe('Layer 3: LLM Classification Performance', () => {
    test('should meet P95 latency target: <300ms', async ({ page }) => {
      const benchmark = new PerformanceBenchmark(page);
      const inputs = Array(20).fill('分析这段代码的性能瓶颈');

      const latencies = await benchmark.runMultipleClassifications(inputs);

      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);

      console.log(`Layer 3 Performance (ms):`);
      console.log(`  P50: ${p50.toFixed(2)}`);
      console.log(`  P95: ${p95.toFixed(2)}`);
      console.log(`  P99: ${p99.toFixed(2)}`);

      expect(p95).toBeLessThan(300);
    });

    test('should meet P99 latency target: <500ms', async ({ page }) => {
      const benchmark = new PerformanceBenchmark(page);
      const inputs = Array(20).fill('解释这个函数的工作原理');

      const latencies = await benchmark.runMultipleClassifications(inputs);

      const p99 = percentile(latencies, 99);
      expect(p99).toBeLessThan(500);
    });

    test('should handle different query types consistently', async ({ page }) => {
      const benchmark = new PerformanceBenchmark(page);
      const inputs = [
        ...Array(5).fill('分析项目架构'),
        ...Array(5).fill('优化性能'),
        ...Array(5).fill('解释代码逻辑'),
        ...Array(5).fill('检查潜在错误'),
      ];

      const latencies = await benchmark.runMultipleClassifications(inputs);

      const p95 = percentile(latencies, 95);
      expect(p95).toBeLessThan(300);
    });
  });
});

// ============================================================================
// Throughput Tests
// ============================================================================

test.describe('Tool Classification - Throughput', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'true');
    });
  });

  test('should handle 100+ Layer 1 classifications/second', async ({ page }) => {
    const benchmark = new PerformanceBenchmark(page);
    const inputs = Array(50).fill('/read');

    const start = performance.now();
    await benchmark.runMultipleClassifications(inputs);
    const duration = performance.now() - start;

    const throughput = (inputs.length / duration) * 1000;

    console.log(`Layer 1 Throughput: ${throughput.toFixed(2)} classifications/sec`);
    expect(throughput).toBeGreaterThan(100);
  });

  test('should handle 50+ Layer 2 classifications/second', async ({ page }) => {
    const benchmark = new PerformanceBenchmark(page);
    const inputs = Array(30).fill('读取文件');

    const start = performance.now();
    await benchmark.runMultipleClassifications(inputs);
    const duration = performance.now() - start;

    const throughput = (inputs.length / duration) * 1000;

    console.log(`Layer 2 Throughput: ${throughput.toFixed(2)} classifications/sec`);
    expect(throughput).toBeGreaterThan(50);
  });

  test('should handle 5+ Layer 3 classifications/second', async ({ page }) => {
    const benchmark = new PerformanceBenchmark(page);
    const inputs = Array(10).fill('分析代码');

    const start = performance.now();
    await benchmark.runMultipleClassifications(inputs);
    const duration = performance.now() - start;

    const throughput = (inputs.length / duration) * 1000;

    console.log(`Layer 3 Throughput: ${throughput.toFixed(2)} classifications/sec`);
    expect(throughput).toBeGreaterThan(5);
  });

  test('should handle mixed workload efficiently', async ({ page }) => {
    const benchmark = new PerformanceBenchmark(page);

    // 混合不同层级的输入
    const inputs = [
      ...Array(20).fill('/read'),                    // Layer 1
      ...Array(20).fill('查看文件'),                  // Layer 2
      ...Array(10).fill('分析性能'),                  // Layer 3
    ];

    const start = performance.now();
    await benchmark.runMultipleClassifications(inputs);
    const duration = performance.now() - start;

    const throughput = (inputs.length / duration) * 1000;
    console.log(`Mixed Throughput: ${throughput.toFixed(2)} classifications/sec`);

    // 混合场景下总体吞吐量应该仍然不错
    expect(throughput).toBeGreaterThan(20);
  });
});

// ============================================================================
// Concurrent Request Tests
// ============================================================================

test.describe('Tool Classification - Concurrent Requests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'true');
    });
  });

  test('should handle multiple rapid consecutive requests', async ({ page }) => {
    const inputs = Array(10).fill('/read test');

    for (const input of inputs) {
      await page.locator('[data-testid="chat-input"]').fill(input);
      await page.locator('[data-testid="chat-send-button"]').click();
    }

    // 等待所有请求处理完成
    await page.waitForTimeout(2000);

    // 验证所有消息都有分类指示器
    const indicators = await page.locator('[data-testid="tool-classification-indicator"]').count();
    expect(indicators).toBeGreaterThanOrEqual(10);
  });

  test('should not degrade performance under load', async ({ page }) => {
    const benchmark = new PerformanceBenchmark(page);

    // 第一批：基准性能
    const batch1Latencies = await benchmark.runMultipleClassifications(
      Array(20).fill('/read')
    );

    // 第二批：负载下的性能
    const batch2Latencies = await benchmark.runMultipleClassifications(
      Array(20).fill('/read')
    );

    const batch1P95 = percentile(batch1Latencies, 95);
    const batch2P95 = percentile(batch2Latencies, 95);

    // 验证性能没有显著下降（允许 20% 波动）
    const degradationRatio = batch2P95 / batch1P95;
    expect(degradationRatio).toBeLessThan(1.2);

    console.log(`Performance Degradation: ${(degradationRatio - 1) * 100}%`);
  });
});

// ============================================================================
// Memory and Resource Tests
// ============================================================================

test.describe('Tool Classification - Memory and Resources', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'true');
    });
  });

  test('should maintain stable memory usage over time', async ({ page }) => {
    const benchmark = new PerformanceBenchmark(page);

    // 获取初始内存
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });

    // 执行大量分类
    await benchmark.runMultipleClassifications(Array(100).fill('/read test'));

    // 获取最终内存
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });

    // 计算内存增长（MB）
    const memoryGrowthMB = (finalMemory - initialMemory) / (1024 * 1024);

    console.log(`Memory Growth: ${memoryGrowthMB.toFixed(2)} MB`);

    // 内存增长应该小于 50MB
    expect(memoryGrowthMB).toBeLessThan(50);
  });

  test('should not leak resources', async ({ page }) => {
    const benchmark = new PerformanceBenchmark(page);

    // 执行大量分类
    for (let i = 0; i < 50; i++) {
      await page.locator('[data-testid="chat-input"]').fill(`test ${i}`);
      await page.locator('[data-testid="chat-send-button"]').click();
      await page.waitForSelector('[data-testid="tool-classification-indicator"]');
    }

    // 检查是否有内存泄漏的迹象（通过检查事件监听器数量等）
    const listenerCount = await page.evaluate(() => {
      let count = 0;
      // @ts-ignore
      for (const key in window) {
        if (key.startsWith('on')) count++;
      }
      return count;
    });

    // 监听器数量应该在合理范围内
    expect(listenerCount).toBeLessThan(100);
  });
});

// ============================================================================
// Regression Tests
// ============================================================================

test.describe('Tool Classification - Performance Regression', () => {
  test('should maintain consistent performance over time', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'true');
    });

    const benchmark = new PerformanceBenchmark(page);

    // 测试 1：冷启动性能
    const coldStartLatency = await benchmark.measureClassification('/read test');

    // 等待一段时间
    await page.waitForTimeout(2000);

    // 测试 2：热启动性能
    const warmStartLatency = await benchmark.measureClassification('/read test');

    console.log(`Cold Start: ${coldStartLatency.toFixed(2)}ms`);
    console.log(`Warm Start: ${warmStartLatency.toFixed(2)}ms`);

    // 热启动应该比冷启动快（或者至少不会更慢）
    expect(warmStartLatency).toBeLessThanOrEqual(coldStartLatency * 1.1);
  });

  test('should meet all performance targets in single run', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('local_model_loaded', 'true');
    });

    const benchmark = new PerformanceBenchmark(page);

    const testCases = [
      { input: '/read', maxLatency: 10 },
      { input: 'ls', maxLatency: 10 },
      { input: '读取文件', maxLatency: 30 },
      { input: 'git status', maxLatency: 30 },
      { input: '分析代码', maxLatency: 500 },
    ];

    const results: Array<{ input: string; latency: number; passed: boolean }> = [];

    for (const testCase of testCases) {
      await page.locator('[data-testid="chat-input"]').clear();
      const latency = await benchmark.measureClassification(testCase.input);
      const passed = latency < testCase.maxLatency;

      results.push({
        input: testCase.input,
        latency,
        passed
      });

      console.log(`${testCase.input}: ${latency.toFixed(2)}ms (target: <${testCase.maxLatency}ms) - ${passed ? '✓' : '✗'}`);
    }

    // 所有测试都应该通过
    const allPassed = results.every(r => r.passed);
    expect(allPassed).toBe(true);
  });
});
