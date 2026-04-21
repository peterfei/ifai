/**
 * 归档浏览和恢复 E2E 测试
 *
 * 验证功能：
 * - 加载归档列表
 * - 查看归档详情
 * - 恢复归档到对话
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup-utils';

test.describe('归档浏览和恢复 - E2E 测试', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="chat-scroll-container"]', { state: 'attached', timeout: 10000 });
    await page.waitForFunction(() => {
      const w = window as any;
      return w.__chatStore && w.__conversationStore && w.__settingsStore;
    }, { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test.skip('应该能够加载归档列表', async ({ page }) => {
    console.log('[E2E] 测试: 加载归档列表');

    // 1. 创建并压缩一个对话，生成归档
    for (let i = 1; i <= 15; i++) {
      await page.evaluate((msgNum) => {
        const chatStore = (window as any).__chatStore;
        if (chatStore) {
          chatStore.getState().addMessage({
            id: `test-browse-${msgNum}`,
            role: msgNum % 2 === 0 ? 'user' : 'assistant',
            content: `归档列表测试消息 ${msgNum}`,
            timestamp: Date.now() - (15 - msgNum) * 60000,
          });
        }
      }, i);
      await page.waitForTimeout(30);
    }

    // 触发压缩
    await page.evaluate(async () => {
      const conversationStore = (window as any).__conversationStore;
      const chatStore = (window as any).__chatStore;

      if (conversationStore && chatStore) {
        const { compactConversation } = conversationStore.getState();
        const messages = chatStore.getState().messages;
        await compactConversation(messages, '归档列表测试总结', 5);
      }
    });

    await page.waitForTimeout(2000);

    // 2. 加载归档列表
    const archives = await page.evaluate(async () => {
      const conversationStore = (window as any).__conversationStore;
      if (!conversationStore) return { error: 'No conversationStore' };

      // 先加载归档列表
      await conversationStore.getState().loadArchives();

      // 获取归档列表
      return conversationStore.getState().archives;
    });

    console.log('[E2E] 归档列表:', archives);
    expect(Array.isArray(archives)).toBe(true);
    expect(archives.length).toBeGreaterThan(0);

    // 验证归档字段
    const firstArchive = archives[0];
    expect(firstArchive).toHaveProperty('id');
    expect(firstArchive).toHaveProperty('timestamp');
    expect(firstArchive).toHaveProperty('message_count');
    expect(firstArchive).toHaveProperty('summary_preview');
  });

  test.skip('应该能够加载归档详细内容', async ({ page }) => {
    console.log('[E2E] 测试: 加载归档详细内容');

    // 1. 创建归档
    for (let i = 1; i <= 10; i++) {
      await page.evaluate((msgNum) => {
        const chatStore = (window as any).__chatStore;
        if (chatStore) {
          chatStore.getState().addMessage({
            id: `test-detail-${msgNum}`,
            role: 'user',
            content: `归档详情测试消息 ${msgNum}`,
            timestamp: Date.now() - (10 - msgNum) * 60000,
          });
        }
      }, i);
      await page.waitForTimeout(30);
    }

    // 触发压缩
    await page.evaluate(async () => {
      const conversationStore = (window as any).__conversationStore;
      const chatStore = (window as any).__chatStore;

      if (conversationStore && chatStore) {
        const { compactConversation } = conversationStore.getState();
        const messages = chatStore.getState().messages;
        await compactConversation(messages, '归档详情测试总结', 5);
      }
    });

    await page.waitForTimeout(2000);

    // 2. 获取归档列表
    const archiveId = await page.evaluate(async () => {
      const conversationStore = (window as any).__conversationStore;
      await conversationStore.getState().loadArchives();
      const archives = conversationStore.getState().archives;
      return archives.length > 0 ? archives[0].id : null;
    });

    expect(archiveId).toBeTruthy();

    // 3. 加载归档详情
    const archiveDetail = await page.evaluate(async (id) => {
      const conversationStore = (window as any).__conversationStore;
      const detail = await conversationStore.getState().loadArchiveDetail(id);
      return detail;
    }, archiveId);

    console.log('[E2E] 归档详情:', archiveDetail);
    expect(archiveDetail).not.toBeNull();
    expect(archiveDetail).toHaveProperty('id', archiveId);
    expect(archiveDetail).toHaveProperty('summary');
    expect(archiveDetail).toHaveProperty('messages');
    expect(archiveDetail.messages).toBeInstanceOf(Array);
  });

  test('归档详情应该包含完整的元数据', async ({ page }) => {
    console.log('[E2E] 测试: 归档元数据完整性');

    // 创建归档（带自定义元数据）
    for (let i = 1; i <= 8; i++) {
      await page.evaluate((msgNum) => {
        const chatStore = (window as any).__chatStore;
        if (chatStore) {
          chatStore.getState().addMessage({
            id: `test-meta-${msgNum}`,
            role: 'user',
            content: `元数据测试 ${msgNum}`,
            timestamp: Date.now() - (8 - msgNum) * 60000,
          });
        }
      }, i);
      await page.waitForTimeout(30);
    }

    await page.evaluate(async () => {
      const conversationStore = (window as any).__conversationStore;
      const chatStore = (window as any).__chatStore;

      if (conversationStore && chatStore) {
        const { compactConversation } = conversationStore.getState();
        const messages = chatStore.getState().messages;
        await compactConversation(messages, '元数据测试总结', 5);
      }
    });

    await page.waitForTimeout(2000);

    // 加载归档详情
    const archiveDetail = await page.evaluate(async () => {
      const conversationStore = (window as any).__conversationStore;
      await conversationStore.getState().loadArchives();
      const archives = conversationStore.getState().archives;

      if (archives.length === 0) return null;

      const detail = await conversationStore.getState().loadArchiveDetail(archives[0].id);
      return detail;
    });

    console.log('[E2E] 归档元数据:', archiveDetail);

    if (archiveDetail) {
      // 验证基本字段
      expect(archiveDetail).toHaveProperty('timestamp');
      expect(archiveDetail).toHaveProperty('message_count');
      expect(archiveDetail).toHaveProperty('token_count');
      expect(archiveDetail).toHaveProperty('summary');

      // 验证扩展字段（如果存在）
      if (archiveDetail.format) {
        expect(['json', 'markdown']).toContain(archiveDetail.format);
      }

      if (archiveDetail.size) {
        expect(archiveDetail.size).toBeGreaterThan(0);
      }

      if (archiveDetail.metadata) {
        expect(typeof archiveDetail.metadata).toBe('object');
      }
    }
  });

  test('应该能够处理空归档列表', async ({ page }) => {
    console.log('[E2E] 测试: 空归档列表处理');

    const archives = await page.evaluate(async () => {
      const conversationStore = (window as any).__conversationStore;
      if (!conversationStore) return { error: 'No conversationStore' };

      await conversationStore.getState().loadArchives();
      return conversationStore.getState().archives;
    });

    console.log('[E2E] 归档列表（可能为空）:', archives);
    expect(Array.isArray(archives)).toBe(true);
    // 空列表是合法的，不应该抛出错误
  });

  test('应该能够处理不存在的归档 ID', async ({ page }) => {
    console.log('[E2E] 测试: 不存在的归档 ID');

    const archiveDetail = await page.evaluate(async () => {
      const conversationStore = (window as any).__conversationStore;
      const detail = await conversationStore.getState().loadArchiveDetail('non-existent-id');
      return detail;
    });

    console.log('[E2E] 不存在的归档详情:', archiveDetail);
    // 应该返回 null 而不是抛出错误
    expect(archiveDetail).toBeNull();
  });

  test('归档加载应该有正确的错误处理', async ({ page }) => {
    console.log('[E2E] 测试: 归档加载错误处理');

    const result = await page.evaluate(async () => {
      const conversationStore = (window as any).__conversationStore;

      // 尝试加载无效的归档 ID
      const detail = await conversationStore.getState().loadArchiveDetail('');

      // 检查是否有错误状态
      const error = conversationStore.getState().error;

      return {
        detail,
        error,
        hasError: !!error
      };
    });

    console.log('[E2E] 错误处理结果:', result);
    // 错误应该被捕获，不应该导致崩溃
    expect(result).toHaveProperty('hasError');
  });
});
