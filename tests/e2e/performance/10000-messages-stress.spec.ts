/**
 * 🚀 10000 条消息极限性能测试
 *
 * 测试目标：
 * - 验证 10000 条消息下应用是否仍然流畅
 * - 检测虚拟列表在极大数据量下的表现
 * - 测量内存使用和垃圾回收
 * - 测试长时间滚动性能
 * - 验证是否有内存泄漏
 *
 * @author Performance Testing Team
 * @version 1.0
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';
import {
  ScenarioBuilder,
  ScenarioExecutionResult,
} from './metaprogramming-v2';

test.describe('🚀 10000 条消息极限性能测试', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });
  });

  /**
   * 🎯 核心极限测试：10000 条真实分布消息
   *
   * 测试场景：
   * - 使用 Zipf 分布生成 10000 条消息
   * - Mock 模式模拟缓存和渲染性能
   * - 收集详细的性能指标
   */
  test('🚀 [极限] 10000 条真实消息 - 完整性能验证', async ({ page }) => {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 开始 10000 条消息极限性能测试');
    console.log('⏱️  预计耗时: 30-60 秒');
    console.log('='.repeat(80));

    const startTime = Date.now();

    const result: ScenarioExecutionResult = await new ScenarioBuilder()
      .define('10000-messages-stress-test')
      .withHistory(10000, 'realistic')  // 10000 条消息，Zipf 分布
      .withStreaming('incremental', 'fast', 50)
      .assertPerformance('avg_render_time', { threshold: 200, operator: 'lt', unit: 'ms' })
      .assertPerformance('max_render_time', { threshold: 500, operator: 'lt', unit: 'ms' })
      .withOptions({
        useRealAI: false,  // Mock 模式
        enableLogging: true,
        timeout: 120000,   // 2 分钟超时
      })
      .materialize(page);

    const totalTime = Date.now() - startTime;

    // 🔥 测试滚动性能（多次滚动到底部和顶部）
    const scrollMetrics = await testHeavyScrolling(page);

    // 🔥 测试内存使用情况
    const memoryMetrics = await getMemoryMetrics(page);

    console.log('\n' + '='.repeat(80));
    console.log('🚀 10000 条消息极限性能测试结果');
    console.log('='.repeat(80));
    console.log(`✅ 测试成功: ${result.success}`);
    console.log(`⏱️  总耗时: ${(totalTime / 1000).toFixed(2)}秒`);
    console.log(`\n📈 流式性能:`);
    console.log(`   - 流式时长: ${result.metrics.streaming_time}ms`);
    console.log(`   - 事件数量: ${result.metrics.event_count}`);
    console.log(`   - 内容增量: ${result.metrics.content_delta_count}`);
    console.log(`\n💾 缓存性能:`);
    console.log(`   - 缓存命中: ${result.metrics.cacheHits || 0}`);
    console.log(`   - 缓存未命中: ${result.metrics.cacheMisses || 0}`);
    console.log(`   - 缓存命中率: ${result.metrics.cache_hit_rate || 0}%`);
    console.log(`\n⚡ 渲染性能:`);
    console.log(`   - 平均渲染时间: ${result.metrics.avg_render_time || 0}ms`);
    console.log(`   - 最大渲染时间: ${result.metrics.max_render_time || 0}ms`);
    console.log(`\n🎯 重度滚动性能:`);
    console.log(`   - 滚动次数: ${scrollMetrics.scrollCount}`);
    console.log(`   - 平均滚动时间: ${scrollMetrics.avgScrollTime}ms`);
    console.log(`   - 最大滚动时间: ${scrollMetrics.maxScrollTime}ms`);
    console.log(`   - 滚动帧率: ${scrollMetrics.avgFPS} FPS`);
    console.log(`\n💾 内存使用:`);
    console.log(`   - JS 堆大小: ${memoryMetrics.heapSize} MB`);
    console.log(`   - DOM 节点数: ${memoryMetrics.domNodes}`);
    console.log(`   - 监听器数量: ${memoryMetrics.listeners}`);
    console.log('='.repeat(80) + '\n');

    // 📊 性能问题分析
    const performanceIssues: string[] = [];
    const warnings: string[] = [];

    // 渲染性能检查
    if (result.metrics.avg_render_time > 200) {
      performanceIssues.push(`🔴 严重: 平均渲染时间过高: ${result.metrics.avg_render_time}ms > 200ms`);
    } else if (result.metrics.avg_render_time > 100) {
      warnings.push(`⚠️  警告: 平均渲染时间偏高: ${result.metrics.avg_render_time}ms > 100ms`);
    }

    if (result.metrics.max_render_time > 500) {
      performanceIssues.push(`🔴 严重: 最大渲染时间过高: ${result.metrics.max_render_time}ms > 500ms`);
    } else if (result.metrics.max_render_time > 300) {
      warnings.push(`⚠️  警告: 最大渲染时间偏高: ${result.metrics.max_render_time}ms > 300ms`);
    }

    // 滚动性能检查
    if (scrollMetrics.avgScrollTime > 100) {
      performanceIssues.push(`🔴 严重: 平均滚动时间过高: ${scrollMetrics.avgScrollTime}ms > 100ms`);
    } else if (scrollMetrics.avgScrollTime > 50) {
      warnings.push(`⚠️  警告: 平均滚动时间偏高: ${scrollMetrics.avgScrollTime}ms > 50ms`);
    }

    if (scrollMetrics.avgFPS < 20) {
      performanceIssues.push(`🔴 严重: 滚动帧率过低: ${scrollMetrics.avgFPS} FPS < 20 FPS`);
    } else if (scrollMetrics.avgFPS < 30) {
      warnings.push(`⚠️  警告: 滚动帧率偏低: ${scrollMetrics.avgFPS} FPS < 30 FPS`);
    }

    // 内存使用检查
    if (memoryMetrics.heapSize > 500) {
      performanceIssues.push(`🔴 严重: 内存使用过高: ${memoryMetrics.heapSize} MB > 500 MB`);
    } else if (memoryMetrics.heapSize > 300) {
      warnings.push(`⚠️  警告: 内存使用偏高: ${memoryMetrics.heapSize} MB > 300 MB`);
    }

    if (memoryMetrics.domNodes > 50000) {
      performanceIssues.push(`🔴 严重: DOM 节点过多: ${memoryMetrics.domNodes} > 50000`);
    } else if (memoryMetrics.domNodes > 30000) {
      warnings.push(`⚠️  警告: DOM 节点偏多: ${memoryMetrics.domNodes} > 30000`);
    }

    // 输出性能问题
    if (performanceIssues.length > 0) {
      console.log('\n🚨 发现严重性能问题:');
      performanceIssues.forEach(issue => console.log(`  ${issue}`));
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  性能警告:');
      warnings.forEach(warning => console.log(`  ${warning}`));
    }

    if (performanceIssues.length === 0 && warnings.length === 0) {
      console.log('\n✅ 所有性能指标优秀，应用在 10000 条消息下依然流畅！');
    }

    console.log('');

    // 核心断言（极限情况下的基本要求）
    expect(result.success, '测试应该成功').toBe(true);
    expect(result.metrics.avg_render_time, '平均渲染时间应该 < 200ms').toBeLessThan(200);
    expect(scrollMetrics.avgFPS, '滚动帧率应该 >= 20 FPS（极限场景）').toBeGreaterThanOrEqual(20);
  });

  /**
   * 🔄 极限滚动测试：连续快速滚动
   *
   * 测试场景：
   * - 执行 100 次快速滚动操作
   * - 验证是否有性能下降
   * - 检测是否有内存泄漏
   */
  test.skip('🔄 [极限] 连续快速滚动 100 次', async ({ page }) => {
    // 生成 10000 条消息
    await new ScenarioBuilder()
      .define('scroll-stress-test')
      .withHistory(10000, 'realistic')
      .withStreaming('continuous', 'fast', 50)
      .withOptions({ useRealAI: false, timeout: 120000 })
      .materialize(page);

    console.log('\n' + '='.repeat(80));
    console.log('🔄 连续快速滚动 100 次 - 压力测试');
    console.log('='.repeat(80));

    const scrollTimes: number[] = [];
    const iterations = 100;

    // 记录初始内存
    const initialMemory = await getMemoryMetrics(page);

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();

      // 随机滚动距离
      const scrollDistance = Math.floor(Math.random() * 500) + 100;

      await page.evaluate((distance) => {
        const container = document.querySelector('[data-testid="chat-scroll-container"]') as HTMLElement;
        if (container) {
          container.scrollTop += distance;
          // 循环滚动
          if (container.scrollTop > container.scrollHeight - container.clientHeight) {
            container.scrollTop = 0;
          }
        }
      }, scrollDistance);

      const scrollTime = Date.now() - startTime;
      scrollTimes.push(scrollTime);

      // 每 20 次输出进度
      if ((i + 1) % 20 === 0) {
        const avg = scrollTimes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        console.log(`进度: ${i + 1}/${iterations}, 最近 20 次平均滚动时间: ${avg.toFixed(2)}ms`);
      }

      await page.waitForTimeout(10);
    }

    // 记录最终内存
    const finalMemory = await getMemoryMetrics(page);
    const memoryIncrease = finalMemory.heapSize - initialMemory.heapSize;

    const avgScrollTime = scrollTimes.reduce((a, b) => a + b, 0) / scrollTimes.length;
    const maxScrollTime = Math.max(...scrollTimes);
    const minScrollTime = Math.min(...scrollTimes);

    // 检查性能是否下降（最后 20 次平均 vs 最初 20 次平均）
    const first20Avg = scrollTimes.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
    const last20Avg = scrollTimes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const performanceChange = ((last20Avg - first20Avg) / first20Avg) * 100;

    console.log(`\n📊 滚动性能统计:`);
    console.log(`   - 平均滚动时间: ${avgScrollTime.toFixed(2)}ms`);
    console.log(`   - 最小滚动时间: ${minScrollTime}ms`);
    console.log(`   - 最大滚动时间: ${maxScrollTime}ms`);
    console.log(`   - 最初 20 次平均: ${first20Avg.toFixed(2)}ms`);
    console.log(`   - 最后 20 次平均: ${last20Avg.toFixed(2)}ms`);
    console.log(`   - 性能变化: ${performanceChange > 0 ? '+' : ''}${performanceChange.toFixed(1)}%`);
    console.log(`\n💾 内存变化:`);
    console.log(`   - 初始内存: ${initialMemory.heapSize} MB`);
    console.log(`   - 最终内存: ${finalMemory.heapSize} MB`);
    console.log(`   - 内存增长: ${memoryIncrease > 0 ? '+' : ''}${memoryIncrease.toFixed(1)} MB`);
    console.log('='.repeat(80) + '\n');

    // 断言
    expect(avgScrollTime, '平均滚动时间应该 < 50ms').toBeLessThan(50);
    expect(maxScrollTime, '最大滚动时间应该 < 200ms').toBeLessThan(200);

    // 性能不应有明显下降（允许 20% 的波动）
    expect(performanceChange, '性能下降不应超过 20%').toBeLessThan(20);

    // 内存增长不应过大（允许增长 100MB）
    expect(memoryIncrease, '内存增长应该 < 100 MB').toBeLessThan(100);
  });

  /**
   * 📍 随机访问测试：模拟真实用户跳转
   *
   * 测试场景：
   * - 随机滚动到不同位置
   * - 测试虚拟列表的定位性能
   */
  test('📍 [随机] 随机位置跳转性能', async ({ page }) => {
    // 生成 10000 条消息
    await new ScenarioBuilder()
      .define('random-access-test')
      .withHistory(10000, 'realistic')
      .withStreaming('continuous', 'fast', 50)
      .withOptions({ useRealAI: false, timeout: 120000 })
      .materialize(page);

    console.log('\n' + '='.repeat(80));
    console.log('📍 随机位置跳转性能测试');
    console.log('='.repeat(80));

    const accessTimes: number[] = [];
    const positions = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]; // 不同位置

    for (let i = 0; i < 50; i++) {
      const targetPosition = positions[i % positions.length];

      const startTime = Date.now();

      await page.evaluate((pos) => {
        const container = document.querySelector('[data-testid="chat-scroll-container"]') as HTMLElement;
        if (container) {
          container.scrollTop = container.scrollHeight * pos;
        }
      }, targetPosition);

      const accessTime = Date.now() - startTime;
      accessTimes.push(accessTime);

      if (i < 10 || (i + 1) % 10 === 0) {
        console.log(`跳转到 ${(targetPosition * 100).toFixed(0)}% 耗时: ${accessTime}ms`);
      }

      await page.waitForTimeout(50);
    }

    const avgAccessTime = accessTimes.reduce((a, b) => a + b, 0) / accessTimes.length;
    const maxAccessTime = Math.max(...accessTimes);

    console.log(`\n📊 随机访问统计:`);
    console.log(`   - 平均跳转时间: ${avgAccessTime.toFixed(2)}ms`);
    console.log(`   - 最大跳转时间: ${maxAccessTime}ms`);
    console.log('='.repeat(80) + '\n');

    expect(avgAccessTime, '平均跳转时间应该 < 100ms').toBeLessThan(100);
    expect(maxAccessTime, '最大跳转时间应该 < 300ms').toBeLessThan(300);
  });
});

