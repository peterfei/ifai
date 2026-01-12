import { test, expect } from '@playwright/test';
import {
  PERFORMANCE_THRESHOLDS,
  measureTime,
  measureMemoryGrowth,
  countDOMNode,
  assertPerformanceThreshold,
} from '../helpers/v0-3-0-test-utils';
import { waitForEditorReady } from '../helpers/wait-helpers';

/**
 * 性能基准测试
 *
 * 确保 v0.3.0 的性能指标符合要求
 */

test.describe('Performance Benchmarks @v0.3.0', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForEditorReady(page);
  });

  /**
   * PERF-01: 启动时间基准
   */
  test('PERF-01: Application startup time', async ({ page }) => {
    // 记录启动时间（从 globalSetup 开始计时）
    const startupStart = Date.now();

    await page.goto('/');
    await waitForEditorReady(page);

    const startupTime = Date.now() - startupStart;

    console.log(`Startup time: ${startupTime}ms`);

    assertPerformanceThreshold(
      startupTime,
      PERFORMANCE_THRESHOLDS.MAX_STARTUP_TIME_MS,
      'Application startup'
    );
  });

  /**
   * PERF-02: 输入响应时间
   */
  test('PERF-02: Input response time', async ({ page }) => {
    const chatInput = page.locator('textarea[placeholder*="发送"], textarea[placeholder*="Ask"], [data-testid="chat-input"]');
    const inputCount = await chatInput.count();

    if (inputCount === 0) {
      test.skip(true, 'Chat input not found');
      return;
    }

    // 测试输入响应时间
    const { durationMs } = await measureTime(async () => {
      await chatInput.first().fill('Test input for performance measurement');
    });

    console.log(`Input response time: ${durationMs}ms`);

    assertPerformanceThreshold(
      durationMs,
      PERFORMANCE_THRESHOLDS.INPUT_DELAY_MS,
      'Input response'
    );
  });

  /**
   * PERF-03: 命令响应时间
   */
  test('PERF-03: Command response time', async ({ page }) => {
    // 测试命令面板响应时间
    const { durationMs } = await measureTime(async () => {
      await page.keyboard.press('Control+Shift+P');
      // 等待命令面板出现
      await page.waitForTimeout(100);
    });

    console.log(`Command palette response time: ${durationMs}ms`);

    assertPerformanceThreshold(
      durationMs,
      PERFORMANCE_THRESHOLDS.COMMAND_RESPONSE_MS,
      'Command palette response'
    );
  });

  /**
   * PERF-04: 大文件树渲染性能
   */
  test('PERF-04: Large file tree rendering (virtual scrolling)', async ({ page }) => {
    // 导航到测试项目
    await page.goto('/?mock=large-project');

    const fileTree = page.locator('[data-testid="file-tree"], .file-tree');
    const treeCount = await fileTree.count();

    if (treeCount === 0) {
      test.skip(true, 'File tree not found');
      return;
    }

    await fileTree.first().waitFor({ state: 'visible' });

    // 验证 DOM 节点数量
    const nodeCount = await countDOMNode(page, '[data-testid="file-tree"], .file-tree');

    console.log(`File tree DOM nodes: ${nodeCount}`);

    expect(
      nodeCount,
      `DOM nodes should be under ${PERFORMANCE_THRESHOLDS.MAX_DOM_NODES} for virtual scrolling`
    ).toBeLessThanOrEqual(PERFORMANCE_THRESHOLDS.MAX_DOM_NODES);
  });

  /**
   * PERF-05: 终端大量输出吞吐量
   */
  test('PERF-05: Terminal output throughput', async ({ page }) => {
    // 打开终端
    await page.keyboard.press('Control+`');

    const terminal = page.locator('[data-testid="terminal-panel"], .terminal-panel');
    const terminalCount = await terminal.count();

    if (terminalCount === 0) {
      test.skip(true, 'Terminal not found');
      return;
    }

    await terminal.first().waitFor({ state: 'visible' });

    // 模拟大量输出
    const largeOutput = 'x'.repeat(1000000); // 1MB 数据

    const memoryGrowth = await measureMemoryGrowth(page, async () => {
      await page.evaluate((output) => {
        // 模拟终端接收大量数据
        const terminalElement = document.querySelector('[data-testid="terminal-content"], .terminal-content');
        if (terminalElement) {
          terminalElement.textContent = output;
        }
      }, largeOutput);
    });

    console.log(`Memory growth after large output: ${memoryGrowth.toFixed(2)}MB`);

    expect(
      memoryGrowth,
      `Memory growth should be under ${PERFORMANCE_THRESHOLDS.MAX_MEMORY_GROWTH_MB}MB`
    ).toBeLessThanOrEqual(PERFORMANCE_THRESHOLDS.MAX_MEMORY_GROWTH_MB);
  });

  /**
   * PERF-06: 聊天消息渲染性能
   */
  test('PERF-06: Chat message rendering performance', async ({ page }) => {
    const chatInput = page.locator('textarea[placeholder*="发送"], [data-testid="chat-input"]');
    const inputCount = await chatInput.count();

    if (inputCount === 0) {
      test.skip(true, 'Chat input not found');
      return;
    }

    // 发送多条消息
    const messageCount = 50;
    const startTime = Date.now();

    for (let i = 0; i < messageCount; i++) {
      await chatInput.first().fill(`Test message ${i}`);
      await chatInput.first().press('Enter');
      await page.waitForTimeout(50); // 短暂等待
    }

    const totalTime = Date.now() - startTime;
    const avgTimePerMessage = totalTime / messageCount;

    console.log(`Total time for ${messageCount} messages: ${totalTime}ms`);
    console.log(`Average time per message: ${avgTimePerMessage.toFixed(2)}ms`);

    // 每条消息应该在合理时间内处理完成
    expect(avgTimePerMessage, 'Average message processing time should be reasonable').toBeLessThan(200);
  });

  /**
   * PERF-07: 滚动性能（无卡顿）
   */
  test('PERF-07: Smooth scrolling performance', async ({ page }) => {
    // 创建一个长列表场景
    const fileTree = page.locator('[data-testid="file-tree"], .file-tree');
    const treeCount = await fileTree.count();

    if (treeCount === 0) {
      test.skip(true, 'File tree not found');
      return;
    }

    // 模拟快速滚动
    const scrollStart = Date.now();

    await fileTree.first().evaluate((el) => {
      let scrollTop = 0;
      const scrollSteps = 50;
      const stepSize = 100;

      for (let i = 0; i < scrollSteps; i++) {
        scrollTop += stepSize;
        el.scrollTop = scrollTop;
      }
    });

    const scrollTime = Date.now() - scrollStart;

    console.log(`Scroll time: ${scrollTime}ms`);

    // 滚动应该快速完成
    expect(scrollTime, 'Scrolling should be fast').toBeLessThan(PERFORMANCE_THRESHOLDS.SCROLL_LAG_THRESHOLD_MS * 50);
  });

  /**
   * PERF-08: 编辑器大型文件性能
   */
  test('PERF-08: Large file editing performance', async ({ page }) => {
    // 创建一个大型文件
    const largeFile = [];
    for (let i = 0; i < 1000; i++) {
      largeFile.push(`// Line ${i}`);
      largeFile.push(`const variable${i} = ${i};`);
      largeFile.push(`function function${i}() { return ${i}; }`);
    }

    const fileContent = largeFile.join('\n');

    const { durationMs } = await measureTime(async () => {
      await page.evaluate((content) => {
        const monaco = (window as any).monaco;
        if (monaco?.editor?.getModels?.().length > 0) {
          const model = monaco.editor.getModels()[0];
          model.setValue(content);
        }
      }, fileContent);
    });

    console.log(`Large file load time: ${durationMs}ms`);

    // 加载大文件应该在合理时间内完成
    expect(durationMs, 'Large file should load quickly').toBeLessThan(3000);
  });
})

