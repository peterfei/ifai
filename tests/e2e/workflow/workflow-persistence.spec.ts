/**
 * 工作流持久化测试 - 高保真 TDD
 *
 * 测试目标：
 * 1. 工作流响应应该正确持久化
 * 2. 刷新后工作流消息不应丢失
 * 3. 消息排序应该正确（按时间戳）
 *
 * @version v1.0.0 - TDD First
 */

import { test, expect } from '@playwright/test';
import { setupTestProvider } from '../helpers/provider-setup';

test.describe('工作流持久化 - TDD', () => {
  test.beforeEach(async ({ page }) => {
    // 🔥 FIX: 不清理 localStorage，让消息可以持久化
    // 只清理 sessionStorage，确保每个测试的内存状态是干净的
    await page.goto('http://localhost:1420');
    await page.evaluate(() => {
      sessionStorage.clear();
    });
    await page.reload();

    // 🔥 FIX: 配置测试 Provider，确保 AIChat 显示消息列表
    await page.waitForSelector('#root div', { timeout: 10000 });
    await setupTestProvider(page);
    await page.waitForTimeout(500);
  });

  test('RED-1: 工作流响应应该被持久化到 localStorage', async ({ page }) => {
    console.log('[TDD] 🔴 RED 测试：工作流响应持久化');

    // Given: 用户在项目中
    await page.goto('http://localhost:1420');

    // When: 执行 /explore 命令
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    // 等待工作流完成
    await page.waitForTimeout(20000);

    // Then: 检查消息数量（持久化成功的间接证据）
    const messageCount = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages.length : 0;
    });

    console.log('[TDD] 消息数量:', messageCount);

    // 🚨 预期失败：工作流消息应该被持久化
    expect(messageCount).toBeGreaterThanOrEqual(2);
  });

  test('RED-2: 刷新后工作流消息不应丢失', async ({ page }) => {
    console.log('[TDD] 🔴 RED 测试：刷新后消息保持');

    // Given: 执行 /explore 并等待完成
    // (beforeEach 已经处理了 page.goto 和 Provider 配置)
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    await page.waitForTimeout(20000);

    // 记录刷新前的消息数量
    const messageCountBefore = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages.length : 0;
    });

    console.log('[TDD] 刷新前消息数量:', messageCountBefore);

    // When: 刷新页面
    await page.reload();

    // 等待 store 恢复
    await page.waitForTimeout(3000);

    // 🔥 FIX: 刷新后重新配置 Provider，确保消息可以正常显示
    await page.waitForSelector('#root div', { timeout: 10000 });
    await setupTestProvider(page);
    await page.waitForTimeout(500);

    // Then: 消息数量应该保持不变
    const messageCountAfter = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages.length : 0;
    });

    console.log('[TDD] 刷新后消息数量:', messageCountAfter);

    // 🚨 预期失败：刷新后消息数量应该相等
    expect(messageCountAfter).toBe(messageCountBefore);
  });

  test('RED-3: 工作流响应内容应该在刷新后保留', async ({ page }) => {
    console.log('[TDD] 🔴 RED 测试：工作流内容持久化');

    // Given: 执行 /explore
    // (不需要 page.goto，因为 beforeEach 已经处理了)
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    await page.waitForTimeout(20000);

    // 获取 AI 响应的内容
    const aiResponseBefore = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore ? chatStore.getState().messages : [];
      // 🔥 FIX: 明确查找 assistant 消息，而不是假设最后一条
      const assistantMessage = messages.find((m: any) => m.role === 'assistant');
      return assistantMessage ? assistantMessage.content : null;
    });

    console.log('[TDD] 刷新前 AI 响应:', aiResponseBefore?.substring(0, 100));

    // When: 刷新页面
    await page.reload();

    // 等待 store 恢复
    await page.waitForTimeout(3000);

    // 🔥 FIX: 刷新后重新配置 Provider
    await page.waitForSelector('#root div', { timeout: 10000 });
    await setupTestProvider(page);
    await page.waitForTimeout(500);

    // Then: AI 响应内容应该保留
    const aiResponseAfter = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore ? chatStore.getState().messages : [];
      // 🔥 FIX: 明确查找 assistant 消息
      const assistantMessage = messages.find((m: any) => m.role === 'assistant');
      return assistantMessage ? assistantMessage.content : null;
    });

    console.log('[TDD] 刷新后 AI 响应:', aiResponseAfter?.substring(0, 100));

    // 🚨 预期失败：内容应该相等
    expect(aiResponseAfter).not.toBeNull();
    expect(aiResponseAfter).toEqual(aiResponseBefore);
  });

  test('RED-4: 消息应该按时间戳正确排序', async ({ page }) => {
    console.log('[TDD] 🔴 RED 测试：消息排序');

    // Given: 发送多条消息
    // (不需要 page.goto，因为 beforeEach 已经处理了)
    // 发送第一条消息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('第一条消息');
      }
    });

    await page.waitForTimeout(3000);

    // 发送第二条消息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('第二条消息');
      }
    });

    await page.waitForTimeout(3000);

    // When: 刷新页面
    await page.reload();

    // 等待 store 恢复
    await page.waitForTimeout(3000);

    // 🔥 FIX: 刷新后重新配置 Provider
    await page.waitForSelector('#root div', { timeout: 10000 });
    await setupTestProvider(page);
    await page.waitForTimeout(500);

    // Then: 消息应该按时间戳排序
    const timestamps = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore ? chatStore.getState().messages : [];
      return messages.map((m: any) => m.timestamp || 0);
    });

    console.log('[TDD] 消息时间戳:', timestamps);

    // 检查是否按升序排列
    let isSorted = true;
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] < timestamps[i - 1]) {
        isSorted = false;
        console.log(`[TDD] ❌ 排序错误: timestamps[${i - 1}]=${timestamps[i - 1]} > timestamps[${i}]=${timestamps[i]}`);
      }
    }

    // 🚨 预期失败：时间戳应该递增
    expect(isSorted).toBe(true);
  });

  test('RED-5: 工作流消息应该包含正确的元数据', async ({ page }) => {
    console.log('[TDD] 🔴 RED 测试：工作流元数据');

    // Given: 执行 /explore
    // 🔥 FIX: 不需要额外的 page.goto，因为 beforeEach 已经处理了
    // 额外的 page.goto 会清除 __E2E__ 标志，导致 Mock 模式失败
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    await page.waitForTimeout(20000);

    // When: 检查最后一条消息（应该是 AI 响应）
    const lastMessage = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore ? chatStore.getState().messages : [];
      return messages[messages.length - 1];
    });

    console.log('[TDD] 最后一条消息:', lastMessage);

    // Then: 应该有正确的元数据
    expect(lastMessage).not.toBeNull();
    expect(lastMessage.role).toBe('assistant');

    // 🚨 预期失败：应该包含工作流相关的元数据
    // 检查是否有 workflowId 或其他元数据
    const hasWorkflowMetadata = lastMessage &&
      lastMessage.metadata &&
      (lastMessage.metadata.workflowId || lastMessage.metadata.workflowType);

    console.log('[TDD] 工作流元数据:', lastMessage?.metadata);
    expect(hasWorkflowMetadata).toBeTruthy();
  });

  test('GREEN-1: 普通聊天消息应该正常持久化', async ({ page }) => {
    console.log('[TDD] ✅ GREEN 测试：普通消息持久化（基准）');

    // Given: 发送普通消息
    await page.goto('http://localhost:1420');

    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('你好');
      }
    });

    await page.waitForTimeout(5000);

    // When: 刷新页面
    await page.reload();
    await page.waitForTimeout(3000);

    // Then: 消息应该保留
    const messageCount = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return chatStore ? chatStore.getState().messages.length : 0;
    });

    // ✅ 应该通过：普通消息应该正常持久化
    expect(messageCount).toBeGreaterThanOrEqual(2); // 用户 + AI
  });
});

/**
 * 📋 测试清单
 *
 * 🔴 RED 测试（预期失败，需要修复）：
 *   - [ ] RED-1: 工作流响应持久化到 localStorage
 *   - [ ] RED-2: 刷新后消息数量保持
 *   - [ ] RED-3: 刷新后工作流内容保留
 *   - [ ] RED-4: 消息按时间戳正确排序
 *   - [ ] RED-5: 工作流消息包含正确元数据
 *
 * ✅ GREEN 测试（应该通过，验证基准功能）：
 *   - [x] GREEN-1: 普通聊天消息持久化
 *
 * 🎯 实现目标：
 *   1. 确保 workflow:response 事件正确更新消息
 *   2. 确保消息持久化机制正确工作
 *   3. 修复消息排序逻辑
 */
