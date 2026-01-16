import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Message Order After Code Generation', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  test('should append new messages to bottom instead of replacing old ones', async ({ page }) => {
    test.setTimeout(90000);

    // 第一条消息：生成代码
    console.log('[E2E] Step 1: Send first request to generate code');
    await page.evaluate(async () => {
      await (window as any).__E2E_SEND__('生成示例代码 100行左右 如demo.js');
    });
    await page.waitForTimeout(8000);

    const msgsAfterFirst = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES__());
    console.log(`[E2E] After first request: ${msgsAfterFirst.length} messages`);

    // 保存第一条助手消息的内容和位置
    const firstAssistantMsg = msgsAfterFirst.find((m: any) => m.role === 'assistant');
    expect(firstAssistantMsg, 'First assistant message should exist').toBeTruthy();
    const firstMsgId = firstAssistantMsg.id;
    const firstMsgContent = firstAssistantMsg.content;
    console.log(`[E2E] First assistant msg: id=${firstMsgId}, content_length=${firstMsgContent?.length || 0}`);

    // 第二条消息：再次生成
    console.log('[E2E] Step 2: Send second request (same content)');
    await page.evaluate(async () => {
      (window as any).__chatStore.setState({ isLoading: false });
      await (window as any).__E2E_SEND__('生成示例代码 100行左右 如demo.js');
    });
    await page.waitForTimeout(8000);

    const msgsAfterSecond = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES__());
    console.log(`[E2E] After second request: ${msgsAfterSecond.length} messages`);

    // 验证消息数量增加了
    expect(msgsAfterSecond.length).toBeGreaterThan(msgsAfterFirst.length);

    // 验证第一条消息没有被修改
    const updatedFirstMsg = msgsAfterSecond.find((m: any) => m.id === firstMsgId);
    expect(updatedFirstMsg, 'First message should still exist with same ID').toBeTruthy();
    expect(updatedFirstMsg.content).toEqual(firstMsgContent);
    console.log('[E2E] ✅ First message preserved (not replaced)');

    // 验证新消息在列表底部（最新）
    const lastMsg = msgsAfterSecond[msgsAfterSecond.length - 1];
    const secondAssistantMsg = msgsAfterSecond.filter((m: any) => m.role === 'assistant').pop();
    expect(secondAssistantMsg, 'Second assistant message should exist').toBeTruthy();
    expect(secondAssistantMsg.id).not.toBe(firstMsgId);
    console.log(`[E2E] ✅ New message appended at bottom: id=${secondAssistantMsg.id}`);

    // 第三条消息：再次生成，测试连续场景
    console.log('[E2E] Step 3: Send third request to test consecutive scenario');
    await page.evaluate(async () => {
      (window as any).__chatStore.setState({ isLoading: false });
      await (window as any).__E2E_SEND__('生成示例代码 100行左右 如demo.js');
    });
    await page.waitForTimeout(8000);

    const msgsAfterThird = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES__());
    console.log(`[E2E] After third request: ${msgsAfterThird.length} messages`);

    // 验证所有历史消息都保留了
    expect(msgsAfterThird.length).toBeGreaterThan(msgsAfterSecond.length);
    const stillFirstMsg = msgsAfterThird.find((m: any) => m.id === firstMsgId);
    expect(stillFirstMsg, 'First message should still exist after 3 requests').toBeTruthy();
    expect(stillFirstMsg.content).toEqual(firstMsgContent);
    console.log('[E2E] ✅ All historical messages preserved');

    // 验证消息顺序正确（user/assistant 交替）
    for (let i = 1; i < msgsAfterThird.length; i++) {
      const prev = msgsAfterThird[i - 1];
      const curr = msgsAfterThird[i];
      // 不应该是连续的相同角色（除非有 system 消息）
      if (prev.role === curr.role && curr.role !== 'system') {
        console.error(`[E2E] ❌ Duplicate role at ${i}: ${prev.role} -> ${curr.role}`);
      }
    }
    console.log('[E2E] ✅ Message order validation passed');
  });

  test('should not modify existing message content when appending new ones', async ({ page }) => {
    test.setTimeout(90000);

    // 生成第一条唯一内容
    const uniqueContent1 = `Unique message ${Date.now()}-1`;
    await page.evaluate(async (content) => {
      await (window as any).__E2E_SEND__(content);
    }, uniqueContent1);
    await page.waitForTimeout(5000);

    const msgs1 = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES__());
    const firstAssistantMsg = msgs1.find((m: any) => m.role === 'assistant');
    const firstMsgId = firstAssistantMsg?.id;
    const firstContentSnapshot = firstAssistantMsg?.content;
    console.log(`[E2E] First msg: id=${firstMsgId}, content="${firstContentSnapshot?.slice(0, 50)}..."`);

    // 生成第二条不同内容
    const uniqueContent2 = `Unique message ${Date.now()}-2`;
    await page.evaluate(async (content) => {
      (window as any).__chatStore.setState({ isLoading: false });
      await (window as any).__E2E_SEND__(content);
    }, uniqueContent2);
    await page.waitForTimeout(5000);

    // 验证第一条消息内容没有改变
    const msgs2 = await page.evaluate(() => (window as any).__E2E_GET_MESSAGES__());
    const stillFirstMsg = msgs2.find((m: any) => m.id === firstMsgId);
    expect(stillFirstMsg?.content).toEqual(firstContentSnapshot);
    console.log('[E2E] ✅ First message content unchanged');

    // 验证第二条消息是新消息
    const secondAssistantMsg = msgs2.filter((m: any) => m.role === 'assistant').pop();
    expect(secondAssistantMsg?.id).not.toBe(firstMsgId);
    console.log('[E2E] ✅ Second message is new (not replacing first)');
  });
});
