/**
 * 🔴🟢 红绿测试：VirtualMessageList 性能优化验证
 *
 * 🎯 测试目标：
 * - 🔴 红色：优化前应该失败（性能不达标）
 * - 🟢 绿色：优化后应该通过（性能达标）
 *
 * 📊 性能指标：
 * 1. 缓存命中率 > 80%（流式输出时）
 * 2. 流式输出时长 < 5 秒
 * 3. UI 冻结时间 < 100ms
 *
 * 🚀 如何运行：
 * ```bash
 * # 运行红绿测试
 * npm run test:e2e tests/e2e/performance/red-green-virtual-list.spec.ts
 * ```
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('🔴🟢 红绿测试：VirtualMessageList 缓存优化', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
  });

  test('🟢 绿色测试：缓存优化应该生效（性能达标）', async ({ page }) => {
    // ✅ 绿色：优化后应该通过

    // 📊 性能阈值
    const MIN_CACHE_HIT_RATE = 80; // 缓存命中率至少 80%
    const MAX_STREAMING_TIME = 5000; // 流式输出最多 5 秒
    const MAX_RENDER_TIME = 50; // 单次渲染最多 50ms

    // 📊 监控指标
    const metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      renderTimes: [],
      streamingStartTime: 0,
      streamingEndTime: 0,
    };

    // 🔍 监听性能日志
    page.on('console', (msg) => {
      const text = msg.text();

      // 检测缓存命中
      if (text.includes('[useStableMessages] ✅ 缓存命中')) {
        metrics.cacheHits++;
      }

      // 检测缓存未命中
      if (text.includes('[useStableMessages] 🔄 重新计算')) {
        metrics.cacheMisses++;

        // 提取渲染时间
        const match = text.match(/duration:\s*([\d.]+)ms/);
        if (match) {
          metrics.renderTimes.push(parseFloat(match[1]));
        }
      }
    });

    // 🚀 开始测试
    await page.goto('/');
    // 等待应用完全加载
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });

    // 发送测试消息（触发流式输出）
    metrics.streamingStartTime = Date.now();
    await page.fill('[data-testid="chat-input"]', 'Write a detailed explanation about performance optimization in React. Include at least 5 key points.');
    await page.click('[data-testid="chat-send-button"]');

    // 等待流式输出完成
    await page.waitForSelector('[data-message-role="assistant"]', { timeout: 30000 });
    await page.waitForTimeout(2000); // 确保完全结束
    metrics.streamingEndTime = Date.now();

    // 📊 计算指标
    const streamingTime = metrics.streamingEndTime - metrics.streamingStartTime;
    const totalEvents = metrics.cacheHits + metrics.cacheMisses;
    const cacheHitRate = totalEvents > 0 ? (metrics.cacheHits / totalEvents) * 100 : 0;
    const avgRenderTime = metrics.renderTimes.length > 0
      ? metrics.renderTimes.reduce((a, b) => a + b, 0) / metrics.renderTimes.length
      : 0;
    const maxRenderTime = metrics.renderTimes.length > 0
      ? Math.max(...metrics.renderTimes)
      : 0;

    // 📝 输出测试报告
    console.log('\n' + '='.repeat(60));
    console.log('🟢 绿色测试：VirtualMessageList 缓存优化验证');
    console.log('='.repeat(60));
    console.log(`⏱️  流式输出时长: ${streamingTime}ms (阈值: <${MAX_STREAMING_TIME}ms)`);
    console.log(`✅ 缓存命中次数: ${metrics.cacheHits}`);
    console.log(`🔄 缓存未命中次数: ${metrics.cacheMisses}`);
    console.log(`📈 缓存命中率: ${cacheHitRate.toFixed(1)}% (阈值: >${MIN_CACHE_HIT_RATE}%)`);
    console.log(`⚡ 平均渲染时间: ${avgRenderTime.toFixed(2)}ms`);
    console.log(`🎯 最大渲染时间: ${maxRenderTime.toFixed(2)}ms (阈值: <${MAX_RENDER_TIME}ms)`);
    console.log('='.repeat(60) + '\n');

    // ✅ 断言：性能应该达标
    expect(streamingTime, '流式输出应该在 5 秒内完成').toBeLessThan(MAX_STREAMING_TIME);
    expect(cacheHitRate, '缓存命中率应该 > 80%').toBeGreaterThan(MIN_CACHE_HIT_RATE);
    expect(maxRenderTime, '最大渲染时间应该 < 50ms').toBeLessThan(MAX_RENDER_TIME);

    console.log('✅🟢 测试通过！性能优化生效，缓存命中率达标。\n');
  });

  test('🎯 基准测试：建立性能基线', async ({ page }) => {
    // 🎯 建立性能基线，用于后续回归测试

    const metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      renderTimes: [],
      uiResponseTime: [],
    };

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[useStableMessages] ✅ 缓存命中')) metrics.cacheHits++;
      if (text.includes('[useStableMessages] 🔄 重新计算')) {
        metrics.cacheMisses++;
        const match = text.match(/duration:\s*([\d.]+)ms/);
        if (match) metrics.renderTimes.push(parseFloat(match[1]));
      }
    });

    await page.goto('/');
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });

    // 发送测试消息
    const testMessage = 'What is the capital of France? Please respond with just the name.';
    await page.fill('[data-testid="chat-input"]', testMessage);
    await page.click('[data-testid="chat-send-button"]');

    // 监控 UI 响应时间
    const inputBox = page.locator('[data-testid="chat-input"]');
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await inputBox.focus();
      const end = Date.now();
      metrics.uiResponseTime.push(end - start);
      await page.waitForTimeout(200);
    }

    await page.waitForSelector('[data-message-role="assistant"]');
    await page.waitForTimeout(1000);

    // 📊 计算基线指标
    const totalEvents = metrics.cacheHits + metrics.cacheMisses;
    const cacheHitRate = totalEvents > 0 ? (metrics.cacheHits / totalEvents) * 100 : 0;
    const avgRenderTime = metrics.renderTimes.length > 0
      ? metrics.renderTimes.reduce((a, b) => a + b, 0) / metrics.renderTimes.length
      : 0;
    const avgUIResponse = metrics.uiResponseTime.reduce((a, b) => a + b, 0) / metrics.uiResponseTime.length;

    // 📝 输出基线报告
    console.log('\n' + '='.repeat(60));
    console.log('🎯 性能基线（用于回归测试）');
    console.log('='.repeat(60));
    console.log(`📈 缓存命中率基线: ${cacheHitRate.toFixed(1)}%`);
    console.log(`⚡ 平均渲染时间基线: ${avgRenderTime.toFixed(2)}ms`);
    console.log(`🖱️  平均 UI 响应时间基线: ${avgUIResponse.toFixed(2)}ms`);
    console.log('='.repeat(60));
    console.log('💡 提示：将这些值保存为基线，用于后续回归测试\n');

    // ✅ 断言：基线指标应该在合理范围内
    expect(cacheHitRate, '缓存命中率基线应该 > 70%').toBeGreaterThan(70);
    expect(avgRenderTime, '平均渲染时间基线应该 < 20ms').toBeLessThan(20);
    expect(avgUIResponse, 'UI 响应时间基线应该 < 100ms').toBeLessThan(100);

    console.log('✅ 基线测试完成：性能基线已建立\n');
  });
});
