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
  // 🔥 FIX: 串行执行，避免测试互相干扰（chatStore 状态污染）
  test.describe.configure({ mode: 'serial' });

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
   *
   * 🔥 FIX: 复用对比测试的代码逻辑
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

    // 🔥 FIX: 确保页面已完全加载后再生成历史消息
    // 因为 beforeEach 会调用 page.goto('/') 重新加载页面
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500); // 额外等待，确保 store 初始化完成

    // 🔥 FIX: 预热 page.evaluate，模拟对比测试的行为
    // 对比测试在循环中多次调用 page.evaluate，第一次可能触发某种初始化
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      console.log('[E2E] 🔥 预热: chatStore 存在', !!chatStore);
    });

    // 🔥 FIX: 等待 PersistenceManager 的 recoverSessions 完成
    // PersistenceManager 在模块加载时会执行 recoverSessions，将 streaming 状态的消息标记为 interrupted
    // 需要等待这个自愈过程完成后再发送 AI 请求
    await page.waitForTimeout(2000);

    // ========== 步骤 1：生成 10000 条历史消息 ==========
    console.log('\n📝 步骤 1: 生成 10000 条历史消息...');
    const historyStartTime = Date.now();

    try {
      const result = await page.evaluate(async () => {
        // 🔥 FIX: 使用 (window as any).__chatStore，与对比测试完全一致
        const chatStore = (window as any).__chatStore;

        if (!chatStore) {
          return { success: false, error: 'chatStore 未定义' };
        }

        const messages = [];

        for (let i = 0; i < 10000; i++) {
          if (i % 2 === 0) {
            messages.push({
              id: `msg-${i}`,
              role: 'user',
              content: `测试消息 ${i}`,
              timestamp: Date.now() - (10000 - i) * 1000,
            });
          } else {
            messages.push({
              id: `msg-${i}`,
              role: 'assistant',
              content: `测试回复 ${i}`,
              timestamp: Date.now() - (10000 - i) * 1000,
            });
          }
        }

        // 🔥 FIX: 使用与对比测试完全相同的代码
        chatStore.setState({ messages });
        await new Promise(resolve => setTimeout(resolve, 100));

        const actualCount = chatStore.getState().messages.length;

        return {
          success: true,
          actualCount,
          expectedCount: 10000,
        };
      });

      console.log('[E2E] 📊 page.evaluate 返回结果:', JSON.stringify(result));

      if (!result.success) {
        throw new Error(`page.evaluate 失败: ${result.error}`);
      }

      if (result.actualCount !== result.expectedCount) {
        console.error(`[E2E] ❌ 消息数量不匹配: 期望 ${result.expectedCount}, 实际 ${result.actualCount}`);
      }
    } catch (error) {
      console.error('[E2E] ❌ page.evaluate 执行失败:', error.message);
      throw error;
    }

    // 🔍 调试：验证历史消息是否真的被保存
    const messageCount = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore?.getState()?.messages?.length || 0;
    });
    console.log(`[E2E] 📊 历史消息验证: 期望 10000 条，实际 ${messageCount} 条`);

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

        // 🔍 诊断：在发送消息前检查当前状态
        const currentState = chatStore.getState();
        console.log('[E2E] 📊 发送前状态:', {
          messageCount: currentState.messages?.length || 0,
          providerId: settingsStore.getState().currentProviderId,
          model: settingsStore.getState().currentModel,
        });

        console.log('[E2E] 发送测试消息...');
        // 🔍 诊断：使用简单消息（与对比测试相同）来验证中断是否与消息复杂度有关
        // 原始复杂消息：'请用一句话总结一下前面的讨论内容'
        const testMessage = '你好'; // 简单消息，与对比测试一致
        console.log(`[E2E] 测试消息: "${testMessage}"`);
        chatStore.getState().sendMessage(
          testMessage,
          settingsStore.getState().currentProviderId,
          settingsStore.getState().currentModel
        );

        // 🔍 诊断：发送后立即检查状态
        setTimeout(() => {
          const afterState = chatStore.getState();
          console.log('[E2E] 📊 发送后状态:', {
            messageCount: afterState.messages?.length || 0,
            lastMessageRole: afterState.messages?.[afterState.messages.length - 1]?.role,
            lastMessageStatus: afterState.messages?.[afterState.messages.length - 1]?.status,
          });
        }, 100);
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
   * - 500 条历史 + 真实 AI
   * - 1000 条历史 + 真实 AI
   * - 5000 条历史 + 真实 AI
   * - 10000 条历史 + 真实 AI
   *
   * 🔥 TEMP: 临时启用，验证历史消息生成是否真的失败
   */
  test('📊 [对比] 不同历史长度性能对比 - 寻找中断临界点', async ({ page }) => {
    const hasApiKey = !!process.env.E2E_AI_API_KEY;
    if (!hasApiKey) {
      console.log('⚠️  跳过测试：未配置 E2E_AI_API_KEY');
      test.skip();
      return;
    }

    const historySizes = [100, 500, 1000, 5000, 10000];
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

        // 等待响应完成或超时
        let completed = false;
        let interrupted = false;

        try {
          await page.waitForFunction(() => {
            const chatStore = (window as any).__chatStore;
            const messages = chatStore?.getState()?.messages || [];
            const lastMessage = messages[messages.length - 1];
            return lastMessage && lastMessage.role === 'assistant' && !lastMessage.isStreaming;
          }, { timeout: 60000 });
          completed = true;
        } catch (error) {
          // 超时，检查是否被中断
          const finalState = await page.evaluate(() => {
            const chatStore = (window as any).__chatStore;
            const messages = chatStore?.getState()?.messages || [];
            const lastMessage = messages[messages.length - 1];
            return {
              hasLast: !!lastMessage,
              role: lastMessage?.role,
              isStreaming: lastMessage?.isStreaming,
              status: lastMessage?.status,
              hasContent: !!lastMessage?.content,
              contentLength: lastMessage?.content?.length || 0,
              contentPreview: lastMessage?.content?.substring(0, 50),
            };
          });

          if (finalState.status === 'interrupted' || finalState.isStreaming) {
            interrupted = true;
            console.log(`⚠️  AI 响应被中断`);
          }
        }

        const aiTime = Date.now() - aiStart;

        results.push({
          historySize: size,
          historyTime,
          aiTime,
          slowRenders: renderMetrics.slowRenders,
          totalRenders: renderMetrics.totalRenders,
          completed,
          interrupted,
        });

        const status = completed ? '✅' : (interrupted ? '⚠️ 中断' : '❌');
        console.log(`${status} 历史: ${size}, 生成: ${historyTime}ms, AI: ${aiTime}ms, 慢渲染: ${renderMetrics.slowRenders}/${renderMetrics.totalRenders}`);

      } finally {
        page.off('console', consoleListener);
      }
    }

    // 输出对比结果
    console.log('\n' + '='.repeat(80));
    console.log('📊 性能对比结果 - 寻找中断临界点');
    console.log('='.repeat(80));
    console.log('\n历史数量 | 历史生成 | AI 响应 | 状态     | 慢渲染');
    console.log('-'.repeat(80));
    results.forEach(r => {
      const statusText = r.completed ? '✅ 完成' : (r.interrupted ? '⚠️ 中断' : '❌ 失败');
      const slowRenderText = r.totalRenders > 0 ? `${r.slowRenders}/${r.totalRenders}` : '0/0';
      console.log(`${r.historySize.toString().padStart(8)} | ${r.historyTime.toString().padStart(8)}ms | ${r.aiTime.toString().padStart(7)}ms | ${statusText.padEnd(8)} | ${slowRenderText}`);
    });
    console.log('='.repeat(80) + '\n');

    // 分析趋势和临界点
    const interruptedResults = results.filter(r => r.interrupted);
    const completedResults = results.filter(r => r.completed);

    console.log('📊 测试分析:');
    console.log(`   - 成功: ${completedResults.length}/${results.length}`);
    console.log(`   - 中断: ${interruptedResults.length}/${results.length}`);

    if (interruptedResults.length > 0) {
      console.log('\n🚨 发现中断的历史数量:');
      interruptedResults.forEach(r => {
        console.log(`   - ${r.historySize} 条: AI 响应 ${r.aiTime}ms 后被中断`);
      });

      // 找出临界点
      const firstInterrupted = interruptedResults[0];
      const lastCompleted = completedResults[completedResults.length - 1];

      if (lastCompleted) {
        console.log(`\n💡 临界点分析:`);
        console.log(`   - 最大成功: ${lastCompleted.historySize} 条`);
        console.log(`   - 最早中断: ${firstInterrupted.historySize} 条`);
        console.log(`   - 临界范围: ${lastCompleted.historySize} - ${firstInterrupted.historySize} 条之间`);
      } else {
        console.log(`\n💡 所有测试都中断了，最早中断: ${interruptedResults[0].historySize} 条`);
      }

      console.log('\n🔧 建议:');
      console.log('   - 实现对话摘要功能，压缩长历史');
      console.log('   - 限制发送给 AI 的历史消息数量（如 200 条）');
      console.log('   - 检查 AI 服务的上下文窗口限制');
      console.log('   - 增加超时时间配置');
    } else {
      console.log('\n✅ 所有历史长度测试都成功，未发现中断问题');
    }
  });
});
