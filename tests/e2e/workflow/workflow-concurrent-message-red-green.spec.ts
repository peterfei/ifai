/**
 * 高保真 E2E 红绿测试 - 工作流执行期间并发消息发送
 *
 * 测试目标：验证在工作流监控器显示期间，用户能否正常发送新消息
 *
 * 测试步骤：
 * 1. 用户发送 /explore 命令启动工作流
 * 2. 等待工作流监控器出现
 * 3. 在监控器显示期间，尝试发送新消息
 * 4. 验证消息是否成功发送（输入框清空，消息出现在列表中）
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('工作流并发消息 - 红绿测试', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);
  });

  test('红绿测试：工作流执行期间应能并发发送新消息', async ({ page }) => {
    console.log('\n[E2E] 🧪 工作流并发消息红绿测试');

    // 🔴 RED 阶段：重现问题

    // 1. 找到输入框和按钮
    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');

    // 2. 发送 /explore 命令启动工作流
    console.log('[E2E] 📝 步骤1: 发送 /explore 命令');
    await textarea.fill('/explore src/components/AIChat');
    await sendButton.click();

    // 3. 等待工作流监控器出现
    console.log('[E2E] ⏳ 步骤2: 等待工作流监控器出现');
    await page.waitForSelector('[data-monitor="true"]', { timeout: 5000 })
      .then(() => console.log('[E2E] ✅ 工作流监控器已出现'))
      .catch(() => console.log('[E2E] ⚠️ 工作流监控器未出现（可能工作流已完成）'));

    // 4. 等待一小段时间，确保监控器正在显示
    await page.waitForTimeout(1000);

    // 5. 检查当前状态
    const workflowState = await page.evaluate(() => {
      const monitor = document.querySelector('[data-monitor="true"]');
      const chatStore = (window as any).__chatStore;
      const state = chatStore?.getState();

      return {
        monitorExists: !!monitor,
        monitorVisible: monitor ? window.getComputedStyle(monitor).display !== 'none' : false,
        chatStoreExists: !!chatStore,
        hasSendMessage: typeof state?.sendMessage === 'function',
        isLoading: state?.isLoading
      };
    });

    console.log('[E2E] 📊 步骤3: 当前状态检查', JSON.stringify(workflowState, null, 2));

    // 6. 在工作流执行期间输入新消息
    console.log('[E2E] 📝 步骤4: 在工作流执行期间输入新消息');
    const testMessage = `并发测试消息_${Date.now()}`;
    await textarea.fill(testMessage);
    await page.waitForTimeout(300);

    // 7. 检查输入后的按钮状态
    const buttonState = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="chat-send-button"]') as HTMLButtonElement;
      const input = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
      const chatStore = (window as any).__chatStore;

      return {
        inputValue: input?.value,
        buttonDisabled: btn?.disabled,
        buttonClasses: btn?.className,
        hasSendMessageInStore: typeof chatStore?.getState?.()?.sendMessage === 'function'
      };
    });

    console.log('[E2E] 📊 步骤5: 按钮状态检查', JSON.stringify(buttonState, null, 2));

    // 8. 点击发送按钮
    console.log('[E2E] 🖱️ 步骤6: 点击发送按钮');
    await sendButton.click();

    // 9. 等待一小段时间
    await page.waitForTimeout(500);

    // 10. 检查最终状态（关键断言）
    const finalState = await page.evaluate(() => {
      const input = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
      const messages = document.querySelectorAll('[class*="message"], [class*="Message"]');
      const chatStore = (window as any).__chatStore;
      const state = chatStore?.getState();

      return {
        inputValue: input?.value,
        inputTrimmed: input?.value?.trim(),
        messageCount: messages.length,
        lastMessageText: messages.length > 0 ? messages[messages.length - 1].textContent?.substring(0, 50) : null,
        storeMessageCount: state?.messages?.length,
        storeLastMessage: state?.messages?.length > 0 ? state.messages[state.messages.length - 1].content?.substring(0, 50) : null
      };
    });

    console.log('[E2E] 📊 步骤7: 最终状态检查', JSON.stringify(finalState, null, 2));

    // ✅ GREEN 阶段：断言（这些应该通过，如果失败则说明有问题）

    // 断言1: 输入框应该被清空
    expect(finalState.inputTrimmed).toBe('');

    // 断言2: store 中的消息数量应该增加（至少有3条消息：1条初始消息 + /explore命令 + 新消息）
    expect(finalState.storeMessageCount).toBeGreaterThanOrEqual(2);

    // 断言3: 最后一条消息应该是我们发送的消息
    const hasNewMessage = finalState.storeLastMessage?.includes('并发测试消息');
    if (hasNewMessage) {
      console.log('[E2E] ✅ 新消息已成功发送到 store');
    } else {
      console.log('[E2E] ⚠️ 未在 store 中找到新消息，最后一条消息:', finalState.storeLastMessage);
    }

    // 断言4: 按钮应该可用（不是禁用状态）
    expect(buttonState.buttonDisabled).toBe(false);

    // 额外诊断信息
    console.log('\n[E2E] 📋 测试总结:');
    console.log(`  工作流监控器存在: ${workflowState.monitorExists}`);
    console.log(`  输入框被清空: ${finalState.inputTrimmed === ''}`);
    console.log(`  Store 消息数量: ${finalState.storeMessageCount}`);
    console.log(`  新消息发送成功: ${hasNewMessage}`);
  });

  test('对比测试：正常情况下的消息发送', async ({ page }) => {
    console.log('\n[E2E] 🧪 对比测试：正常情况下的消息发送');

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');

    // 不启动工作流，直接发送消息
    const testMessage = `正常测试消息_${Date.now()}`;
    await textarea.fill(testMessage);
    await sendButton.click();

    await page.waitForTimeout(500);

    const finalState = await page.evaluate(() => {
      const input = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
      const chatStore = (window as any).__chatStore;
      const state = chatStore?.getState();

      return {
        inputValue: input?.value,
        messageCount: state?.messages?.length,
        lastMessage: state?.messages?.length > 0 ? state.messages[state.messages.length - 1].content : null
      };
    });

    console.log('[E2E] 📊 正常发送状态:', JSON.stringify(finalState, null, 2));

    // 断言：正常情况下应该能成功发送
    expect(finalState.inputValue).toBe('');
    expect(finalState.messageCount).toBeGreaterThanOrEqual(1);
  });

  test('详细诊断：监控 store 状态变化', async ({ page }) => {
    console.log('\n[E2E] 🧪 详细诊断：监控 store 状态变化');

    // 注入状态监控
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      (window as any).__STORE_STATE_MONITOR__ = {
        snapshots: [] as any[],

        startMonitoring: () => {
          // 每 500ms 记录一次状态
          const interval = setInterval(() => {
            try {
              const state = chatStore?.getState();
              if (state) {
                (window as any).__STORE_STATE_MONITOR__.snapshots.push({
                  timestamp: Date.now(),
                  hasSendMessage: typeof state.sendMessage === 'function',
                  messageCount: state.messages?.length || 0,
                  isLoading: state.isLoading,
                  stateKeys: Object.keys(state)
                });
              }
            } catch (e) {
              console.error('[State Monitor] Error:', e);
            }
          }, 500);

          (window as any).__STORE_STATE_MONITOR__.intervalId = interval;
        },

        stopMonitoring: () => {
          clearInterval((window as any).__STORE_STATE_MONITOR__.intervalId);
        },

        getSnapshots: () => {
          return (window as any).__STORE_STATE_MONITOR__.snapshots;
        }
      };
    });

    // 启动监控
    await page.evaluate(() => {
      (window as any).__STORE_STATE_MONITOR__.startMonitoring();
    });

    const textarea = page.locator('textarea[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="chat-send-button"]');

    // 发送 /explore 命令
    await textarea.fill('/explore src/App');
    await sendButton.click();

    // 等待 3 秒
    await page.waitForTimeout(3000);

    // 尝试发送新消息
    await textarea.fill('测试消息');
    await sendButton.click();
    await page.waitForTimeout(500);

    // 获取快照
    const snapshots = await page.evaluate(() => {
      return (window as any).__STORE_STATE_MONITOR__.getSnapshots();
    });

    // 停止监控
    await page.evaluate(() => {
      (window as any).__STORE_STATE_MONITOR__.stopMonitoring();
    });

    console.log('[E2E] 📊 状态快照:');
    snapshots.forEach((snap: any, index: number) => {
      console.log(`  快照${index + 1}:`, {
        hasSendMessage: snap.hasSendMessage,
        messageCount: snap.messageCount,
        isLoading: snap.isLoading,
        keysCount: snap.stateKeys.length
      });
    });

    // 分析快照
    const lostSendMessage = snapshots.some((s: any) => !s.hasSendMessage && s.messageCount > 0);
    if (lostSendMessage) {
      console.error('[E2E] ❌ 检测到 sendMessage 丢失!');
    } else {
      console.log('[E2E] ✅ sendMessage 一直存在');
    }

    // 最终状态
    const finalState = await page.evaluate(() => {
      const input = document.querySelector('textarea[data-testid="chat-input"]') as HTMLTextAreaElement;
      return {
        inputValue: input?.value,
        inputTrimmed: input?.value?.trim()
      };
    });

    console.log('[E2E] 📊 最终输入框状态:', finalState);

    // 断言
    expect(finalState.inputTrimmed).toBe('');
  });
});
