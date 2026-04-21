import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test('🔬 真实 AI - 5条历史快速验证', async ({ page }) => {
  await setupE2ETestEnvironment(page, {
    useRealAI: true,
    skipWelcome: true,
  });

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);

  // ========== 生成 5 条历史 ==========
  console.log('\n📝 生成 5 条历史消息...');
  const result = await page.evaluate(async () => {
    const chatStore = (window as any).__chatStore;
    const messages = [];

    for (let i = 0; i < 5; i++) {
      if (i % 2 === 0) {
        messages.push({
          id: `msg-${i}`,
          role: 'user',
          content: `测试消息 ${i}`,
          timestamp: Date.now() - (5 - i) * 1000,
        });
      } else {
        messages.push({
          id: `msg-${i}`,
          role: 'assistant',
          content: `测试回复 ${i}`,
          timestamp: Date.now() - (5 - i) * 1000,
        });
      }
    }

    chatStore.setState({ messages });
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      messageCount: chatStore.getState().messages.length,
      expectedCount: 5
    };
  });

  console.log(`✅ 历史消息: ${result.messageCount}/${result.expectedCount}`);
  expect(result.messageCount).toBe(5);

  // ========== 发送 AI 请求 ==========
  console.log('\n🤖 发送 AI 请求: 你好');

  await page.evaluate(async () => {
    const chatStore = (window as any).__chatStore;
    const settingsStore = (window as any).__settingsStore;

    chatStore.getState().sendMessage(
      '你好',
      settingsStore.getState().currentProviderId,
      settingsStore.getState().currentModel
    );
  });

  // ========== 等待 AI 响应（30秒超时）==========
  console.log('⏳ 等待 AI 响应（最多30秒）...');

  const startTime = Date.now();

  try {
    await page.waitForFunction(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      const lastMessage = messages[messages.length - 1];
      return lastMessage &&
             lastMessage.role === 'assistant' &&
             !lastMessage.isStreaming &&
             lastMessage.content &&
             lastMessage.content.length > 0;
    }, { timeout: 30000 });

    const elapsed = Date.now() - startTime;
    console.log(`✅ AI 响应完成，耗时: ${elapsed}ms`);

    const finalState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      const lastMessage = messages[messages.length - 1];

      return {
        messageCount: messages.length,
        lastMessageRole: lastMessage?.role,
        lastMessageContent: lastMessage?.content?.substring(0, 100),
        lastMessageStatus: lastMessage?.status,
      };
    });

    console.log('📊 最终状态:', finalState);

    // sendMessageOrchestrator 创建新线程，手动设置的历史消息会被清除
    // 最终消息 = 1 条用户 + 1 条 AI
    expect(finalState.messageCount).toBe(2);
    expect(finalState.lastMessageRole).toBe('assistant');
    expect(finalState.lastMessageContent.length).toBeGreaterThan(0);
    expect(finalState.lastMessageStatus).toBe('completed');

    console.log('\n✅ 测试通过！Proxy 修复成功！');

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.log(`❌ 超时 (${elapsed}ms) - AI 未在 30 秒内响应`);

    // 检查是否有消息被创建
    const currentState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      const lastMessage = messages[messages.length - 1];

      return {
        messageCount: messages.length,
        lastMessageRole: lastMessage?.role,
        lastMessageStatus: lastMessage?.status,
        lastMessageContent: lastMessage?.content?.substring(0, 50),
      };
    });

    console.log('当前状态:', currentState);

    if (currentState.lastMessageStatus === 'streaming') {
      console.log('⚠️ AI 仍在流式响应中（响应很慢）');
    } else if (currentState.lastMessageStatus === 'interrupted') {
      console.log('❌ AI 响应被中断（可能超时）');
    }

    throw error;
  }
});
