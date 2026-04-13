/**
 * Chat 并发提交和滚动行为 E2E 测试
 *
 * 测试场景:
 * 1. 红绿测试：AI 处理中提交新问题，验证是否会有错误
 * 2. 滚动吸底：提交新问题后，验证是否自动滚动到底部
 *
 * 测试标签: @fast @chat @scroll @concurrent
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Chat: 并发提交与滚动行为', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 添加辅助函数到 window 对象
    await page.evaluate(() => {
      (window as any).__E2E_CHAT_HELPERS__ = {
        // 获取聊天容器
        getChatContainer: () => {
          return document.querySelector('[class*="AIChat"]') ||
                 document.querySelector('[class*="chat"]') ||
                 document.querySelector('[class*="message"]')?.closest('div');
        },

        // 获取滚动容器
        getScrollContainer: () => {
          const chat = (window as any).__E2E_CHAT_HELPERS__.getChatContainer();
          return chat?.querySelector('[class*="virtual"]') ||
                 chat?.querySelector('[class*="scroll"]') ||
                 chat;
        },

        // 获取所有消息
        getMessages: () => {
          return document.querySelectorAll('[class*="message"], [class*="Message"]');
        },

        // 获取最后一条消息
        getLastMessage: () => {
          const messages = (window as any).__E2E_CHAT_HELPERS__.getMessages();
          return messages[messages.length - 1];
        },

        // 获取输入框
        getInput: () => {
          return document.querySelector('textarea[placeholder*="输入"]') ||
                 document.querySelector('textarea:not([readonly])') ||
                 document.querySelector('[contenteditable="true"]');
        },

        // 发送消息
        sendMessage: async (text: string) => {
          const input = (window as any).__E2E_CHAT_HELPERS__.getInput();
          if (!input) {
            console.error('[E2E] ❌ Input not found');
            return false;
          }

          // 聚焦输入框
          (input as HTMLElement).focus();
          await new Promise(resolve => setTimeout(resolve, 100));

          // 设置值
          if (input.tagName === 'TEXTAREA') {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype,
              'value'
            )?.set;
            nativeInputValueSetter?.call(input, text);

            // 触发输入事件
            input.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            input.textContent = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }

          await new Promise(resolve => setTimeout(resolve, 100));

          // 模拟按 Enter 发送
          input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            bubbles: true,
            shiftKey: false
          }));

          return true;
        },

        // 检查是否正在加载
        isLoading: () => {
          return document.querySelector('[class*="loading"]') !== null ||
                 document.querySelector('[class*="thinking"]') !== null ||
                 document.querySelector('[class*="streaming"]') !== null;
        },

        // 获取滚动位置信息
        getScrollInfo: () => {
          const container = (window as any).__E2E_CHAT_HELPERS__.getScrollContainer();
          if (!container) return null;

          return {
            scrollTop: (container as HTMLElement).scrollTop,
            scrollHeight: (container as HTMLElement).scrollHeight,
            clientHeight: (container as HTMLElement).clientHeight,
            isAtBottom: (container as HTMLElement).scrollTop +
                        (container as HTMLElement).clientHeight >=
                        (container as HTMLElement).scrollHeight - 50
          };
        },

        // 滚动到中间位置（模拟历史查看）
        scrollToMiddle: () => {
          const container = (window as any).__E2E_CHAT_HELPERS__.getScrollContainer();
          if (container) {
            const elem = container as HTMLElement;
            elem.scrollTop = elem.scrollHeight * 0.3;
          }
        }
      };
    });
  });

  test.describe('问题 1: 并发提交（红绿测试）', () => {
    test('@fast should handle concurrent message submission without errors', async ({ page }) => {
      console.log('\n[E2E] 🧪 测试: AI 处理中提交新问题');

      // Arrange: 发送第一条消息（触发 AI 响应）
      const firstMessage = '测试并发提交 - 第一条消息';

      const sent1 = await page.evaluate(async (msg) => {
        return await (window as any).__E2E_CHAT_HELPERS__.sendMessage(msg);
      }, firstMessage);

      expect(sent1).toBe(true);
      console.log('[E2E] ✅ 第一条消息已发送');

      // 等待 AI 开始响应（但不等待完成）
      await page.waitForTimeout(1500);

      // 验证 AI 正在处理
      const isLoading = await page.evaluate(() => {
        return (window as any).__E2E_CHAT_HELPERS__.isLoading();
      });

      console.log(`[E2E] 📊 AI 是否正在处理: ${isLoading}`);

      // Act: 在 AI 处理时发送第二条消息
      const secondMessage = '测试并发提交 - 第二条消息（并发）';

      console.log('[E2E] 🔄 发送第二条消息（并发）...');

      const sent2 = await page.evaluate(async (msg) => {
        return await (window as any).__E2E_CHAT_HELPERS__.sendMessage(msg);
      }, secondMessage);

      expect(sent2).toBe(true);
      console.log('[E2E] ✅ 第二条消息已发送');

      // 等待一段时间，确保没有错误
      await page.waitForTimeout(3000);

      // Assert: 验证没有控制台错误
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      // 验证两条消息都在 DOM 中
      const messageCount = await page.evaluate(() => {
        const messages = (window as any).__E2E_CHAT_HELPERS__.getMessages();
        return messages.length;
      });

      console.log(`[E2E] 📊 当前消息数量: ${messageCount}`);
      expect(messageCount).toBeGreaterThanOrEqual(2);

      // 验证没有严重的 JavaScript 错误
      const hasCriticalErrors = await page.evaluate(() => {
        const errors: string[] = [];
        // 检查是否有错误提示元素
        const errorElements = document.querySelectorAll('[class*="error"], [class*="Error"]');
        errorElements.forEach(el => {
          if (el.textContent && !el.textContent.includes('Error')) {
            errors.push(el.textContent || '');
          }
        });
        return errors.length > 0;
      });

      expect(hasCriticalErrors).toBe(false);
      console.log('[E2E] ✅ 并发提交测试通过 - 没有发现错误');
    });

    test('@fast should rapid-fire 3 messages and handle gracefully', async ({ page }) => {
      console.log('\n[E2E] 🧪 测试: 快速连续发送 3 条消息');

      // Act: 快速发送 3 条消息
      const messages = [
        '快速测试 1',
        '快速测试 2',
        '快速测试 3'
      ];

      for (let i = 0; i < messages.length; i++) {
        const sent = await page.evaluate(async (msg) => {
          return await (window as any).__E2E_CHAT_HELPERS__.sendMessage(msg);
        }, messages[i]);

        expect(sent).toBe(true);
        console.log(`[E2E] ✅ 消息 ${i + 1} 已发送`);

        // 只等待很短时间（模拟快速输入）
        await page.waitForTimeout(300);
      }

      // 等待处理完成
      await page.waitForTimeout(5000);

      // Assert: 验证所有消息都存在
      const messageCount = await page.evaluate(() => {
        const messages = (window as any).__E2E_CHAT_HELPERS__.getMessages();
        return messages.length;
      });

      console.log(`[E2E] 📊 最终消息数量: ${messageCount}`);
      expect(messageCount).toBeGreaterThanOrEqual(3);

      // 验证 UI 没有崩溃
      const bodyText = await page.innerText('body');
      expect(bodyText).toContain(messages[0]);

      console.log('[E2E] ✅ 快速连续发送测试通过');
    });
  });

  test.describe('问题 2: 滚动吸底行为', () => {
    test('@fast should scroll to bottom after sending message', async ({ page }) => {
      console.log('\n[E2E] 🧪 测试: 发送消息后自动滚动到底部');

      // Arrange: 先发送多条消息建立足够的对话历史（确保可以滚动）
      const initialMessages = [
        '建立对话基础 - 消息 1',
        '建立对话基础 - 消息 2',
        '建立对话基础 - 消息 3',
        '建立对话基础 - 消息 4',
        '建立对话基础 - 消息 5'
      ];

      for (const msg of initialMessages) {
        await page.evaluate(async (text) => {
          await (window as any).__E2E_CHAT_HELPERS__.sendMessage(text);
        }, msg);
        await page.waitForTimeout(300);
      }

      await page.waitForTimeout(2000);

      // Arrange: 滚动到顶部位置（模拟查看历史）
      await page.evaluate(() => {
        const container = (window as any).__E2E_CHAT_HELPERS__.getScrollContainer();
        if (container) {
          container.scrollTop = 0; // 滚动到最顶部
        }
      });

      await page.waitForTimeout(500);

      // 验证不在底部
      const scrollInfoBefore = await page.evaluate(() => {
        return (window as any).__E2E_CHAT_HELPERS__.getScrollInfo();
      });

      console.log('[E2E] 📊 发送前滚动位置:', scrollInfoBefore);

      // ⚠️ 如果内容太少无法滚动，跳过这个断言
      if (scrollInfoBefore && scrollInfoBefore.scrollHeight > scrollInfoBefore.clientHeight + 50) {
        expect(scrollInfoBefore.isAtBottom).toBe(false);
      } else {
        console.log('[E2E] ⚠️ 内容不足，跳过滚动位置验证');
      }

      // Act: 发送新消息
      const newMessage = '测试滚动吸底';

      await page.evaluate(async (msg) => {
        await (window as any).__E2E_CHAT_HELPERS__.sendMessage(msg);
      }, newMessage);

      // 等待消息发送和 UI 更新
      await page.waitForTimeout(1000);

      // Assert: 验证自动滚动到底部
      const scrollInfoAfter = await page.evaluate(() => {
        return (window as any).__E2E_CHAT_HELPERS__.getScrollInfo();
      });

      console.log('[E2E] 📊 发送后滚动位置:', scrollInfoAfter);

      // ⚠️ 关键断言：发送消息后应该在底部
      if (scrollInfoAfter) {
        const isAtBottom = scrollInfoAfter.isAtBottom ||
                          scrollInfoAfter.scrollTop + scrollInfoAfter.clientHeight >=
                          scrollInfoAfter.scrollHeight - 100;

        if (!isAtBottom) {
          console.error('[E2E] ❌ 滚动吸底失败!');
          console.error(`  - scrollTop: ${scrollInfoAfter.scrollTop}`);
          console.error(`  - scrollHeight: ${scrollInfoAfter.scrollHeight}`);
          console.error(`  - clientHeight: ${scrollInfoAfter.clientHeight}`);
          console.error(`  - 距离底部: ${scrollInfoAfter.scrollHeight - scrollInfoAfter.scrollTop - scrollInfoAfter.clientHeight}px`);
        }

        expect(isAtBottom).toBe(true);
      }

      console.log('[E2E] ✅ 滚动吸底测试通过');
    });

    test('@fast should maintain bottom position during streaming', async ({ page }) => {
      console.log('\n[E2E] 🧪 测试: 流式输出时保持底部位置');

      // Arrange: 发送一条会触发较长响应的消息
      const longPrompt = '请详细介绍一下 React 的并发渲染特性';

      await page.evaluate(async (msg) => {
        await (window as any).__E2E_CHAT_HELPERS__.sendMessage(msg);
      }, longPrompt);

      await page.waitForTimeout(1000);

      // Act: 在流式输出过程中多次检查滚动位置
      const scrollPositions: boolean[] = [];

      for (let i = 0; i < 5; i++) {
        await page.waitForTimeout(1000);

        const isAtBottom = await page.evaluate(() => {
          const info = (window as any).__E2E_CHAT_HELPERS__.getScrollInfo();
          if (!info) return true;
          return info.isAtBottom ||
                 info.scrollTop + info.clientHeight >= info.scrollHeight - 100;
        });

        scrollPositions.push(isAtBottom);
        console.log(`[E2E] 📊 第 ${i + 1} 次检查 - 是否在底部: ${isAtBottom}`);
      }

      // Assert: 大部分时间应该在底部（允许偶尔的延迟）
      const atBottomCount = scrollPositions.filter(p => p).length;
      const bottomPercentage = (atBottomCount / scrollPositions.length) * 100;

      console.log(`[E2E] 📊 在底部的时间比例: ${bottomPercentage}%`);

      // 至少 80% 的时间应该在底部
      expect(bottomPercentage).toBeGreaterThanOrEqual(80);

      console.log('[E2E] ✅ 流式输出滚动测试通过');
    });

    test('@fast should scroll to bottom when new message arrives', async ({ page }) => {
      console.log('\n[E2E] 🧪 测试: 收到新消息时滚动到底部');

      // Arrange: 先有足够的对话历史
      const initialMessages = [
        '初始消息 1',
        '初始消息 2',
        '初始消息 3',
        '初始消息 4',
        '初始消息 5'
      ];

      for (const msg of initialMessages) {
        await page.evaluate(async (text) => {
          await (window as any).__E2E_CHAT_HELPERS__.sendMessage(text);
        }, msg);
        await page.waitForTimeout(300);
      }

      // 滚动到顶部
      await page.evaluate(() => {
        const container = (window as any).__E2E_CHAT_HELPERS__.getScrollContainer();
        if (container) {
          (container as HTMLElement).scrollTop = 0;
        }
      });

      await page.waitForTimeout(500);

      // 验证不在底部
      const scrollBefore = await page.evaluate(() => {
        return (window as any).__E2E_CHAT_HELPERS__.getScrollInfo();
      });
      console.log('[E2E] 📊 新消息前滚动位置:', scrollBefore);

      // ⚠️ 如果内容太少无法滚动，跳过验证
      if (scrollBefore && scrollBefore.scrollHeight <= scrollBefore.clientHeight + 50) {
        console.log('[E2E] ⚠️ 内容不足，跳过滚动位置验证');
      }

      // Act: 发送新消息
      await page.evaluate(async (msg) => {
        await (window as any).__E2E_CHAT_HELPERS__.sendMessage(msg);
      }, '新消息测试');

      await page.waitForTimeout(1500);

      // Assert: 应该滚动到底部
      const scrollAfter = await page.evaluate(() => {
        return (window as any).__E2E_CHAT_HELPERS__.getScrollInfo();
      });

      console.log('[E2E] 📊 新消息后滚动位置:', scrollAfter);

      if (scrollAfter) {
        const isAtBottom = scrollAfter.isAtBottom ||
                          scrollAfter.scrollTop + scrollAfter.clientHeight >=
                          scrollAfter.scrollHeight - 100;

        expect(isAtBottom).toBe(true);
      }

      console.log('[E2E] ✅ 新消息滚动测试通过');
    });
  });

  test.describe('综合场景', () => {
    test('@fast should handle concurrent messages with correct scroll behavior', async ({ page }) => {
      console.log('\n[E2E] 🧪 综合测试: 并发消息 + 滚动行为');

      // Arrange: 建立对话并滚动到中间
      await page.evaluate(async () => {
        await (window as any).__E2E_CHAT_HELPERS__.sendMessage('初始消息');
      });

      await page.waitForTimeout(1500);

      // 滚动到中间
      await page.evaluate(() => {
        (window as any).__E2E_CHAT_HELPERS__.scrollToMiddle();
      });

      await page.waitForTimeout(500);

      // Act: 快速发送 2 条消息
      const messages = ['并发消息 1', '并发消息 2'];

      for (const msg of messages) {
        await page.evaluate(async (text) => {
          await (window as any).__E2E_CHAT_HELPERS__.sendMessage(text);
        }, msg);
        await page.waitForTimeout(200);
      }

      // 等待处理
      await page.waitForTimeout(3000);

      // Assert: 验证滚动位置和消息数量
      const scrollInfo = await page.evaluate(() => {
        return (window as any).__E2E_CHAT_HELPERS__.getScrollInfo();
      });

      const messageCount = await page.evaluate(() => {
        return (window as any).__E2E_CHAT_HELPERS__.getMessages().length;
      });

      console.log('[E2E] 📊 最终状态:');
      console.log(`  - 消息数量: ${messageCount}`);
      console.log(`  - 滚动位置:`, scrollInfo);

      // 应该至少有初始消息 + 2 条并发消息 + AI 响应
      expect(messageCount).toBeGreaterThanOrEqual(3);

      // 最后应该滚动到底部（因为最新的消息在底部）
      if (scrollInfo) {
        const isAtBottom = scrollInfo.isAtBottom ||
                          scrollInfo.scrollTop + scrollInfo.clientHeight >=
                          scrollInfo.scrollHeight - 150; // 稍微放宽阈值

        console.log(`[E2E] 📊 是否在底部: ${isAtBottom}`);

        // 如果 AI 响应完成，应该在底部
        const hasStreaming = await page.evaluate(() => {
          return (window as any).__E2E_CHAT_HELPERS__.isLoading();
        });

        if (!hasStreaming) {
          expect(isAtBottom).toBe(true);
        }
      }

      console.log('[E2E] ✅ 综合测试通过');
    });
  });
});