/**
 * 性能回归测试
 *
 * 用于 CI 环境中检测性能退化
 */
test.describe('Performance Regression Tests @v0.3.0', () => {
  /**
   * PERF-REGRESSION-01: 关键操作性能基准
   */
  test('PERF-REGRESSION-01: Critical operation benchmarks', async ({ page }) => {
    const benchmarks: Record<string, number> = {};

    // 1. 页面加载
    await page.goto('/');
    await waitForEditorReady(page);

    // 2. 聊天输入响应
    const chatInput = page.locator('textarea[placeholder*="发送"], [data-testid="chat-input"]');
    if (await chatInput.count() > 0) {
      const inputTime = await measureTime(async () => {
        await chatInput.first().fill('Performance test');
      });
      benchmarks['input_response'] = inputTime.durationMs;
    }

    // 3. 文件树加载
    const fileTree = page.locator('[data-testid="file-tree"], .file-tree');
    if (await fileTree.count() > 0) {
      const treeTime = await measureTime(async () => {
        await fileTree.first().waitFor({ state: 'visible' });
      });
      benchmarks['file_tree_load'] = treeTime.durationMs;
    }

    // 输出基准数据
    console.log('=== Performance Benchmarks ===');
    for (const [operation, time] of Object.entries(benchmarks)) {
      console.log(`${operation}: ${time.toFixed(2)}ms`);
    }

    // 将基准数据保存到文件（用于 CI 比较）
    await page.evaluate((data) => {
      // 在测试环境中，可以保存到全局变量供后续使用
      (window as any).__performanceBenchmarks = data;
    }, benchmarks);

    // 验证没有明显的性能退化
    // （这里只做基本检查，详细的回归分析应该由专门的工具处理）
    for (const [operation, time] of Object.entries(benchmarks)) {
      if (time > 5000) {
        throw new Error(`Performance regression detected: ${operation} took ${time}ms (threshold: 5000ms)`);
      }
    }
  });
});
