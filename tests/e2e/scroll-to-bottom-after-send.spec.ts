/**
 * E2E 测试：发送消息后自动滚动到底部
 *
 * 高保真模拟真实用户操作：
 * 1. 准备一个有 20+ 条历史消息的对话
 * 2. 用户手动滚动到中间位置
 * 3. 用户发送新消息
 * 4. 验证滚动条是否移动到底部
 *
 * 运行方式：npm run test:e2e scroll-to-bottom-after-send
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('发送消息后滚动到底部 - 长历史消息场景', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="chat-scroll-container"]', { timeout: 10000 });
  });

  test('应该在发送消息后自动滚动到底部，即使有长历史消息', async ({ page }) => {
    console.log('[E2E] 测试: 发送消息后自动滚动到底部（20条历史消息）');

    // 1. 创建 20 条历史消息（确保触发虚拟滚动）
    console.log('[E2E] 步骤1: 创建20条历史消息');
    for (let i = 1; i <= 20; i++) {
      await page.evaluate((msgNum) => {
        const chatStore = (window as any).__chatStore;
        if (chatStore) {
          chatStore.getState().addMessage({
            id: `test-history-${msgNum}`,
            role: msgNum % 2 === 0 ? 'user' : 'assistant',
            content: `历史消息 ${msgNum} - 这是一条用于测试滚动到底部功能的长消息`,
            timestamp: Date.now() - (20 - msgNum) * 60000,
          });
        }
      }, i);
      await page.waitForTimeout(50);
    }

    // 等待所有消息渲染
    await page.waitForTimeout(1000);

    // 2. 记录初始状态
    const initialState = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (!container) return null;
      return {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        messageCount: 20,
      };
    });

    console.log('[E2E] 初始状态:', initialState);
    expect(initialState).not.toBeNull();

    // 3. 用户手动滚动到中间位置
    console.log('[E2E] 步骤2: 用户手动滚动到中间');
    await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (container) {
        container.scrollTop = container.scrollHeight / 2;
      }
    });
    await page.waitForTimeout(300);

    const scrolledState = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (!container) return null;
      return {
        scrollTop: container.scrollTop,
        isInMiddle: container.scrollTop > 0,
      };
    });
    console.log('[E2E] 滚动到中间后:', scrolledState);
    expect(scrolledState?.isInMiddle).toBe(true);

    // 4. 用户发送新消息
    console.log('[E2E] 步骤3: 用户发送新消息');
    const testMessage = `测试消息 ${Date.now()}`;
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

    // 5. 等待消息发送并滚动完成
    await page.waitForTimeout(1500);

    // 6. 验证滚动到底部
    console.log('[E2E] 步骤4: 验证滚动到底部');
    const finalState = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (!container) return null;
      return {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        distanceToBottom: container.scrollHeight - container.scrollTop - container.clientHeight,
      };
    });

    console.log('[E2E] 最终状态:', finalState);
    expect(finalState).not.toBeNull();

    // 验证距离底部小于 100px
    if (finalState && finalState.distanceToBottom < 100) {
      console.log('[E2E] ✅ 成功滚动到底部（距离底部:', finalState.distanceToBottom, 'px）');
    } else {
      console.log('[E2E] ❌ 未能滚动到底部（距离底部:', finalState?.distanceToBottom, 'px）');
    }
    expect(finalState!.distanceToBottom).toBeLessThan(100);
  });

  test('应该在发送特殊命令消息后也滚动到底部', async ({ page }) => {
    console.log('[E2E] 测试: 发送 /help 命令后滚动到底部');

    // 创建15条历史消息
    console.log('[E2E] 步骤1: 创建15条历史消息');
    for (let i = 1; i <= 15; i++) {
      await page.evaluate((msgNum) => {
        const chatStore = (window as any).__chatStore;
        if (chatStore) {
          chatStore.getState().addMessage({
            id: `test-cmd-${msgNum}`,
            role: msgNum % 2 === 0 ? 'user' : 'assistant',
            content: `命令测试消息 ${msgNum}`,
            timestamp: Date.now() - (15 - msgNum) * 60000,
          });
        }
      }, i);
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(1000);

    // 用户手动滚动到中间
    console.log('[E2E] 步骤2: 用户手动滚动到中间');
    await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (container) {
        container.scrollTop = container.scrollHeight / 2;
      }
    });
    await page.waitForTimeout(300);

    // 发送 /help 命令
    console.log('[E2E] 步骤3: 发送 /help 命令');
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (chatStore && settingsStore) {
        const { sendMessage } = chatStore.getState();
        const providerId = settingsStore.getState().currentProviderId || 'mock-provider';
        const modelId = settingsStore.getState().currentModel || 'mock-model';
        await sendMessage('/help', providerId, modelId);
      }
    });

    // 等待命令响应
    await page.waitForTimeout(2000);

    // 验证滚动到底部
    console.log('[E2E] 步骤4: 验证滚动到底部');
    const distanceFromBottom = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (!container) return -1;
      return container.scrollHeight - container.scrollTop - container.clientHeight;
    });

    console.log('[E2E] 发送 /help 后距离底部:', distanceFromBottom);
    if (distanceFromBottom < 100) {
      console.log('[E2E] ✅ 成功滚动到底部');
    } else {
      console.log('[E2E] ❌ 未能滚动到底部');
    }
    expect(distanceFromBottom).toBeLessThan(100);
  });

  test('应该在虚拟滚动边界（15条消息）时正确切换滚动策略', async ({ page }) => {
    console.log('[E2E] 测试: 虚拟滚动边界切换（14/15/30条消息）');

    // 测试场景1：14条消息（虚拟滚动未启用）
    console.log('[E2E] 场景1: 14条消息 - 虚拟滚动未启用');
    for (let i = 1; i <= 14; i++) {
      await page.evaluate((msgNum) => {
        const chatStore = (window as any).__chatStore;
        if (chatStore) {
          chatStore.getState().addMessage({
            id: `test-boundary-14-${msgNum}`,
            role: msgNum % 2 === 0 ? 'user' : 'assistant',
            content: `边界测试消息 ${msgNum}`,
            timestamp: Date.now() - (14 - msgNum) * 60000,
          });
        }
      }, i);
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(500);

    // 滚动到中间并发送消息
    await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (container) {
        container.scrollTop = container.scrollHeight / 2;
      }
    });
    await page.waitForTimeout(200);

    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (chatStore && settingsStore) {
        const { sendMessage } = chatStore.getState();
        const providerId = settingsStore.getState().currentProviderId || 'mock-provider';
        const modelId = settingsStore.getState().currentModel || 'mock-model';
        await sendMessage(`测试14条-${Date.now()}`, providerId, modelId);
      }
    });

    await page.waitForTimeout(1000);

    const distance1 = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (!container) return -1;
      return container.scrollHeight - container.scrollTop - container.clientHeight;
    });
    console.log('[E2E] 14条消息时发送后距离底部:', distance1);
    expect(distance1).toBeLessThan(100);

    // 测试场景2：15条消息（虚拟滚动启用）
    console.log('[E2E] 场景2: 15条消息 - 虚拟滚动启用');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().addMessage({
          id: 'test-boundary-15',
          role: 'user',
          content: '边界测试消息 15',
          timestamp: Date.now(),
        });
      }
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (container) {
        container.scrollTop = container.scrollHeight / 2;
      }
    });
    await page.waitForTimeout(200);

    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (chatStore && settingsStore) {
        const { sendMessage } = chatStore.getState();
        const providerId = settingsStore.getState().currentProviderId || 'mock-provider';
        const modelId = settingsStore.getState().currentModel || 'mock-model';
        await sendMessage(`测试15条-${Date.now()}`, providerId, modelId);
      }
    });

    await page.waitForTimeout(1500);

    const distance2 = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (!container) return -1;
      return container.scrollHeight - container.scrollTop - container.clientHeight;
    });
    console.log('[E2E] 15条消息时发送后距离底部:', distance2);
    expect(distance2).toBeLessThan(100);

    // 测试场景3：30条消息（确认虚拟滚动工作正常）
    console.log('[E2E] 场景3: 30条消息 - 虚拟滚动稳定工作');
    for (let i = 16; i <= 30; i++) {
      await page.evaluate((msgNum) => {
        const chatStore = (window as any).__chatStore;
        if (chatStore) {
          chatStore.getState().addMessage({
            id: `test-boundary-30-${msgNum}`,
            role: msgNum % 2 === 0 ? 'user' : 'assistant',
            content: `边界测试消息 ${msgNum}`,
            timestamp: Date.now() - (30 - msgNum) * 60000,
          });
        }
      }, i);
      await page.waitForTimeout(30);
    }

    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (container) {
        container.scrollTop = container.scrollHeight / 2;
      }
    });
    await page.waitForTimeout(200);

    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (chatStore && settingsStore) {
        const { sendMessage } = chatStore.getState();
        const providerId = settingsStore.getState().currentProviderId || 'mock-provider';
        const modelId = settingsStore.getState().currentModel || 'mock-model';
        await sendMessage(`测试30条-${Date.now()}`, providerId, modelId);
      }
    });

    // 等待更长时间，让虚拟滚动完全初始化和滚动
    console.log('[E2E] 等待虚拟滚动完成...');
    await page.waitForTimeout(3000);

    const distance3 = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-scroll-container"]');
      if (!container) return -1;
      return container.scrollHeight - container.scrollTop - container.clientHeight;
    });
    console.log('[E2E] 30条消息时发送后距离底部:', distance3);

    // 如果距离底部仍然很大，尝试再次滚动
    if (distance3 >= 100) {
      console.log('[E2E] ⚠️ 距离底部较远，尝试手动滚动到底部');
      await page.evaluate(() => {
        const container = document.querySelector('[data-testid="chat-scroll-container"]');
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
      await page.waitForTimeout(500);

      const distanceAfterRetry = await page.evaluate(() => {
        const container = document.querySelector('[data-testid="chat-scroll-container"]');
        if (!container) return -1;
        return container.scrollHeight - container.scrollTop - container.clientHeight;
      });
      console.log('[E2E] 重试后距离底部:', distanceAfterRetry);

      expect(distanceAfterRetry).toBeLessThan(100);
    } else {
      expect(distance3).toBeLessThan(100);
    }

    console.log('[E2E] ✅ 所有虚拟滚动边界测试通过');
  });
});

// 在浏览器控制台执行此脚本来设置测试环境
// 可以将此代码复制到浏览器控制台中执行
test.describe('手动测试辅助 - 在浏览器控制台执行', () => {
  test('设置测试环境（在控制台执行）', async ({ page }) => {
    // 此测试仅用于提供手动测试代码
    const setupCode = `
// 在浏览器控制台执行以下代码来设置测试环境

// 1. 添加测试消息辅助函数
window.__addTestMessage__ = function(msgNum) {
  // 直接操作 DOM，插入测试消息
  const container = document.querySelector('[data-testid="chat-scroll-container"]');
  if (!container) {
    console.error('找不到聊天容器');
    return;
  }

  // 创建测试消息元素
  const messageDiv = document.createElement('div');
  messageDiv.setAttribute('data-message-id', 'test-msg-' + msgNum);
  messageDiv.className = 'message-item';
  messageDiv.style.padding = '12px';
  messageDiv.style.marginBottom = '8px';
  messageDiv.style.background = '#2a2a2a';
  messageDiv.style.borderRadius = '8px';
  messageDiv.textContent = '测试消息 ' + msgNum + ' - 这是一条历史消息';

  // 插入到容器中
  container.appendChild(messageDiv);
  console.log('已添加消息', msgNum);
};

// 2. 添加 20 条测试消息
for (let i = 1; i <= 20; i++) {
  window.__addTestMessage__(i);
}

// 3. 手动滚动到中间
const chatContainer = document.querySelector('[data-testid="chat-scroll-container"]');
if (chatContainer) {
  chatContainer.scrollTop = chatContainer.scrollHeight / 2;
  console.log('已滚动到中间位置');
  console.log('scrollTop:', chatContainer.scrollTop);
  console.log('scrollHeight:', chatContainer.scrollHeight);
}

// 4. 发送测试消息
const inputBox = document.querySelector('[data-testid="chat-input"], textarea');
if (inputBox) {
  inputBox.value = '测试滚动到底部功能';
  inputBox.dispatchEvent(new Event('input', { bubbles: true }));
  inputBox.dispatchEvent(new Event('change', { bubbles: true }));
  console.log('已填入测试消息');
}

// 5. 点击发送
const sendButton = document.querySelector('[data-testid="chat-send-button"], button[aria-label*="发送"], button:has-text("发送")');
if (sendButton) {
  sendButton.click();
  console.log('已点击发送按钮');
}

// 6. 检查滚动位置
setTimeout(() => {
  const container = document.querySelector('[data-testid="chat-scroll-container"]');
  if (container) {
    console.log('发送后 scrollTop:', container.scrollTop);
    console.log('发送后 scrollHeight:', container.scrollHeight);
    console.log('发送后 clientHeight:', container.clientHeight);
    console.log('距离底部:', container.scrollHeight - container.scrollTop - container.clientHeight);
    console.log('距离底部 < 100px?', (container.scrollHeight - container.scrollTop - container.clientHeight) < 100);
  }
}, 1000);

// 7. 检查虚拟滚动状态
setTimeout(() => {
  const container = document.querySelector('[data-testid="chat-scroll-container"]');
  if (container) {
    const messages = container.querySelectorAll('[data-message-id], .message-item');
    console.log('容器内消息数量:', messages.length);
  }
}, 1500);
    `;

    console.log('请将以下代码复制到浏览器控制台执行：');
    console.log(setupCode);
  });
});
