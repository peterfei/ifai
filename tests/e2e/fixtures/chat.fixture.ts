import { Page, TestInfo } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';
import { waitForChatReady } from '../helpers/wait-helpers';

/**
 * 聊天功能测试Fixture
 * 提供聊天相关测试的通用设置
 */

export async function setupChatTest(
  page: Page,
  testInfo?: TestInfo
): Promise<{ page: Page }> {
  // 设置基础E2E环境
  await setupE2ETestEnvironment(page);

  // 导航到首页
  await page.goto('/');

  // 等待聊天组件就绪
  await waitForChatReady(page);

  // 如果有testInfo，添加测试截图
  if (testInfo) {
    await page.screenshot({
      path: `test-results/${testInfo.title}-before.png`
    });
  }

  return { page };
}

/**
 * 设置带有预设消息的聊天测试
 */
export async function setupChatTestWithMessages(
  page: Page,
  messages: Array<{ role: string; content: string }>
): Promise<{ page: Page }> {
  await setupChatTest(page);

  // 通过store注入预设消息
  await page.evaluate((msgList) => {
    const chatStore = (window as any).__chatStore?.getState();
    if (chatStore) {
      msgList.forEach((msg) => {
        chatStore.messages.push({
          id: `preset-${Date.now()}-${Math.random()}`,
          role: msg.role,
          content: { Text: msg.content },
          timestamp: Date.now(),
          status: 'completed'
        });
      });
    }
  }, messages);

  return { page };
}

/**
 * 发送测试消息的便捷函数
 */
export async function sendTestMessage(
  page: Page,
  message: string
): Promise<void> {
  // 通过store直接发送消息（比UI交互更快）
  await page.evaluate((text) => {
    const chatStore = (window as any).__chatStore?.getState();
    if (chatStore && chatStore.sendMessage) {
      chatStore.sendMessage(text, 'ollama-e2e', 'mock-model');
    }
  }, message);
}

/**
 * 等待响应完成的便捷函数
 */
export async function waitForResponse(
  page: Page,
  options: { timeout?: number; messageCount?: number } = {}
): Promise<void> {
  const { timeout = 10000, messageCount } = options;

  if (messageCount !== undefined) {
    await page.waitForFunction(
      (expectedCount) => {
        const chatStore = (window as any).__chatStore?.getState();
        return chatStore?.messages?.length >= expectedCount;
      },
      messageCount,
      { timeout }
    );
  } else {
    // 等待加载状态结束
    await page.waitForSelector(
      '[data-status="completed"], .message-status.completed',
      { timeout }
    );
  }
}

/**
 * 清除所有聊天消息
 */
export async function clearChatMessages(page: Page): Promise<void> {
  await page.evaluate(() => {
    const chatStore = (window as any).__chatStore?.getState();
    if (chatStore) {
      chatStore.messages = [];
    }
  });
}