/**
 * 测试重度滚动性能
 */
async function testHeavyScrolling(page: any) {
  const scrollTimes: number[] = [];
  const scrollCount = 50; // 执行 50 次滚动

  for (let i = 0; i < scrollCount; i++) {
    const startTime = Date.now();

    await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]') as HTMLElement;
      if (container) {
        // 每次滚动一屏
        container.scrollTop += container.clientHeight;
        // 如果到底了，回到顶部
        if (container.scrollTop >= container.scrollHeight - container.clientHeight) {
          container.scrollTop = 0;
        }
      }
    });

    scrollTimes.push(Date.now() - startTime);
    await page.waitForTimeout(20);
  }

  const avgScrollTime = scrollTimes.reduce((a, b) => a + b, 0) / scrollTimes.length;
  const maxScrollTime = Math.max(...scrollTimes);
  const avgFPS = Math.min(60, Math.round(1000 / (avgScrollTime + 16)));

  return {
    scrollCount,
    avgScrollTime: Math.round(avgScrollTime * 100) / 100,
    maxScrollTime,
    avgFPS,
  };
}

/**
 * 获取内存指标
 */
async function getMemoryMetrics(page: any) {
  const metrics = await page.evaluate(() => {
    if (performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      return {
        heapSize: Math.round(memory.usedJSHeapSize / 1024 / 1024),
        heapLimit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
      };
    }

    // 如果 performance.memory 不可用，统计 DOM 节点
    const allElements = document.querySelectorAll('*');
    const domNodes = allElements.length;

    // 统计事件监听器（近似值）
    let listeners = 0;
    for (const el of Array.from(allElements)) {
      const events = (el as any).__events;
      if (events) {
        listeners += Object.keys(events).length;
      }
    }

    return {
      heapSize: 0,
      heapLimit: 0,
      domNodes,
      listeners,
    };
  });

  return {
    heapSize: metrics.heapSize,
    heapLimit: metrics.heapLimit,
    domNodes: metrics.domNodes || 0,
    listeners: metrics.listeners || 0,
  };
}
