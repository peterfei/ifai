/**
 * 🔬 长历史 + 真实 AI 流式响应性能测试
 *
 * 问题描述：
 * 客户反馈在长历史消息（10000+）场景下，LLM 生成信息时有卡顿
 *
 * 测试目标：
 * - 模拟 10000 条长历史消息
 * - 使用真实 AI 测试流式响应性能
 * - 检测渲染卡顿的具体原因
 * - 分析每次 content_delta 的渲染延迟
 *
 * @author Performance Testing Team
 * @version 1.0
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('🔬 长历史真实 AI 性能测试', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: true,
      skipWelcome: true,
    });
  });

  /**
   * 🎯 核心测试：10000 条历史 + 真实 AI 流式响应
   *
   * 测试场景：
   * 1. 生成 10000 条历史消息
   * 2. 发送真实 AI 请求
   * 3. 监控每次 content_delta 的渲染时间
   * 4. 检测是否有卡顿（渲染时间 > 100ms）
   */
  test('🔬 [真实 AI] 10000 条历史 + 流式响应卡顿检测', async ({ page }) => {
    // 检查 API Key
    const hasApiKey = !!process.env.E2E_AI_API_KEY;
    if (!hasApiKey) {
      console.log('⚠️  跳过测试：未配置 E2E_AI_API_KEY');
      test.skip();
      return;
    }

    console.log('\n' + '='.repeat(80));
    console.log('🔬 长历史 + 真实 AI 流式响应性能测试');
    console.log('='.repeat(80));

    // ========== 步骤 1：生成 10000 条历史消息 ==========
    console.log('\n📝 步骤 1: 生成 10000 条历史消息...');
    const historyStartTime = Date.now();

    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const messages = [];

      // 使用 realistic 分布生成 10000 条消息
      const topics = ['性能优化', '代码重构', '架构设计', '算法实现', '调试技巧', '测试方法'];
      const actions = ['如何', '怎么', '最佳实践', '有哪些', '为什么'];

      for (let i = 0; i < 10000; i++) {
        const isUser = i % 2 === 0;
        const topic = topics[Math.floor(Math.random() * topics.length)];
        const action = actions[Math.floor(Math.random() * actions.length)];

        if (isUser) {
          messages.push({
            id: `msg-${i}`,
            role: 'user',
            content: `${action}进行${topic}？`,
            timestamp: Date.now() - (10000 - i) * 1000,
          });
        } else {
          messages.push({
            id: `msg-${i}`,
            role: 'assistant',
            content: `关于${topic}的${action}，这是一个详细的回答...`,
            timestamp: Date.now() - (10000 - i) * 1000,
          });
        }
      }

      chatStore.setState({ messages });
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const historyTime = Date.now() - historyStartTime;
    console.log(`✅ 历史消息生成完成，耗时: ${historyTime}ms`);

    // ========== 步骤 2：设置性能监控 ==========
    const performanceMetrics = {
      deltaCount: 0,
      renderTimes: [],
      slowRenders: [], // > 100ms 的渲染
      verySlowRenders: [], // > 500ms 的渲染
      totalStreamingTime: 0,
    };

    // 监听渲染性能
    const consoleListener = (msg: any) => {
      const text = msg.text();

      // 监控渲染性能日志
      if (text.includes('[Performance]') || text.includes('render')) {
        const match = text.match(/render:\s*([\d.]+)ms/);
        if (match) {
          const renderTime = parseFloat(match[1]);
          performanceMetrics.renderTimes.push(renderTime);

          if (renderTime > 500) {
            performanceMetrics.verySlowRenders.push(renderTime);
          } else if (renderTime > 100) {
            performanceMetrics.slowRenders.push(renderTime);
          }
        }
      }

      // 监控内容增量
      if (text.includes('[Streaming] content_delta')) {
        performanceMetrics.deltaCount++;
      }
    };

    page.on('console', consoleListener);

    try {
      // ========== 步骤 3：发送真实 AI 请求 ==========
      console.log('\n🤖 步骤 2: 发送真实 AI 请求...');
      const aiStartTime = Date.now();

      await page.evaluate(async () => {
        const chatStore = (window as any).__chatStore;
        const settingsStore = (window as any).__settingsStore;

        if (!chatStore || !settingsStore) {
          throw new Error('chatStore or settingsStore not initialized');
        }

        console.log('[E2E] 发送测试消息...');
        chatStore.getState().sendMessage(
          '请用一句话总结一下前面的讨论内容',
          settingsStore.getState().currentProviderId,
          settingsStore.getState().currentModel
        );
      });

      // ========== 步骤 4：等待流式响应完成 ==========
      console.log('⏳ 等待流式响应...');
      console.log('[E2E] 等待 AI 开始响应...');

      // 先等待消息开始流式
      try {
        await page.waitForFunction(() => {
          const chatStore = (window as any).__chatStore;
          const messages = chatStore?.getState()?.messages || [];
          const lastMessage = messages[messages.length - 1];
          console.log('[E2E] 检查消息状态:', {
            hasLast: !!lastMessage,
            role: lastMessage?.role,
            isStreaming: lastMessage?.isStreaming,
            hasContent: !!lastMessage?.content,
            contentLength: lastMessage?.content?.length || 0,
          });
          return lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming;
        }, { timeout: 30000 });

        console.log('[E2E] ✅ AI 开始流式响应');

        // 等待流式完成
        await page.waitForFunction(() => {
          const chatStore = (window as any).__chatStore;
          const messages = chatStore?.getState()?.messages || [];
          const lastMessage = messages[messages.length - 1];

          return lastMessage &&
                 lastMessage.role === 'assistant' &&
                 !lastMessage.isStreaming &&
                 lastMessage.content &&
                 lastMessage.content.length > 0;
        }, { timeout: 120000 });

        performanceMetrics.totalStreamingTime = Date.now() - aiStartTime;
        console.log(`✅ 流式响应完成，耗时: ${performanceMetrics.totalStreamingTime}ms`);

      } catch (error) {
        performanceMetrics.totalStreamingTime = Date.now() - aiStartTime;
        console.error(`❌ 等待流式响应超时或失败: ${error.message}`);

        // 获取当前状态
        const currentState = await page.evaluate(() => {
          const chatStore = (window as any).__chatStore;
          const messages = chatStore?.getState()?.messages || [];
          const lastMessage = messages[messages.length - 1];
          return {
            messageCount: messages.length,
            lastMessageRole: lastMessage?.role,
            isStreaming: lastMessage?.isStreaming,
            hasContent: !!lastMessage?.content,
            contentLength: lastMessage?.content?.length || 0,
            status: lastMessage?.status,
            lastMessageContent: lastMessage?.content?.substring(0, 100),
          };
        });

        console.log('[E2E] 超时时消息状态:', currentState);

        // 如果有内容就认为部分成功
        if (currentState.lastMessageRole === 'assistant' && currentState.hasContent) {
          console.log('[E2E] AI 已开始响应，但可能未完成，继续测试...');
        } else {
          throw new Error(`AI 响应失败: 超时且无内容。状态: ${JSON.stringify(currentState)}`);
        }
      }

    } finally {
      page.off('console', consoleListener);
    }

    // ========== 步骤 5：分析性能数据 ==========
    console.log('\n' + '='.repeat(80));
    console.log('📊 性能测试结果');
    console.log('='.repeat(80));
    console.log(`\n⏱️  时间统计:`);
    console.log(`   - 历史消息生成: ${historyTime}ms`);
    console.log(`   - 流式响应总时长: ${performanceMetrics.totalStreamingTime}ms`);
    console.log(`\n📝 内容增量:`);
    console.log(`   - 增量次数: ${performanceMetrics.deltaCount}`);
    if (performanceMetrics.deltaCount > 0) {
      console.log(`   - 平均每次增量: ${(performanceMetrics.totalStreamingTime / performanceMetrics.deltaCount).toFixed(2)}ms`);
    }
    console.log(`\n⚡ 渲染性能:`);
    console.log(`   - 渲染次数: ${performanceMetrics.renderTimes.length}`);
    if (performanceMetrics.renderTimes.length > 0) {
      const avgRender = performanceMetrics.renderTimes.reduce((a, b) => a + b, 0) / performanceMetrics.renderTimes.length;
      const maxRender = Math.max(...performanceMetrics.renderTimes);
      console.log(`   - 平均渲染时间: ${avgRender.toFixed(2)}ms`);
      console.log(`   - 最大渲染时间: ${maxRender}ms`);
    }
    console.log(`\n🚨 卡顿检测:`);
    console.log(`   - 慢渲染 (>100ms): ${performanceMetrics.slowRenders.length} 次`);
    if (performanceMetrics.slowRenders.length > 0) {
      console.log(`     - 平均: ${(performanceMetrics.slowRenders.reduce((a, b) => a + b, 0) / performanceMetrics.slowRenders.length).toFixed(2)}ms`);
      console.log(`     - 最大: ${Math.max(...performanceMetrics.slowRenders)}ms`);
    }
    console.log(`   - 严重卡顿 (>500ms): ${performanceMetrics.verySlowRenders.length} 次`);
    if (performanceMetrics.verySlowRenders.length > 0) {
      console.log(`     - 平均: ${(performanceMetrics.verySlowRenders.reduce((a, b) => a + b, 0) / performanceMetrics.verySlowRenders.length).toFixed(2)}ms`);
      console.log(`     - 最大: ${Math.max(...performanceMetrics.verySlowRenders)}ms`);
    }
    console.log('='.repeat(80) + '\n');

    // ========== 步骤 6：性能问题诊断 ==========
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (performanceMetrics.slowRenders.length > 5) {
      issues.push(`🔴 发现 ${performanceMetrics.slowRenders.length} 次慢渲染 (>100ms)`);
      recommendations.push('建议：优化 useStableMessages 的缓存策略');
    }

    if (performanceMetrics.verySlowRenders.length > 0) {
      issues.push(`🔴 发现 ${performanceMetrics.verySlowRenders.length} 次严重卡顿 (>500ms)`);
      recommendations.push('建议：检查是否有昂贵的 DOM 操作或计算');
      recommendations.push('建议：使用 React.memo 和 useMemo 优化组件');
    }

    if (performanceMetrics.totalStreamingTime > 30000) {
      issues.push(`🔴 流式响应时间过长: ${performanceMetrics.totalStreamingTime}ms > 30s`);
      recommendations.push('建议：检查是否有同步阻塞操作');
    }

    // 输出诊断结果
    if (issues.length > 0) {
      console.log('🚨 发现性能问题:');
      issues.forEach(issue => console.log(`  ${issue}`));
      console.log('\n💡 优化建议:');
      recommendations.forEach(rec => console.log(`  ${rec}`));
    } else {
      console.log('✅ 未发现明显性能问题');
    }

    console.log('');

    // 核心断言
    expect(performanceMetrics.verySlowRenders.length, '严重卡顿应该少于 2 次').toBeLessThan(2);
    expect(performanceMetrics.totalStreamingTime, '流式响应应该在 60s 内完成').toBeLessThan(60000);
  });

  /**
   * 📊 对比测试：不同历史长度的性能对比
   *
   * 测试场景：
   * - 100 条历史 + 真实 AI
   * - 1000 条历史 + 真实 AI
   * - 10000 条历史 + 真实 AI
   */
  test('📊 [对比] 不同历史长度性能对比', async ({ page }) => {
    const hasApiKey = !!process.env.E2E_AI_API_KEY;
    if (!hasApiKey) {
      console.log('⚠️  跳过测试：未配置 E2E_AI_API_KEY');
      test.skip();
      return;
    }

    const historySizes = [100, 1000, 10000];
    const results: any[] = [];

    for (const size of historySizes) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📊 测试 ${size} 条历史消息`);
      console.log(`${'='.repeat(80)}`);

      // 生成历史消息
      const historyStart = Date.now();
      await page.evaluate(async (count) => {
        const chatStore = (window as any).__chatStore;
        const messages = [];

        for (let i = 0; i < count; i++) {
          if (i % 2 === 0) {
            messages.push({
              id: `msg-${i}`,
              role: 'user',
              content: `测试消息 ${i}`,
              timestamp: Date.now() - (count - i) * 1000,
            });
          } else {
            messages.push({
              id: `msg-${i}`,
              role: 'assistant',
              content: `测试回复 ${i}`,
              timestamp: Date.now() - (count - i) * 1000,
            });
          }
        }

        chatStore.setState({ messages });
        await new Promise(resolve => setTimeout(resolve, 100));
      }, size);
      const historyTime = Date.now() - historyStart;

      // 发送 AI 请求并测量
      const renderMetrics = {
        slowRenders: 0,
        totalRenders: 0,
      };

      const consoleListener = (msg: any) => {
        const text = msg.text();
        if (text.includes('[Performance]') || text.includes('render')) {
          const match = text.match(/render:\s*([\d.]+)ms/);
          if (match) {
            renderMetrics.totalRenders++;
            if (parseFloat(match[1]) > 100) {
              renderMetrics.slowRenders++;
            }
          }
        }
      };

      page.on('console', consoleListener);

      try {
        const aiStart = Date.now();

        await page.evaluate(async () => {
          const chatStore = (window as any).__chatStore;
          const settingsStore = (window as any).__settingsStore;
          chatStore.getState().sendMessage(
            '你好',
            settingsStore.getState().currentProviderId,
            settingsStore.getState().currentModel
          );
        });

        await page.waitForFunction(() => {
          const chatStore = (window as any).__chatStore;
          const messages = chatStore?.getState()?.messages || [];
          const lastMessage = messages[messages.length - 1];
          return lastMessage && lastMessage.role === 'assistant' && !lastMessage.isStreaming;
        }, { timeout: 60000 });

        const aiTime = Date.now() - aiStart;

        results.push({
          historySize: size,
          historyTime,
          aiTime,
          slowRenders: renderMetrics.slowRenders,
          totalRenders: renderMetrics.totalRenders,
        });

        console.log(`✅ 历史生成: ${historyTime}ms, AI 响应: ${aiTime}ms, 慢渲染: ${renderMetrics.slowRenders}/${renderMetrics.totalRenders}`);

      } finally {
        page.off('console', consoleListener);
      }
    }

    // 输出对比结果
    console.log('\n' + '='.repeat(80));
    console.log('📊 性能对比结果');
    console.log('='.repeat(80));
    console.log('\n历史数量 | 历史生成 | AI 响应 | 慢渲染/总渲染');
    console.log('-'.repeat(80));
    results.forEach(r => {
      const ratio = r.totalRenders > 0 ? (r.slowRenders / r.totalRenders * 100).toFixed(1) : '0';
      console.log(`${r.historySize.toString().padStart(8)} | ${r.historyTime.toString().padStart(8)}ms | ${r.aiTime.toString().padStart(7)}ms | ${r.slowRenders}/${r.totalRenders} (${ratio}%)`);
    });
    console.log('='.repeat(80) + '\n');

    // 分析趋势
    const lastResult = results[results.length - 1];
    if (lastResult.slowRenders > results[0].slowRenders * 5) {
      console.log('🚨 警告：随着历史消息增加，慢渲染次数显著增加！');
    } else {
      console.log('✅ 性能表现稳定，历史消息对渲染性能影响较小');
    }
  });
});
