/**
 * E2E 测试：滚动到底部的精确性验证
 *
 * 高保真还原用户反馈的问题：滚动条没有到最底部，有一点距离差异
 *
 * 测试场景：
 * 1. 检测滚动后距离底部的精确像素值
 * 2. 分析可能的原因（padding、margin、虚拟滚动高度计算等）
 * 3. 验证不同消息数量下的滚动精确性
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('滚动到底部精确性测试', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="chat-scroll-container"]', { timeout: 10000 });

    // 监听所有控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('scroll') || text.includes('Scroll') || text.includes('bottom') || text.includes('Bottom')) {
        console.log('[Browser Console]', text);
      }
    });
  });

  test('精确测试：检测滚动到底部后的像素偏差', async ({ page }) => {
    console.log('[E2E] ===== 精确滚动测试开始 =====');

    // 1. 创建 20 条历史消息
    console.log('[E2E] 步骤1: 创建20条历史消息');
    for (let i = 1; i <= 20; i++) {
      await page.evaluate((msgNum) => {
        const chatStore = (window as any).__chatStore;
        if (chatStore) {
          chatStore.getState().addMessage({
            id: `precision-test-${msgNum}`,
            role: msgNum % 2 === 0 ? 'user' : 'assistant',
            content: `精确测试消息 ${msgNum} - 用于检测滚动到底部的像素偏差`,
            timestamp: Date.now() - (20 - msgNum) * 60000,
          });
        }
      }, i);
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(1000);

    // 2. 记录容器初始状态和样式信息
    const containerInfo = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (!container) return null;

      const computedStyle = window.getComputedStyle(container);
      const lastMessage = container.querySelector('[data-message-id]:last-child');
      const lastMessageStyle = lastMessage ? window.getComputedStyle(lastMessage) : null;

      return {
        container: {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          offsetHeight: container.offsetHeight,
          scrollWidth: container.scrollWidth,
          clientWidth: container.clientWidth,
        },
        computedStyle: {
          paddingTop: computedStyle.paddingTop,
          paddingBottom: computedStyle.paddingBottom,
          marginTop: computedStyle.marginTop,
          marginBottom: computedStyle.marginBottom,
          boxSizing: computedStyle.boxSizing,
          overflow: computedStyle.overflow,
          overflowY: computedStyle.overflowY,
        },
        lastMessage: lastMessage ? {
          offsetHeight: lastMessage.offsetHeight,
          marginBottom: lastMessageStyle?.marginBottom,
          paddingBottom: lastMessageStyle?.paddingBottom,
        } : null,
      };
    });

    console.log('[E2E] 容器初始状态:', JSON.stringify(containerInfo, null, 2));

    // 3. 用户手动滚动到中间位置
    console.log('[E2E] 步骤2: 用户手动滚动到中间');
    await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (container) {
        container.scrollTop = container.scrollHeight / 2;
        container.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);

    // 4. 发送新消息
    console.log('[E2E] 步骤3: 发送新消息');
    const testMessage = `精确测试消息 ${Date.now()}`;
    await page.evaluate(async (msg) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (chatStore && settingsStore) {
        const { sendMessage } = chatStore.getState();
        const providerId = settingsStore.getState().currentProviderId || 'mock-provider';
        const modelId = settingsStore.getState().currentModel || 'mock-model';
        await sendMessage(msg, providerId, modelId);
      }
    }, testMessage);

    // 5. 等待滚动完成（多次检查，捕获滚动过程）
    console.log('[E2E] 步骤4: 监测滚动过程');
    const scrollProcess = [];

    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(200);
      const state = await page.evaluate((step) => {
        const container = document.querySelector('[data-testid="chat-scroll-container"]');
        if (!container) return null;
        return {
          step: step,
          time: Date.now(),
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          distanceToBottom: container.scrollHeight - container.scrollTop - container.clientHeight,
          lastElement: (() => {
            const last = container.lastElementChild;
            if (!last) return null;
            const rect = last.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            return {
              tagName: last.tagName,
              offsetBottom: rect.bottom - containerRect.bottom,
            };
          })(),
        };
      }, i);
      scrollProcess.push(state);
      console.log(`[E2E] 滚动过程 ${i * 200}ms:`, state);
    }

    // 6. 最终状态检查
    const finalState = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (!container) return null;

      // 获取最后一条消息的信息
      const lastMessage = container.lastElementChild;
      let lastMessageInfo = null;
      if (lastMessage) {
        const msgRect = lastMessage.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        lastMessageInfo = {
          visible: msgRect.top < containerRect.bottom && msgRect.bottom > containerRect.top,
          offsetBottom: msgRect.bottom - containerRect.bottom,
          offsetTop: msgRect.top - containerRect.top,
          height: msgRect.height,
        };
      }

      return {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        offsetHeight: container.offsetHeight,
        distanceToBottom: container.scrollHeight - container.scrollTop - container.clientHeight,
        isAtBottom: container.scrollTop + container.clientHeight >= container.scrollHeight - 1,
        lastMessageInfo,
        messageCount: container.children.length,
      };
    });

    console.log('[E2E] ===== 最终状态 =====');
    console.log('[E2E] scrollTop:', finalState?.scrollTop);
    console.log('[E2E] scrollHeight:', finalState?.scrollHeight);
    console.log('[E2E] clientHeight:', finalState?.clientHeight);
    console.log('[E2E] distanceToBottom:', finalState?.distanceToBottom);
    console.log('[E2E] isAtBottom:', finalState?.isAtBottom);
    console.log('[E2E] lastMessageInfo:', finalState?.lastMessageInfo);
    console.log('[E2E] messageCount:', finalState?.messageCount);

    // 7. 分析偏差原因
    if (finalState && finalState.distanceToBottom > 0) {
      console.log('[E2E] ⚠️ 检测到滚动偏差!');
      console.log('[E2E] 偏差像素:', finalState.distanceToBottom, 'px');

      // 尝试手动修正并验证
      console.log('[E2E] 尝试手动滚动到绝对底部...');
      await page.evaluate(() => {
        const container = document.querySelector('[data-testid="chat-scroll-container"]');
        if (container) {
          container.scrollTop = container.scrollHeight;
          container.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
      });
      await page.waitForTimeout(500);

      const afterManualScroll = await page.evaluate(() => {
        const container = document.querySelector('[data-testid="chat-scroll-container"]');
        if (!container) return null;
        return {
          scrollTop: container.scrollTop,
          distanceToBottom: container.scrollHeight - container.scrollTop - container.clientHeight,
        };
      });
      console.log('[E2E] 手动滚动后 distanceToBottom:', afterManualScroll?.distanceToBottom);
    }

    // 8. 断言
    expect(finalState).not.toBeNull();
    expect(finalState!.distanceToBottom).toBeLessThan(50); // 更严格的要求：偏差应小于 50px
  });

  test('多场景测试：不同消息数量下的滚动精确性', async ({ page }) => {
    console.log('[E2E] ===== 多场景滚动精确性测试 =====');

    const testCases = [
      { name: '5条消息（短对话）', count: 5 },
      { name: '14条消息（虚拟滚动边界前）', count: 14 },
      { name: '15条消息（虚拟滚动边界）', count: 15 },
      { name: '20条消息（虚拟滚动启用）', count: 20 },
      { name: '50条消息（长对话）', count: 50 },
    ];

    for (const testCase of testCases) {
      console.log(`[E2E] 测试场景: ${testCase.name}`);

      // 🔥 重新加载页面以重置状态
      await page.reload();
      await page.waitForSelector('[data-testid="chat-scroll-container"]', { timeout: 10000 });
      await page.waitForTimeout(500);

      // 创建指定数量的消息
      for (let i = 1; i <= testCase.count; i++) {
        await page.evaluate(({ msgNum, totalCount }) => {
          const chatStore = (window as any).__chatStore;
          if (chatStore) {
            chatStore.getState().addMessage({
              id: `multi-scenario-${totalCount}-${msgNum}`,
              role: msgNum % 2 === 0 ? 'user' : 'assistant',
              content: `多场景测试消息 ${msgNum}`,
              timestamp: Date.now() - (totalCount - msgNum) * 60000,
            });
          }
        }, { msgNum: i, totalCount: testCase.count });
        await page.waitForTimeout(30);
      }

      await page.waitForTimeout(1000); // 增加等待时间，确保所有消息渲染完成

      // 检查容器状态
      const beforeScroll = await page.evaluate(() => {
        const container = document.querySelector('[data-testid="chat-scroll-container"]');
        if (!container) return { error: 'container not found' };
        return {
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          messageCount: container.children.length,
        };
      });
      console.log(`[E2E] ${testCase.name} - 滚动前容器状态:`, beforeScroll);

      // 滚动到中间
      await page.evaluate(() => {
        const container = document.querySelector('[data-testid="chat-scroll-container"]');
        if (container) {
          container.scrollTop = container.scrollHeight / 2;
          container.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
      });
      await page.waitForTimeout(300);

      // 发送新消息
      await page.evaluate(async (msg) => {
        const chatStore = (window as any).__chatStore;
        const settingsStore = (window as any).__settingsStore;
        if (chatStore && settingsStore) {
          const { sendMessage } = chatStore.getState();
          const providerId = settingsStore.getState().currentProviderId || 'mock-provider';
          const modelId = settingsStore.getState().currentModel || 'mock-model';
          await sendMessage(msg, providerId, modelId);
        }
      }, `测试${testCase.count}条消息`);

      // 🔥 增加等待时间，让滚动完全完成（包括重试机制）
      await page.waitForTimeout(3000);

      // 检查结果（详细状态）
      const result = await page.evaluate(() => {
        const container = document.querySelector('[data-testid="chat-scroll-container"]');
        if (!container) return null;
        return {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          distanceToBottom: container.scrollHeight - container.scrollTop - container.clientHeight,
          messageCount: container.children.length,
        };
      });

      console.log(`[E2E] ${testCase.name} - 详细状态:`, result);

      // 允许 50px 的误差
      if (result && result.distanceToBottom > 50) {
        console.log(`[E2E] ❌ ${testCase.name} 偏差过大:`, result.distanceToBottom, 'px');
      } else {
        console.log(`[E2E] ✅ ${testCase.name} 通过`);
      }

      expect(result!.distanceToBottom).toBeLessThan(50);
    }
  });

  test('虚拟滚动模式下的精确滚动测试', async ({ page }) => {
    console.log('[E2E] ===== 虚拟滚动精确性测试 =====');

    // 创建 30 条消息确保虚拟滚动启用
    for (let i = 1; i <= 30; i++) {
      await page.evaluate((msgNum) => {
        const chatStore = (window as any).__chatStore;
        if (chatStore) {
          chatStore.getState().addMessage({
            id: `virtual-scroll-test-${msgNum}`,
            role: msgNum % 2 === 0 ? 'user' : 'assistant',
            content: `虚拟滚动精确性测试消息 ${msgNum}，用于验证虚拟滚动模式下滚动到底部的准确性`,
            timestamp: Date.now() - (30 - msgNum) * 60000,
          });
        }
      }, i);
      await page.waitForTimeout(30);
    }

    await page.waitForTimeout(1000);

    // 检查虚拟滚动状态
    const virtualScrollInfo = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (!container) return null;

      // 检查是否有虚拟滚动相关的 DOM 结构
      const virtualItems = container.querySelectorAll('[data-index]');
      const hasVirtualScroll = virtualItems.length > 0;

      return {
        hasVirtualScroll,
        virtualItemCount: virtualItems.length,
        totalChildren: container.children.length,
      };
    });

    console.log('[E2E] 虚拟滚动状态:', virtualScrollInfo);

    // 滚动到中间
    await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (container) {
        container.scrollTop = container.scrollHeight / 2;
        container.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);

    // 发送消息
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (chatStore && settingsStore) {
        const { sendMessage } = chatStore.getState();
        const providerId = settingsStore.getState().currentProviderId || 'mock-provider';
        const modelId = settingsStore.getState().currentModel || 'mock-model';
        await sendMessage('虚拟滚动精确性测试', providerId, modelId);
      }
    });

    await page.waitForTimeout(2000);

    // 详细分析虚拟滚动下的状态
    const detailedState = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (!container) return null;

      const virtualItems = container.querySelectorAll('[data-index]');
      const lastVirtualItem = virtualItems.length > 0
        ? virtualItems[virtualItems.length - 1]
        : null;

      return {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        distanceToBottom: container.scrollHeight - container.scrollTop - container.clientHeight,
        virtualItemCount: virtualItems.length,
        lastVirtualItemIndex: lastVirtualItem?.getAttribute('data-index'),
        lastVirtualItemPosition: lastVirtualItem ? {
          transform: lastVirtualItem.style.transform,
          top: lastVirtualItem.style.top,
        } : null,
      };
    });

    console.log('[E2E] 虚拟滚动详细状态:', detailedState);

    // 断言
    expect(detailedState).not.toBeNull();
    expect(detailedState!.distanceToBottom).toBeLessThan(50);

    if (detailedState!.distanceToBottom > 10) {
      console.log('[E2E] ⚠️ 虚拟滚动模式检测到偏差:', detailedState!.distanceToBottom, 'px');

      // 尝试分析原因
      await page.evaluate(() => {
        const container = document.querySelector('[data-testid="chat-scroll-container"]');
        if (!container) return;

        const lastItem = container.querySelector('[data-index]:last-child');
        if (lastItem) {
          console.log('最后一条虚拟消息位置:', {
            transform: lastItem.style.transform,
            top: lastItem.style.top,
            offsetTop: lastItem.offsetTop,
            offsetHeight: lastItem.offsetHeight,
          });
        }

        console.log('容器信息:', {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
        });
      });
    }
  });
});
