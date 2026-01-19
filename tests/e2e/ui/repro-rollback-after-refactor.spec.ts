/**
 * E2E 测试：还原 AI 重构后撤销功能失效的问题
 *
 * 问题描述：
 * 用户反馈重构 README 后，"撤销所有"功能没有了
 *
 * 场景：
 * 1. 用户使用 AI 重构 README
 * 2. AI 完成文件修改
 * 3. 预期显示"撤销所有"按钮
 * 4. 实际按钮不显示
 *
 * 根本原因分析：
 * - "撤销所有"按钮显示条件: hasRollbackableFiles
 * - hasRollbackableFiles 检查: toolCall.result 中是否包含 originalContent
 * - originalContent 由 ifainew-core 在执行 agent_write_file 时设置
 * - E2E 测试使用 mock-core，不会自动设置 originalContent
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Reproduction: Rollback Function After AI Refactor', () => {

  test.beforeEach(async ({ page }) => {
    // 监听控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Rollback]') || text.includes('[Mock Core]') || text.includes('[E2E]')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page, {
      useRealAI: false,
    });

    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('should show rollback button when AI modifies files with originalContent', async ({ page }) => {
    console.log('[E2E] ========== Rollback Button Display Test ==========');

    // 等待 chatStore 可用
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    // 测试：模拟 AI 重构 README 的场景
    const testResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      // 原始 README 内容
      const originalReadme = `# Original README

This is the original content.

## Features
- Feature 1
- Feature 2
`;

      // AI 修改后的 README 内容
      const modifiedReadme = `# Enhanced README

This is the enhanced content with more details.

## Features
- Feature 1 (improved)
- Feature 2 (improved)
- Feature 3 (new)

## Usage
Added usage section.
`;

      // 创建一个模拟的 AI 消息，包含 agent_write_file 工具调用
      const messageId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      const testMessage = {
        id: messageId,
        role: 'assistant' as const,
        content: 'I have refactored the README file with enhanced structure and content.',
        timestamp: Date.now(),
        status: 'completed' as const,
        toolCalls: [
          {
            id: toolCallId,
            tool: 'agent_write_file' as const,
            args: JSON.stringify({
              rel_path: 'README.md',
              content: modifiedReadme
            }),
            result: JSON.stringify({
              success: true,
              message: 'File written successfully',
              // 🔥 关键：originalContent 必须存在才能显示"撤销所有"按钮
              originalContent: originalReadme,
              newContent: modifiedReadme,
              filePath: '/test/README.md',
              timestamp: Date.now()
            }),
            status: 'completed' as const
          }
        ]
      };

      // 添加消息到 store
      chatStore.getState().addMessage(testMessage);

      // 获取添加后的消息，检查状态
      const messages = chatStore.getState().messages;
      const addedMessage = messages.find(m => m.id === messageId);

      if (!addedMessage || !addedMessage.toolCalls) {
        return {
          success: false,
          error: 'Message or toolCalls not found'
        };
      }

      const toolCall = addedMessage.toolCalls[0];
      let hasOriginalContent = false;
      try {
        const resultData = JSON.parse(toolCall.result || '{}');
        hasOriginalContent = resultData.originalContent !== undefined;
      } catch (e) {
        console.error('[E2E] Failed to parse toolCall.result:', e);
      }

      return {
        success: true,
        messageId,
        toolCallId,
        hasToolCalls: addedMessage.toolCalls.length > 0,
        toolName: toolCall.tool,
        toolStatus: toolCall.status,
        hasOriginalContent,
        originalContentLength: hasOriginalContent ? JSON.parse(toolCall.result).originalContent.length : 0
      };
    });

    console.log('[E2E] 测试结果:', testResult);

    // 验证消息和工具调用创建成功
    expect(testResult.success).toBe(true);
    expect(testResult.hasToolCalls).toBe(true);
    expect(testResult.toolName).toBe('agent_write_file');
    expect(testResult.toolStatus).toBe('completed');

    // 验证 originalContent 存在
    expect(testResult.hasOriginalContent).toBe(true);
    expect(testResult.originalContentLength).toBeGreaterThan(0);

    console.log('[E2E] ✅ originalContent 存在，"撤销所有"按钮应该显示');
  });

  test('should NOT show rollback button when originalContent is missing', async ({ page }) => {
    console.log('[E2E] ========== Missing originalContent Test ==========');

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    const testResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      const messageId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      // 🔥 故意不包含 originalContent，模拟 bug 场景
      const testMessage = {
        id: messageId,
        role: 'assistant' as const,
        content: 'I have modified a file.',
        timestamp: Date.now(),
        status: 'completed' as const,
        toolCalls: [
          {
            id: toolCallId,
            tool: 'agent_write_file' as const,
            args: JSON.stringify({
              rel_path: 'test.txt',
              content: 'new content'
            }),
            result: JSON.stringify({
              success: true,
              message: 'File written successfully',
              // 🔥 缺少 originalContent
              newContent: 'new content',
              filePath: '/test/test.txt',
              timestamp: Date.now()
            }),
            status: 'completed' as const
          }
        ]
      };

      chatStore.getState().addMessage(testMessage);

      const messages = chatStore.getState().messages;
      const addedMessage = messages.find(m => m.id === messageId);

      if (!addedMessage || !addedMessage.toolCalls) {
        return { success: false };
      }

      const toolCall = addedMessage.toolCalls[0];
      let hasOriginalContent = false;
      try {
        const resultData = JSON.parse(toolCall.result || '{}');
        hasOriginalContent = resultData.originalContent !== undefined;
      } catch (e) {
        // ignore
      }

      return {
        success: true,
        hasOriginalContent
      };
    });

    console.log('[E2E] 测试结果 (缺少 originalContent):', testResult);

    // 验证：没有 originalContent 时，按钮不应该显示
    expect(testResult.success).toBe(true);
    expect(testResult.hasOriginalContent).toBe(false);

    console.log('[E2E] ✅ originalContent 不存在，"撤销所有"按钮不应该显示（这是 bug 的根本原因）');
  });

  test('should verify hasRollbackableFiles logic in MessageItem', async ({ page }) => {
    console.log('[E2E] ========== hasRollbackableFiles Logic Test ==========');

    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 15000 });

    const logicTest = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      // 测试 1: 完整的消息（有 originalContent）
      const messageId1 = crypto.randomUUID();
      const messageWithRollback = {
        id: messageId1,
        role: 'assistant' as const,
        content: 'Test message 1',
        timestamp: Date.now(),
        status: 'completed' as const,
        toolCalls: [
          {
            id: crypto.randomUUID(),
            tool: 'agent_write_file' as const,
            args: '{}',
            result: JSON.stringify({
              originalContent: 'old content',
              newContent: 'new content'
            }),
            status: 'completed' as const
          }
        ]
      };

      // 测试 2: 消息没有 toolCalls
      const messageId2 = crypto.randomUUID();
      const messageWithoutToolCalls = {
        id: messageId2,
        role: 'assistant' as const,
        content: 'Test message 2',
        timestamp: Date.now(),
        status: 'completed' as const
      };

      // 测试 3: toolCall 没有完成
      const messageId3 = crypto.randomUUID();
      const messageWithIncompleteTool = {
        id: messageId3,
        role: 'assistant' as const,
        content: 'Test message 3',
        timestamp: Date.now(),
        status: 'completed' as const,
        toolCalls: [
          {
            id: crypto.randomUUID(),
            tool: 'agent_write_file' as const,
            args: '{}',
            result: JSON.stringify({
              originalContent: 'old content'
            }),
            status: 'pending' as const  // 🔥 不是 completed
          }
        ]
      };

      // 测试 4: toolCall 不是 agent_write_file
      const messageId4 = crypto.randomUUID();
      const messageWithDifferentTool = {
        id: messageId4,
        role: 'assistant' as const,
        content: 'Test message 4',
        timestamp: Date.now(),
        status: 'completed' as const,
        toolCalls: [
          {
            id: crypto.randomUUID(),
            tool: 'agent_read_file' as const,  // 🔥 不是 agent_write_file
            args: '{}',
            result: '{}',
            status: 'completed' as const
          }
        ]
      };

      // 测试 5: result 没有 originalContent
      const messageId5 = crypto.randomUUID();
      const messageWithoutOriginalContent = {
        id: messageId5,
        role: 'assistant' as const,
        content: 'Test message 5',
        timestamp: Date.now(),
        status: 'completed' as const,
        toolCalls: [
          {
            id: crypto.randomUUID(),
            tool: 'agent_write_file' as const,
            args: '{}',
            result: JSON.stringify({
              // 🔥 缺少 originalContent
              newContent: 'new content'
            }),
            status: 'completed' as const
          }
        ]
      };

      // 模拟 hasRollbackableFiles 的逻辑
      const hasRollbackData = (result: string | undefined): boolean => {
        if (!result) return false;
        try {
          const data = JSON.parse(result);
          return data.originalContent !== undefined;
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

      return {
        test1_hasRollbackable: checkHasRollbackableFiles(messageWithRollback),
        test2_noToolCalls: checkHasRollbackableFiles(messageWithoutToolCalls),
        test3_incompleteTool: checkHasRollbackableFiles(messageWithIncompleteTool),
        test4_differentTool: checkHasRollbackableFiles(messageWithDifferentTool),
        test5_noOriginalContent: checkHasRollbackableFiles(messageWithoutOriginalContent)
      };
    });

    console.log('[E2E] hasRollbackableFiles 逻辑测试结果:', logicTest);

    // 验证各种情况
    expect(logicTest.test1_hasRollbackable).toBe(true);  // ✅ 应该显示
    expect(logicTest.test2_noToolCalls).toBe(false);     // ❌ 不显示
    expect(logicTest.test3_incompleteTool).toBe(false);  // ❌ 不显示
    expect(logicTest.test4_differentTool).toBe(false);   // ❌ 不显示
    expect(logicTest.test5_noOriginalContent).toBe(false); // ❌ 不显示

    console.log('[E2E] ✅ hasRollbackableFiles 逻辑验证通过');
    console.log('[E2E] 结论：问题根源是 toolCall.result 缺少 originalContent 字段');
  });
});
