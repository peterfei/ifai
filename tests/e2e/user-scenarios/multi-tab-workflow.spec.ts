/**
 * 多 Tab 工作流场景测试
 *
 * 还原真实用户操作场景：
 * 1. 用户新开一个 tab
 * 2. 输入一些内容
 * 3. 关闭 tab
 * 4. 重新打开应用，验证 tab 状态恢复
 * 5. Focus 到其它 tab 上
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('多 Tab 工作流场景', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false  // 使用模拟 AI，快速响应
    });

    // 等待应用完全加载 - 增加超时时间
    console.log('[测试] 等待应用加载...');
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
    await page.waitForTimeout(2000);

    // 验证输入框可用
    const chatInput = page.locator('[data-testid="chat-input"]');
    await expect(chatInput).toBeVisible();
    await expect(chatInput).toBeEnabled();

    console.log('[测试] 应用加载完成');
  });

  test('场景1: 新开 tab 并输入内容', async ({ page }) => {
    console.log('[场景1] 开始：新开 tab 并输入内容');

    // 获取初始 tab 信息
    const initialTabInfo = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      return {
        threadCount: Object.keys(state.threads).length,
        activeThreadId: state.activeThreadId,
        threadTitles: Object.values(state.threads).map((t: any) => t.title)
      };
    });

    console.log('[场景1] 初始状态:', initialTabInfo);
    expect(initialTabInfo.threadCount).toBeGreaterThan(0);

    // 在当前 tab 输入内容
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.fill('这是第一个 tab 的内容');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // 验证消息已发送
    const messagesAfterFirst = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore.getState();
      return state.messages.length;
    });
    expect(messagesAfterFirst).toBeGreaterThan(0);
    console.log('[场景1] 第一个 tab 消息数:', messagesAfterFirst);

    // 新建 tab (Ctrl+T)
    await page.keyboard.press('Control+t');
    await page.waitForTimeout(1000);

    // 验证新 tab 已创建
    const afterNewTab = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      return {
        threadCount: Object.keys(state.threads).length,
        activeThreadId: state.activeThreadId,
        isNewTab: state.activeThreadId !== initialTabInfo.activeThreadId
      };
    });

    console.log('[场景1] 新建 tab 后:', afterNewTab);
    expect(afterNewTab.threadCount).toBe(initialTabInfo.threadCount + 1);
    expect(afterNewTab.isNewTab).toBe(true);

    // 在新 tab 输入内容
    await chatInput.fill('这是第二个 tab 的内容');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    // 验证新 tab 有独立的消息
    const newTabMessages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore.getState();
      return state.messages.length;
    });
    expect(newTabMessages).toBe(1); // 新 tab 应该只有一条消息
    console.log('[场景1] 第二个 tab 消息数:', newTabMessages);

    console.log('[场景1] ✅ 通过');
  });

  test('场景2: 关闭 tab 后切换到其它 tab', async ({ page }) => {
    console.log('[场景2] 开始：关闭 tab 后切换到其它 tab');

    // 先创建多个 tab
    const chatInput = page.locator('[data-testid="chat-input"]');

    // Tab 1: 输入内容
    await chatInput.fill('Tab 1 内容');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 创建 Tab 2
    await page.keyboard.press('Control+t');
    await page.waitForTimeout(500);
    await chatInput.fill('Tab 2 内容');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 创建 Tab 3
    await page.keyboard.press('Control+t');
    await page.waitForTimeout(500);
    await chatInput.fill('Tab 3 内容');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 获取当前 tab 信息
    const beforeClose = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      return {
        threadCount: Object.keys(state.threads).length,
        activeThreadId: state.activeThreadId,
        allThreadIds: Object.keys(state.threads)
      };
    });

    console.log('[场景2] 关闭前状态:', beforeClose);
    expect(beforeClose.threadCount).toBe(3);

    // 获取第一个 tab 的 ID（不是当前 tab）
    const firstTabId = beforeClose.allThreadIds[0];

    // 切换到第一个 tab
    await page.evaluate((tabId) => {
      const threadStore = (window as any).__threadStore;
      threadStore.getState().switchThread(tabId);
    }, firstTabId);
    await page.waitForTimeout(500);

    // 验证已切换到第一个 tab
    const afterSwitch = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      return {
        activeThreadId: state.activeThreadId,
        messageCount: (window as any).__chatStore.getState().messages.length
      };
    });

    console.log('[场景2] 切换后状态:', afterSwitch);
    expect(afterSwitch.activeThreadId).toBe(firstTabId);

    // 关闭当前 tab (Ctrl+W)
    const currentTabId = afterSwitch.activeThreadId;
    await page.keyboard.press('Control+w');
    await page.waitForTimeout(500);

    // 验证 tab 已关闭
    const afterClose = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      return {
        threadCount: Object.keys(state.threads).length,
        activeThreadId: state.activeThreadId,
        closedTabExists: state.threads[currentTabId] !== undefined
      };
    }, currentTabId);

    console.log('[场景2] 关闭后状态:', afterClose);
    expect(afterClose.threadCount).toBe(2);
    expect(afterClose.closedTabExists).toBe(false);

    console.log('[场景2] ✅ 通过');
  });

  test('场景3: Tab 切换并验证内容隔离', async ({ page }) => {
    console.log('[场景3] 开始：Tab 切换并验证内容隔离');

    const chatInput = page.locator('[data-testid="chat-input"]');

    // Tab 1: 输入特定内容
    await chatInput.fill('第一个 Tab 的专属内容');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    const tab1Messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore.getState();
      return state.messages.map((m: any) => m.content);
    });
    console.log('[场景3] Tab 1 消息:', tab1Messages);

    // 创建 Tab 2
    await page.keyboard.press('Control+t');
    await page.waitForTimeout(500);

    // Tab 2: 输入不同内容
    await chatInput.fill('第二个 Tab 的专属内容');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    const tab2Messages = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore.getState();
      return state.messages.map((m: any) => m.content);
    });
    console.log('[场景3] Tab 2 消息:', tab2Messages);

    // 验证内容不同
    expect(tab2Messages).not.toContain('第一个 Tab 的专属内容');

    // 获取两个 tab 的 ID
    const tabIds = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      return Object.keys(state.threads);
    });

    // 切换回 Tab 1
    await page.evaluate((tabId) => {
      const threadStore = (window as any).__threadStore;
      threadStore.getState().switchThread(tabId);
    }, tabIds[0]);
    await page.waitForTimeout(500);

    // 验证 Tab 1 的内容恢复正确
    const backToTab1 = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore.getState();
      return state.messages.map((m: any) => m.content);
    });

    console.log('[场景3] 切换回 Tab 1 消息:', backToTab1);
    expect(backToTab1).toContain('第一个 Tab 的专属内容');
    expect(backToTab1).not.toContain('第二个 Tab 的专属内容');

    // 再次切换到 Tab 2
    await page.evaluate((tabId) => {
      const threadStore = (window as any).__threadStore;
      threadStore.getState().switchThread(tabId);
    }, tabIds[1]);
    await page.waitForTimeout(500);

    // 验证 Tab 2 的内容恢复正确
    const backToTab2 = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore.getState();
      return state.messages.map((m: any) => m.content);
    });

    console.log('[场景3] 切换回 Tab 2 消息:', backToTab2);
    expect(backToTab2).toContain('第二个 Tab 的专属内容');
    expect(backToTab2).not.toContain('第一个 Tab 的专属内容');

    console.log('[场景3] ✅ 通过 - Tab 内容隔离正确');
  });

  test('场景4: 关闭后重新打开验证状态持久化', async ({ page }) => {
    console.log('[场景4] 开始：关闭后重新打开验证状态持久化');

    const chatInput = page.locator('[data-testid="chat-input"]');

    // 创建并输入内容
    await chatInput.fill('持久化测试内容');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 获取 tab 信息
    const beforeRefresh = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      const chatStore = (window as any).__chatStore;
      return {
        threadCount: Object.keys(state.threads).length,
        activeThreadId: state.activeThreadId,
        threadTitles: Object.values(state.threads).map((t: any) => ({ id: t.id, title: t.title })),
        messageCount: chatStore.getState().messages.length
      };
    });

    console.log('[场景4] 刷新前状态:', beforeRefresh);

    // 刷新页面
    console.log('[场景4] 刷新页面...');
    await page.reload();
    console.log('[场景4] 等待应用重新加载...');

    // 增加等待时间，确保应用完全重新加载
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 30000 });
    await page.waitForTimeout(2000);

    // 验证状态已恢复
    const afterRefresh = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      const chatStore = (window as any).__chatStore;
      return {
        threadCount: Object.keys(state.threads).length,
        activeThreadId: state.activeThreadId,
        threadTitles: Object.values(state.threads).map((t: any) => ({ id: t.id, title: t.title })),
        messageCount: chatStore.getState().messages.length
      };
    });

    console.log('[场景4] 刷新后状态:', afterRefresh);

    // 验证 tab 数量
    expect(afterRefresh.threadCount).toBe(beforeRefresh.threadCount);
    expect(afterRefresh.activeThreadId).toBe(beforeRefresh.activeThreadId);

    // 验证消息数量
    expect(afterRefresh.messageCount).toBe(beforeRefresh.messageCount);

    // 验证输入框可用
    await expect(chatInput).toBeEnabled();
    console.log('[场景4] ✅ 通过 - 状态持久化正确');
  });

  test('场景5: 使用快捷键切换 Tab', async ({ page }) => {
    console.log('[场景5] 开始：使用快捷键切换 Tab');

    const chatInput = page.locator('[data-testid="chat-input"]');

    // 创建多个 tab
    await chatInput.fill('Tab A');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await page.keyboard.press('Control+t');
    await chatInput.fill('Tab B');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await page.keyboard.press('Control+t');
    await chatInput.fill('Tab C');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 记录当前 tab
    const currentTab = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      return state.activeThreadId;
    });
    console.log('[场景5] 当前 tab:', currentTab);

    // 使用 Ctrl+Tab 切换到下一个 tab
    await page.keyboard.press('Control+Tab');
    await page.waitForTimeout(500);

    const afterCtrlTab = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      return state.activeThreadId;
    });
    console.log('[场景5] Ctrl+Tab 后:', afterCtrlTab);
    expect(afterCtrlTab).not.toBe(currentTab);

    // 使用 Ctrl+Shift+Tab 切换回上一个 tab
    await page.keyboard.press('Control+Shift+Tab');
    await page.waitForTimeout(500);

    const afterCtrlShiftTab = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      return state.activeThreadId;
    });
    console.log('[场景5] Ctrl+Shift+Tab 后:', afterCtrlShiftTab);
    expect(afterCtrlShiftTab).toBe(currentTab);

    // 使用 Ctrl+1 切换到第一个 tab
    await page.keyboard.press('Control+1');
    await page.waitForTimeout(500);

    const afterCtrl1 = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      const threads = Object.values(state.threads);
      return {
        activeThreadId: state.activeThreadId,
        firstTabId: threads[0].id
      };
    });
    console.log('[场景5] Ctrl+1 后:', afterCtrl1);
    expect(afterCtrl1.activeThreadId).toBe(afterCtrl1.firstTabId);

    console.log('[场景5] ✅ 通过 - 快捷键切换正确');
  });

  test('场景6: Tab 关闭后自动切换到邻近 Tab', async ({ page }) => {
    console.log('[场景6] 开始：Tab 关闭后自动切换到邻近 Tab');

    const chatInput = page.locator('[data-testid="chat-input"]');

    // 创建 3 个 tab
    await chatInput.fill('Tab 1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await page.keyboard.press('Control+t');
    await chatInput.fill('Tab 2');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await page.keyboard.press('Control+t');
    await chatInput.fill('Tab 3');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 获取所有 tab ID
    const allTabs = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      return Object.values(state.threads).map((t: any) => ({ id: t.id, title: t.title }));
    });
    console.log('[场景6] 所有 tabs:', allTabs);

    // 切换到第二个 tab
    await page.evaluate((tabId) => {
      const threadStore = (window as any).__threadStore;
      threadStore.getState().switchThread(tabId);
    }, allTabs[1].id);
    await page.waitForTimeout(500);

    // 关闭第二个 tab
    await page.keyboard.press('Control+w');
    await page.waitForTimeout(500);

    // 验证自动切换到了其它 tab（不是第一个就是第三个）
    const afterClose = await page.evaluate(() => {
      const threadStore = (window as any).__threadStore;
      const state = threadStore.getState();
      return {
        activeThreadId: state.activeThreadId,
        threadCount: Object.keys(state.threads).length
      };
    });
    console.log('[场景6] 关闭中间 tab 后:', afterClose);

    expect(afterClose.threadCount).toBe(2);
    expect(afterClose.activeThreadId).not.toBe(allTabs[1].id); // 关闭的 tab

    // 验证输入框可用
    await expect(chatInput).toBeEnabled();

    console.log('[场景6] ✅ 通过 - Tab 关闭后自动切换正确');
  });
});
