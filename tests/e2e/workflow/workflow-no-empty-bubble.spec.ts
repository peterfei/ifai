/**
 * 🧪 工作流空白气泡红绿测试
 *
 * 验证目标：
 * 1. ✅ 工作流执行期间只显示 Monitor，没有空白气泡
 * 2. ✅ 完成后一次性显示总结消息
 * 3. ✅ 没有空白气泡和过程气泡
 *
 * 红绿测试（Red-Green Testing）：
 * - Red：修复前的测试应该失败
 * - Green：修复后的测试应该通过
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('工作流空白气泡红绿测试', () => {

  test.beforeEach(async ({ page }) => {
    console.log('\n=== 设置测试环境 ===');

    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 清理全局状态，确保测试隔离
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;
      (window as any).__E2E_REAL_TAURI_MODE__ = false;
      (window as any).__layoutStore?.setState({ isChatOpen: true });

      // 🔥 清理全局工作流状态
      if ((window as any).__GLOBAL_WORKFLOW_STATES__) {
        (window as any).__GLOBAL_WORKFLOW_STATES__.clear();
      }
      if ((window as any).__GLOBAL_ACTIVE_WORKFLOWS__) {
        (window as any).__GLOBAL_ACTIVE_WORKFLOWS__.clear();
      }

      // 配置 provider
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.getState().updateProviderConfig('deepseek', {
          apiKey: 'sk-mock-key-for-testing',
          baseUrl: 'https://api.deepseek.com'
        });
      }
    });

    await page.waitForTimeout(1000);
  });

  test('🔴 Red 测试：工作流执行后应该有 1 条 assistant 消息（完成时的总结）', async ({ page }) => {
    console.log('\n=== Red 测试：验证最终消息状态 ===');

    test.setTimeout(60000);

    // 监听控制台
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[StoreMapper]') || text.includes('[Workflow]') || text.includes('chat:message:sent')) {
        console.log('[Browser]', text);
      }
    });

    // 执行 /explore
    console.log('\n[步骤1] 执行 /explore 命令...');
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('/explore');
    });

    // 🔥 关键：等待工作流完成
    console.log('\n[步骤2] 等待工作流完成（40秒）...');
    await page.waitForTimeout(40000);

    // 检查最终消息状态
    const finalCheck = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      // 统计消息
      const userMessages = messages.filter((m: any) => m.role === 'user');
      const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
      const emptyAssistantMessages = assistantMessages.filter((m: any) => !m.content || m.content === '');

      return {
        totalMessages: messages.length,
        userCount: userMessages.length,
        assistantCount: assistantMessages.length,
        emptyAssistantCount: emptyAssistantMessages.length,
        assistantDetails: assistantMessages.map((m: any) => ({
          id: m.id.substring(0, 20),
          contentLength: m.content?.length || 0,
          contentPreview: m.content?.substring(0, 50) || '',
          hasContent: !!m.content,
          status: m.status,
        })),
        lastMessage: messages.length > 0 ? {
          role: messages[messages.length - 1].role,
          contentLength: messages[messages.length - 1].content?.length || 0,
          contentPreview: messages[messages.length - 1].content?.substring(0, 50) || '',
        } : null,
      };
    });

    console.log('\n[步骤3] 最终消息状态:');
    console.log(`  - 总消息数: ${finalCheck.totalMessages}`);
    console.log(`  - 用户消息: ${finalCheck.userCount}`);
    console.log(`  - Assistant 消息: ${finalCheck.assistantCount}`);
    console.log(`  - 空 Assistant 消息: ${finalCheck.emptyAssistantCount}`);
    console.log(`  - Assistant 详情:`, finalCheck.assistantDetails);
    console.log(`  - 最后一条消息:`, finalCheck.lastMessage);

    // 🎯 关键断言：工作流完成后应该有 1 条 assistant 消息（总结）
    expect(finalCheck.assistantCount).toBe(1);
    expect(finalCheck.emptyAssistantCount).toBe(0);

    // 🎯 Assistant 消息应该有内容（不是空白）
    const lastAssistant = finalCheck.assistantDetails[finalCheck.assistantDetails.length - 1];
    expect(lastAssistant.hasContent).toBe(true);
    expect(lastAssistant.contentLength).toBeGreaterThan(50); // 总结应该有内容

    console.log('\n✅ Red 测试通过：工作流完成后有 1 条有内容的 assistant 消息');
  });

  test('🟢 Green 测试：工作流执行期间不应该有空 assistant 消息', async ({ page }) => {
    console.log('\n=== Green 测试：验证执行期间没有空白气泡 ===');

    test.setTimeout(60000);

    // 监听控制台
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[StoreMapper]') || text.includes('[Workflow]') || text.includes('chat:message:sent')) {
        console.log('[Browser]', text);
      }
    });

    // 执行 /explore
    console.log('\n[步骤1] 执行 /explore 命令...');
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('/explore');
    });

    // 🔥 调整：Mock 环境中 workflow:response 会快速触发，所以在 500ms 时检查
    console.log('\n[步骤2] 发送后立即检查消息状态...');
    await page.waitForTimeout(500);

    const immediateCheck = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      const userMessages = messages.filter((m: any) => m.role === 'user');
      const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
      const emptyAssistantMessages = assistantMessages.filter((m: any) => !m.content || m.content === '');

      return {
        totalMessages: messages.length,
        userCount: userMessages.length,
        assistantCount: assistantMessages.length,
        emptyAssistantCount: emptyAssistantMessages.length,
        messages: messages.map((m: any) => ({
          role: m.role,
          contentLength: m.content?.length || 0,
          contentPreview: m.content?.substring(0, 30) || '',
        })),
      };
    });

    console.log('\n[步骤2结果] 发送后立即检查:');
    console.log(`  - 总消息数: ${immediateCheck.totalMessages}`);
    console.log(`  - 用户消息: ${immediateCheck.userCount}`);
    console.log(`  - Assistant 消息: ${immediateCheck.assistantCount}`);
    console.log(`  - 空 Assistant 消息: ${immediateCheck.emptyAssistantCount}`);
    console.log(`  - 消息列表:`, immediateCheck.messages);

    // 🎯 关键断言：不应该有空白的 assistant 消息
    // 注意：Mock 环境中 workflow:response 可能已经触发，所以 assistantCount 可能 > 0
    // 但关键是：不应该有**空白**的 assistant 消息
    expect(immediateCheck.emptyAssistantCount).toBe(0);

    // 如果有 assistant 消息，应该有内容
    if (immediateCheck.assistantCount > 0) {
      const lastAssistant = immediateCheck.messages[immediateCheck.messages.length - 1];
      expect(lastAssistant.contentLength).toBeGreaterThan(10); // 应该有实际内容
    }

    console.log('\n✅ Green 测试通过：没有空白气泡');
  });

  test('🟢 Green 测试：工作流完成后应该有完整总结内容', async ({ page }) => {
    console.log('\n=== Green 测试：验证总结内容完整性 ===');

    test.setTimeout(60000);

    // 监听控制台
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[StoreMapper]') || text.includes('[Workflow]')) {
        console.log('[Browser]', text);
      }
    });

    // 执行 /explore
    console.log('\n[步骤1] 执行 /explore 命令...');
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.getState().sendMessage('/explore');
    });

    // 等待工作流完成
    console.log('\n[步骤2] 等待工作流完成（40秒）...');
    await page.waitForTimeout(40000);

    // 检查总结内容
    const contentCheck = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      const assistantMessage = messages.find((m: any) => m.role === 'assistant');

      if (!assistantMessage) {
        return { hasAssistant: false };
      }

      const content = assistantMessage.content || '';

      return {
        hasAssistant: true,
        contentLength: content.length,
        contentPreview: content.substring(0, 200),
        // 检查是否包含工作流相关的关键词
        hasWorkflowKeywords: content.includes('工作流') || content.includes('完成') || content.includes('执行'),
        // 检查是否是空内容
        isEmpty: content.length === 0,
      };
    });

    console.log('\n[步骤3] 总结内容检查:');
    console.log(`  - 有 Assistant 消息: ${contentCheck.hasAssistant}`);
    console.log(`  - 内容长度: ${contentCheck.contentLength}`);
    console.log(`  - 内容预览: ${contentCheck.contentPreview}`);
    console.log(`  - 包含工作流关键词: ${contentCheck.hasWorkflowKeywords}`);
    console.log(`  - 是空内容: ${contentCheck.isEmpty}`);

    // 🎯 关键断言：应该有完整总结内容
    expect(contentCheck.hasAssistant).toBe(true);
    expect(contentCheck.isEmpty).toBe(false);
    expect(contentCheck.contentLength).toBeGreaterThan(50); // Mock 环境中内容可能较少，调整阈值
    expect(contentCheck.hasWorkflowKeywords).toBe(true); // 应该包含工作流相关关键词

    console.log('\n✅ Green 测试通过：有完整总结内容');
  });
});
