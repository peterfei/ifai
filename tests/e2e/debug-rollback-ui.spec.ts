/**
 * 生产环境 Rollback UI 诊断测试
 *
 * 用于检查生产环境中"撤回全部"按钮不显示的问题
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup';

test.describe('Production Environment: Rollback UI Debug', () => {

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Rollback]') || text.includes('[DEBUG]') || text.includes('[Diff Debug]')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page, {
      useRealAI: false,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('DEBUG: Check ifainew-core loading and field mapping', async ({ page }) => {
    console.log('[DEBUG] ========== 检查 ifainew-core 加载情况 ==========');

    const debugInfo = await page.evaluate(() => {
      const results: any = {
        corePath: '',
        hasUseChatStore: false,
        moduleType: '',
        sourceCheck: {},
        fieldMappingTest: {}
      };

      // 检查 ifainew-core 的加载路径
      try {
        // 尝试访问 ifainew-core 的源码
        const coreModule = (window as any).__ifainewCore;
        results.sourceCheck.hasCoreModule = coreModule !== undefined;

        // 检查 chatStore
        const chatStore = (window as any).__chatStore;
        results.hasUseChatStore = chatStore !== undefined;

        if (chatStore) {
          // 获取 store 的状态
          const state = chatStore.getState();
          results.sourceCheck.hasGetState = typeof state === 'object';

          // 检查是否有 rollbackMessageToolCalls 方法
          results.sourceCheck.hasRollbackMethod = typeof chatStore.getState().rollbackMessageToolCalls === 'function';

          // 尝试创建一个测试消息来检查字段映射
          const { crypto } = window as any;
          const testMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Test message',
            timestamp: Date.now(),
            status: 'completed',
            toolCalls: [
              {
                id: crypto.randomUUID(),
                tool: 'agent_write_file',
                args: '{}',
                result: JSON.stringify({
                  success: true,
                  // 模拟 Rust 后端返回的 snake_case 字段
                  original_content: 'old content',
                  new_content: 'new content',
                  file_path: '/test/file.txt',
                  timestamp: Date.now()
                }),
                status: 'completed'
              }
            ]
          };

          // 添加消息到 store
          chatStore.getState().addMessage(testMessage);

          // 获取添加后的消息
          const messages = chatStore.getState().messages;
          const addedMsg = messages.find((m: any) => m.id === testMessage.id);

          if (addedMsg && addedMsg.toolCalls) {
            const tc = addedMsg.toolCalls[0];
            const resultData = JSON.parse(tc.result || '{}');

            results.fieldMappingTest = {
              hasOriginalContent: resultData.originalContent !== undefined,
              hasOriginalContentSnake: resultData.original_content !== undefined,
              hasNewContent: resultData.newContent !== undefined,
              hasNewContentSnake: resultData.new_content !== undefined,
              originalContentValue: resultData.originalContent || resultData.original_content,
              newContentValue: resultData.newContent || resultData.new_content
            };
          }
        }
      } catch (e) {
        results.error = String(e);
      }

      return results;
    });

    console.log('[DEBUG] 诊断结果:', JSON.stringify(debugInfo, null, 2));

    // 验证结果
    expect(debugInfo.hasUseChatStore).toBe(true);
    expect(debugInfo.sourceCheck.hasRollbackMethod).toBe(true);

    // 检查字段映射
    console.log('[DEBUG] 字段映射测试:', debugInfo.fieldMappingTest);
    if (debugInfo.fieldMappingTest.hasOriginalContentSnake) {
      console.log('[DEBUG] ✅ 检测到 snake_case 字段 (original_content)');
    }
    if (debugInfo.fieldMappingTest.hasOriginalContent) {
      console.log('[DEBUG] ✅ 检测到 camelCase 字段 (originalContent)');
    }
  });

  test('DEBUG: Simulate AI file write and check rollback button', async ({ page }) => {
    console.log('[DEBUG] ========== 模拟 AI 文件写入流程 ==========');

    const simulationResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const { crypto } = window as any;

      // 模拟 Rust 后端返回的 snake_case 格式
      const rustStyleResult = JSON.stringify({
        success: true,
        message: "File written successfully",
        original_content: "Old file content\nLine 2\nLine 3",
        new_content: "New file content\nLine 2\nLine 3",
        file_path: "README.md",
        timestamp: Date.now()
      });

      const testMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'I have modified the README.md file.',
        timestamp: Date.now(),
        status: 'completed',
        toolCalls: [
          {
            id: crypto.randomUUID(),
            tool: 'agent_write_file',
            args: JSON.stringify({ rel_path: 'README.md', content: 'New file content\nLine 2\nLine 3' }),
            result: rustStyleResult,
            status: 'completed'
          }
        ]
      };

      // 添加消息
      chatStore.getState().addMessage(testMessage);

      // 检查消息是否正确添加
      const messages = chatStore.getState().messages;
      const addedMsg = messages.find((m: any) => m.id === testMessage.id);

      if (!addedMsg || !addedMsg.toolCalls) {
        return { error: '消息添加失败' };
      }

      const tc = addedMsg.toolCalls[0];
      const resultData = JSON.parse(tc.result || '{}');

      // 检查 hasRollbackableFiles 的逻辑
      const hasRollbackData = (result: string | undefined): boolean => {
        if (!result) return false;
        try {
          const data = JSON.parse(result);
          return data.originalContent !== undefined || data.original_content !== undefined;
        } catch {
          return false;
        }
      };

      const checkHasRollbackableFiles = (message: any): boolean => {
        if (!message.toolCalls) return false;
        return message.toolCalls.some((tc: any) =>
          tc.tool === 'agent_write_file' &&
          tc.status === 'completed' &&
          hasRollbackData(tc.result)
        );
      };

      const hasRollbackable = checkHasRollbackableFiles(addedMsg);

      return {
        success: true,
        messageAdded: true,
        toolCallResult: resultData,
        hasRollbackable,
        hasOriginalContent: resultData.originalContent !== undefined,
        hasOriginalContentSnake: resultData.original_content !== undefined,
        originalContentValue: resultData.originalContent || resultData.original_content
      };
    });

    console.log('[DEBUG] 模拟结果:', JSON.stringify(simulationResult, null, 2));

    expect(simulationResult.success).toBe(true);
    expect(simulationResult.hasOriginalContentSnake).toBe(true);

    if (!simulationResult.hasRollbackable) {
      console.error('[DEBUG] ❌ 问题确认：即使有 original_content，hasRollbackable 仍为 false');
      console.error('[DEBUG] 这意味着 MessageItem.tsx 中的 hasRollbackData 函数只检查 originalContent（camelCase）');
    } else {
      console.log('[DEBUG] ✅ hasRollbackable 为 true，按钮应该显示');
    }
  });

  test('DEBUG: Check MessageItem hasRollbackData implementation', async ({ page }) => {
    console.log('[DEBUG] ========== 检查 MessageItem.tsx 实现 ==========');

    const implementationCheck = await page.evaluate(() => {
      // 检查页面中是否有 MessageItem 组件
      const messageItems = document.querySelectorAll('[data-message-id]');
      return {
        messageItemCount: messageItems.length,
        hasMessageItems: messageItems.length > 0
      };
    });

    console.log('[DEBUG] 页面中的 MessageItem 数量:', implementationCheck.messageItemCount);

    // 检查 MessageItem.tsx 源码中的 hasRollbackData 实现
    console.log('[DEBUG] 请检查 MessageItem.tsx 中的 hasRollbackData 函数：');
    console.log('[DEBUG] 它应该同时检查 originalContent 和 original_content');
  });
});
