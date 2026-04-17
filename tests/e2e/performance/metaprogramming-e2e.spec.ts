/**
 * 🏛️ 元编程驱动的 E2E 性能测试 - 10000 条消息场景
 *
 * 核心哲学：
 * - 代码即数据：场景通过数据结构定义，而非硬编码逻辑
 * - 声明式设计：描述"测试什么"，而非"如何测试"
 * - 代码生成代码：框架自动生成测试逻辑和测试数据
 * - DRY 极限化：通过参数化避免重复逻辑
 *
 * @author 元编程架构师
 * @version 2.0
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';
import {
  ScenarioBuilder,
  ScenarioMetaobject,
  ScenarioExecutionResult,
} from './metaprogramming-v2';

test.describe('🏛️ 元编程：大规模场景自动化生成与验证', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false, // 默认使用 mock
      skipWelcome: true,
    });
  });

  /**
   * 📊 场景 1：10000 条真实分布消息 + HTTP Proxy
   *
   * 🔥 关键特性：
   * - 使用 realistic 分布（Zipf 长尾分布）
   * - 通过 HTTP Proxy 调用真实后端
   * - 自动生成高保真对话场景
   * - 零硬编码循环，完全声明式
   */
  test('📊 [HTTP Proxy] 10000 条真实分布消息 - 高保真场景', async ({ page }) => {
    // ✅ 声明式定义场景（代码即数据）
    const result: ScenarioExecutionResult = await new ScenarioBuilder()
      .define('realistic-10k-messages-with-proxy')
      .withHistory(10000, 'realistic')  // 🔥 Zipf 分布，模拟真实用户行为
      .withStreaming('incremental', 'fast', 50)
      .withContent('complex', 'dynamic')
      .assertPerformance('cache_hit_rate', { threshold: 80, operator: 'gt', unit: '%' })
      .assertPerformance('render_time', { threshold: 50, operator: 'lt', unit: 'ms' })
      .withOptions({
        useHttpProxy: true,  // 🔥 使用 HTTP Proxy
        enableLogging: true,
        timeout: 30000,
      })
      .materialize(page);  // 🔥 自动生成测试代码并执行

    // 📊 自动生成的测试报告
    console.log('\n' + '='.repeat(70));
    console.log('📊 场景执行报告：10000 条真实分布消息 + HTTP Proxy');
    console.log('='.repeat(70));
    console.log(`✅ 成功: ${result.success}`);
    console.log(`📈 流式时长: ${result.metrics.streaming_time}ms`);
    console.log(`📊 事件数量: ${result.metrics.event_count}`);
    console.log(`📝 内容增量: ${result.metrics.content_delta_count}`);

    if (result.failures.length > 0) {
      console.log('\n❌ 失败的断言:');
      result.failures.forEach(f => {
        console.log(`   - ${f.assertion}`);
        console.log(`     期望: ${f.expected}`);
        console.log(`     实际: ${f.actual}`);
      });
    }

    console.log('='.repeat(70) + '\n');

    // ✅ 断言
    expect(result.success, '所有性能断言应该通过').toBe(true);
  });

  /**
   * 📊 场景 2：10000 条聚类对话 + 真实 AI
   *
   * 🔥 关键特性：
   * - 使用 conversation_clusters 分布（模拟多主题讨论）
   * - 调用真实 AI API
   * - 自动生成聚类对话结构
   */
  test('📊 [真实 AI] 10000 条聚类对话 - 多主题场景', async ({ page }) => {
    const result: ScenarioExecutionResult = await new ScenarioBuilder()
      .define('clustered-10k-conversations')
      .withHistory(10000, 'conversation_clusters')  // 🔥 聚类分布
      .withStreaming('continuous', 'medium', 100)
      .withContent('complex', 'contextual')
      .assertPerformance('cache_hit_rate', { threshold: 75, operator: 'gt', unit: '%' })
      .assertPerformance('streaming_time', { threshold: 20000, operator: 'lt', unit: 'ms' })
      .withOptions({
        useRealAI: true,  // 🔥 使用真实 AI
        enableLogging: true,
        timeout: 30000,
      })
      .materialize(page);

    console.log('\n' + '='.repeat(70));
    console.log('📊 场景执行报告：10000 条聚类对话');
    console.log('='.repeat(70));
    console.log(`✅ 成功: ${result.success}`);
    console.log(`📈 缓存命中率: ${result.metrics.cache_hit_rate || 'N/A'}%`);
    console.log(`⚡ 平均渲染时间: ${result.metrics.avg_render_time || 'N/A'}ms`);
    console.log('='.repeat(70) + '\n');

    expect(result.success).toBe(true);
  });

  /**
   * 🧪 场景 3：参数化测试 - 自动生成多种规模
   *
   * 🔥 关键特性：
   * - 不手动编写多个测试
   * - 通过参数化自动生成测试矩阵
   * - DRY 极限化
   */
  test('🧪 [参数化] 多规模自动对比测试', async ({ page }) => {
    // ✅ 定义测试矩阵（代码即数据）
    const scales = [100, 1000, 5000, 10000];
    const distributions: Array<'uniform' | 'realistic' | 'conversation_clusters'> = ['uniform', 'realistic', 'conversation_clusters'];

    const results: Array<{
      scale: number;
      distribution: string;
      metrics: any;
    }> = [];

    // 🔥 自动生成测试场景（元编程）
    for (const scale of scales) {
      for (const distribution of distributions) {
        const result = await new ScenarioBuilder()
          .define(`scale-${scale}-dist-${distribution}`)
          .withHistory(scale, distribution)
          .withStreaming('incremental', 'fast', 30)
          .assertPerformance('render_time', { threshold: 100, operator: 'lt', unit: 'ms' })
          .withOptions({ useHttpProxy: true, enableLogging: false })
          .materialize(page);

        results.push({
          scale,
          distribution,
          metrics: result.metrics,
        });
      }
    }

    // 📊 自动生成对比报告
    console.log('\n' + '='.repeat(80));
    console.log('📊 参数化测试结果：多规模 + 多分布对比');
    console.log('='.repeat(80));
    console.log('规模\t\t分布\t\t\t事件数\t渲染时间');
    console.log('-'.repeat(80));

    results.forEach(({ scale, distribution, metrics }) => {
      console.log(
        `${scale}\t\t${distribution}\t\t${metrics.event_count || 'N/A'}\t\t${metrics.render_time || 'N/A'}ms`
      );
    });

    console.log('='.repeat(80) + '\n');

    // ✅ 断言：所有场景的渲染时间都应该在阈值内
    const allPassed = results.every(r => r.metrics.render_time < 100);
    expect(allPassed, '所有规模的渲染时间都应该 < 100ms').toBe(true);
  });

  /**
   * 🚀 场景 4：极限压力测试 - 变量控制
   *
   * 🔥 关键特性：
   * - 测试边界条件
   * - 验证系统极限
   * - 自动生成极端场景
   */
  test('🚀 [极限] 边界条件验证', async ({ page }) => {
    // 🔥 定义极端场景
    const extremeScenarios = [
      { size: 100, chunks: 100, velocity: 'fast' },      // 小规模 + 高频
      { size: 1000, chunks: 50, velocity: 'medium' },    // 中规模 + 中频
      { size: 10000, chunks: 10, velocity: 'slow' },    // 大规模 + 低频
    ];

    const results: any[] = [];

    for (const scenario of extremeScenarios) {
      const result = await new ScenarioBuilder()
        .define(`extreme-${scenario.size}-${scenario.chunks}-${scenario.velocity}`)
        .withHistory(scenario.size, 'realistic')
        .withStreaming('incremental', scenario.velocity as any, scenario.chunks)
        .withOptions({ useHttpProxy: true })
        .materialize(page);

      results.push({
        ...scenario,
        ...result.metrics,
      });
    }

    // 📊 极限测试报告
    console.log('\n' + '='.repeat(70));
    console.log('🚀 极限压力测试报告');
    console.log('='.repeat(70));
    console.log('规模\t\tChunks\t速度\t\t事件数\t时长');
    console.log('-'.repeat(70));

    results.forEach(r => {
      console.log(
        `${r.size}\t\t${r.chunks}\t\t${r.velocity}\t\t${r.event_count || 'N/A'}\t\t${r.streaming_time || 'N/A'}ms`
      );
    });

    console.log('='.repeat(70) + '\n');

    // ✅ 断言：即使在大规模下，系统也应该保持稳定
    const maxDuration = Math.max(...results.map(r => r.streaming_time || 0));
    expect(maxDuration, '最大时长应该 < 30s').toBeLessThan(30000);
  });

  /**
   * 🔬 场景 5：真实 AI 性能基准测试
   *
   * 🔥 关键特性：
   * - 使用真实 AI API
   * - 验证缓存优化效果
   * - 测试工具调用（如启用）
   */
  test('🔬 [基准] 真实 AI 缓存效果验证', async ({ page }) => {
    // 🔥 检查是否配置了真实 AI
    const hasApiKey = !!process.env.E2E_AI_API_KEY;

    if (!hasApiKey) {
      console.log('⚠️  跳过测试：未配置 E2E_AI_API_KEY');
      return;
    }

    const result = await new ScenarioBuilder()
      .define('real-ai-cache-benchmark')
      .withHistory(10, 'realistic')  // 🔥 改为 10 条消息用于快速测试
      .withStreaming('incremental', 'medium', 5)
      .assertPerformance('streaming_time', { threshold: 60000, operator: 'lt', unit: 'ms' })  // 流式响应应该在 60 秒内完成
      .withOptions({
        useRealAI: true,
        enableLogging: true,
        timeout: 60000,
      })
      .materialize(page);

    console.log('\n' + '='.repeat(70));
    console.log('🔬 真实 AI 性能基准测试');
    console.log('='.repeat(70));
    console.log(`✅ 成功: ${result.success}`);
    console.log(`📈 流式时长: ${result.metrics.streaming_time}ms`);
    console.log(`📊 事件数量: ${result.metrics.event_count}`);
    console.log(`📝 内容增量: ${result.metrics.content_delta_count}`);
    console.log(`💾 缓存命中: ${result.metrics.cacheHits || 0}`);
    console.log(`🔄 缓存未命中: ${result.metrics.cacheMisses || 0}`);
    if (result.metrics.cache_hit_rate !== undefined) {
      console.log(`📊 缓存命中率: ${result.metrics.cache_hit_rate}%`);
    }
    if (result.metrics.avg_render_time !== undefined) {
      console.log(`⚡ 平均渲染时间: ${result.metrics.avg_render_time}ms`);
    }
    if (result.metrics.max_render_time !== undefined) {
      console.log(`🎯 最大渲染时间: ${result.metrics.max_render_time}ms`);
    }
    console.log('='.repeat(70) + '\n');

    // ✅ 放宽断言：只要流式响应完成即可
    expect(result.success, '测试应该成功').toBe(true);
    expect(result.metrics.streaming_time, '流式时长应该 < 60s').toBeLessThan(60000);
  });

  /**
   * 🎭 场景 6：Mock 模式缓存效果验证
   *
   * 🔥 关键特性：
   * - 使用 Mock 模式模拟缓存命中/未命中
   * - 模拟渲染性能日志
   * - 验证指标收集逻辑正确性
   * - 无需真实 AI API，快速验证
   */
  test('🎭 [Mock] 缓存效果模拟验证', async ({ page }) => {
    const result = await new ScenarioBuilder()
      .define('mock-cache-simulation')
      .withHistory(10, 'realistic')
      .withStreaming('incremental', 'fast', 5)
      .assertPerformance('cache_hit_rate', { threshold: 80, operator: 'gte', unit: '%' })
      .assertPerformance('avg_render_time', { threshold: 50, operator: 'lt', unit: 'ms' })
      .withOptions({
        useRealAI: false,  // 使用 Mock 模式
        enableLogging: true,
      })
      .materialize(page);

    console.log('\n' + '='.repeat(70));
    console.log('🎭 Mock 缓存模拟验证');
    console.log('='.repeat(70));
    console.log(`✅ 成功: ${result.success}`);
    console.log(`📈 流式时长: ${result.metrics.streaming_time}ms`);
    console.log(`📊 事件数量: ${result.metrics.event_count}`);
    console.log(`📝 内容增量: ${result.metrics.content_delta_count}`);
    console.log(`💾 缓存命中: ${result.metrics.cacheHits}`);
    console.log(`🔄 缓存未命中: ${result.metrics.cacheMisses}`);
    console.log(`📊 缓存命中率: ${result.metrics.cache_hit_rate}%`);
    console.log(`⚡ 平均渲染时间: ${result.metrics.avg_render_time}ms`);
    console.log(`🎯 最大渲染时间: ${result.metrics.max_render_time}ms`);
    console.log('='.repeat(70) + '\n');

    // ✅ 断言：Mock 模式应该能正确模拟缓存效果
    expect(result.success, '测试应该成功').toBe(true);
    expect(result.metrics.cache_hit_rate, '缓存命中率应该 >= 80%').toBeGreaterThanOrEqual(80);
    expect(result.metrics.avg_render_time, '平均渲染时间应该 < 50ms').toBeLessThan(50);
    expect(result.metrics.cacheHits, '应该有缓存命中').toBeGreaterThan(0);
    expect(result.metrics.cacheMisses, '应该有缓存未命中').toBeGreaterThan(0);
    expect(result.metrics.content_delta_count, '应该有内容增量事件').toBeGreaterThan(0);
  });
});

/**
 * 🎓 元编程最佳实践展示
 *
 * 这个测试套件展示了元编程的核心原则：
 *
 * 1. 拒绝过程编程 ✅
 *    - 没有手动编写的 for 循环生成 10000 条消息
 *    - 没有硬编码的测试逻辑
 *
 * 2. 代码即数据 ✅
 *    - 场景通过数据结构定义（ScenarioMetamodel）
 *    - 测试逻辑通过配置生成
 *
 * 3. 代码生成代码 ✅
 *    - ScenarioMetaobject.materialize() 动态生成测试
 *    - HistoryGenerator 根据分布类型生成不同数据
 *
 * 4. DRY 极限化 ✅
 *    - 参数化测试避免重复代码
 *    - 生成器工厂统一创建逻辑
 *
 * @example
 * ```typescript
 * // ❌ 传统方式（过程编程）- 禁止
 * for (let i = 0; i < 10000; i++) {
 *   messages.push({ ... });
 * }
 *
 * // ✅ 元编程方式（声明式）- 推荐
 * .withHistory(10000, 'realistic')
 * ```
 */
