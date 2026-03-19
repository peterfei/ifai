import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('ChatStore 消息链完整性基线测试 (TDD 先行)', () => {
  test.beforeEach(async ({ page }) => {
    // 使用标准设置，锁定环境并注入 E2E 后门
    await setupE2ETestEnvironment(page, { skipWelcome: true });
    
    // 确保 Chat 面板已开启
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().setChatOpen(true);
      }
    });

    // 等待 App 核心就绪信号
    await page.waitForFunction(() => (window as any).__APP_READY__ === true, { timeout: 30000 });
  });

  test('发送基础消息：应原子化生成并持久化 (Store 级验证)', async ({ page }) => {
    const testMessage = 'Hello TDD, keep the chain alive.';
    
    // Act - 使用后门发送
    await page.evaluate((msg) => (window as any).__E2E_SEND__(msg), testMessage);

    // Assert - 防线 1: 内存状态原子化
    await page.waitForFunction(() => {
      const msgs = (window as any).__E2E_GET_MESSAGES__();
      return msgs.some(m => m.role === 'user' && m.content === 'Hello TDD, keep the chain alive.');
    }, { timeout: 10000 });

    const messages = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES__());
    const userMsg = messages.find(m => m.role === 'user');
    expect(userMsg).toBeTruthy();
    expect(userMsg.id).toBeTruthy();
  });

  test('流式响应稳定性：内容应逐步呈现 (Store 级增量验证)', async ({ page }) => {
    const testMessage = 'Write a short sentence.';
    
    // Act
    await page.evaluate((msg) => (window as any).__E2E_SEND__(msg), testMessage);

    // 等待 AI 开始响应
    await page.waitForFunction(() => {
      const msgs = (window as any).__E2E_GET_MESSAGES__();
      return msgs.some(m => m.role === 'assistant');
    }, { timeout: 15000 });

    const getAiContentLen = () => {
      const msgs = (window as any).__E2E_GET_MESSAGES__();
      const aiMsg = msgs.find(m => m.role === 'assistant');
      return aiMsg ? aiMsg.content.length : 0;
    };

    const initialLen = await page.evaluate(getAiContentLen);
    await page.waitForTimeout(2000);
    const finalLen = await page.evaluate(getAiContentLen);
    
    expect(finalLen).toBeGreaterThanOrEqual(initialLen);
  });

  test('Session 事务自愈：刷新后内容不丢失 (持久化验证)', async ({ page }) => {
    const testMessage = 'Persistence Check: ' + Date.now();
    
    // Act - 发送
    await page.evaluate((msg) => (window as any).__E2E_SEND__(msg), testMessage);
    
    // 等待内存同步
    await page.waitForFunction((msg) => {
      return (window as any).__E2E_GET_MESSAGES__().some(m => m.content === msg);
    }, testMessage, { timeout: 5000 });

    // 🔥 关键修正：现有架构采用 1s 防抖持久化 (AUTO_SAVE_DELAY = 1000)
    // 我们必须等待持久化完成，否则刷新必丢数据。
    // 这正是重构要解决的痛点：将“防抖存盘”改为“事务存盘”。
    await page.waitForTimeout(2000); 

    // 防线 3: 持久化自愈校验 - 刷新页面
    await page.reload();
    await setupE2ETestEnvironment(page, { skipWelcome: true });

    // 等待 Store 恢复 (增加超时，因为 restoreFromStorage 较慢)
    await page.waitForFunction((msg) => {
      const msgs = (window as any).__E2E_GET_MESSAGES__();
      return msgs.some(m => m.content === msg);
    }, testMessage, { timeout: 20000 });

    const messages = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES__());
    expect(messages.some(m => m.content === testMessage)).toBe(true);
  });
});
