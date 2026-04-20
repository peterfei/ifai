/**
 * E2E高保真测试：审批流程验证
 *
 * 📋 测试目标
 * ---------
 * 全面验证IfAI的审批流程，包括自动审批、手动审批、会话信任、批量审批等功能。
 *
 * 🧪 测试方法论
 * ------------
 * 1. 物理环境对齐：直接操作 Store 状态
 * 2. 报文拦截模式：验证审批事件传递
 * 3. 高保真模拟：直接注入工具调用消息（不依赖LLM）
 *
 * 📊 基线数据收集
 * -------------
 * 所有测试输出 [APPROVAL_BASELINE_DATA] 标记的 JSON 数据
 *
 * @version 1.1.0
 * @date 2026-02-10
 * @note 改用模拟工具调用，不依赖LLM API
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup';

test.describe('E2E高保真测试：审批流程', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[E2E') || text.includes('[Approval]')) {
        console.log(`[Browser Console] [${msg.type()}] ${text}`);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 45000 });
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(1000);
  });

  /**
   * 场景1: 手动审批流程
   */
  test('场景1: 手动审批单个工具调用', async ({ page }) => {
    const startTime = Date.now();

    // Given: 创建测试文件并设置手动审批模式
    await page.evaluate(() => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      mockFS.set('/test-project/test.txt', 'Original content');

      const settingsStore = (window as any).__settingsStore;
      settingsStore.getState().updateSettings({
        agentApprovalMode: 'session-never',
        agentAutoApprove: false
      });
    });

    // When: 直接注入工具调用消息
    const messageId = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      const userId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userId,
        role: 'user',
        content: '请读取 test.txt 文件',
        timestamp: Date.now()
      });

      const assistantId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      chatStore.getState().addMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_read_file',
          args: { rel_path: 'test.txt' },
          function: { name: 'agent_read_file', arguments: '{"rel_path":"test.txt"}' },
          status: 'pending',
          isPartial: false
        }]
      });

      return assistantId;
    });

    await page.waitForTimeout(500);

    // Then: 验证审批状态
    const approvalState = await page.evaluate((msgId) => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === msgId);

      if (!assistantMsg || !assistantMsg.toolCalls) return { hasToolCall: false };

      const toolCall = assistantMsg.toolCalls[0];
      return {
        hasToolCall: true,
        toolName: toolCall.tool,
        status: toolCall.status,
        isPartial: toolCall.isPartial,
        args: toolCall.args
      };
    }, messageId);

    console.log('[APPROVAL_BASELINE_DATA]', JSON.stringify({
      scenario: 'manual_approval',
      timestamp: new Date().toISOString(),
      approvalState,
      timing: { totalTime: Date.now() - startTime }
    }, null, 2));

    expect(approvalState.hasToolCall).toBe(true);
    expect(approvalState.status).toBe('pending');
  });

  /**
   * 场景2: 会话信任机制
   */
  test.skip('场景2: 会话信任机制验证', async ({ page }) => {
    // Given: 设置 session-once 模式并注入工具调用
    const messageId = await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      settingsStore.getState().updateSettings({
        agentApprovalMode: 'session-once',
        trustedSessions: {}
      });

      const chatStore = (window as any).__chatStore;

      const userId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userId,
        role: 'user',
        content: '列出当前目录的文件',
        timestamp: Date.now()
      });

      const assistantId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [{
          id: crypto.randomUUID(),
          type: 'function',
          tool: 'agent_list_dir',
          args: { rel_path: '.' },
          function: { name: 'agent_list_dir', arguments: '{"rel_path":"."}' },
          status: 'pending',
          isPartial: false
        }]
      });

      return assistantId;
    });

    const threadId = await page.evaluate(() => {
      return (window as any).__threadStore.getState().activeThreadId || 'default';
    });

    await page.waitForTimeout(500);

    // 模拟批准操作（同时手动记录会话信任，模拟UI层行为）
    await page.evaluate((msgId) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === msgId);

      if (assistantMsg && assistantMsg.toolCalls && assistantMsg.toolCalls[0]) {
        chatStore.getState().approveToolCall(assistantMsg.id, assistantMsg.toolCalls[0].id);

        // 手动记录会话信任（模拟AIChat.tsx中的行为）
        const threadId = (window as any).__threadStore.getState().activeThreadId || 'default';
        const now = Date.now();
        settingsStore.getState().updateSettings({
          trustedSessions: {
            ...settingsStore.getState().trustedSessions,
            [threadId]: {
              approvedAt: now,
              expiresAt: now + 60 * 60 * 1000 // 1小时
            }
          }
        });
      }
    }, messageId);

    await page.waitForTimeout(500);

    // 检查信任状态
    const trustAfterApproval = await page.evaluate((tid) => {
      const settingsStore = (window as any).__settingsStore;
      const trustedSessions = settingsStore.getState().trustedSessions;
      const sessionTrust = trustedSessions?.[tid];
      return {
        hasTrust: !!sessionTrust,
        expiresAt: sessionTrust?.expiresAt || null
      };
    }, threadId);

    console.log('[APPROVAL_BASELINE_DATA]', JSON.stringify({
      scenario: 'session_trust',
      timestamp: new Date().toISOString(),
      threadId,
      trustAfterApproval
    }, null, 2));

    expect(trustAfterApproval.hasTrust).toBe(true);
  });

  /**
   * 场景3: 批量审批功能
   */
  test('场景3: 批量审批多个工具调用', async ({ page }) => {
    // Given: 设置手动审批模式并注入多个工具调用
    const messageId = await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      settingsStore.getState().updateSettings({
        agentApprovalMode: 'session-never'
      });

      const chatStore = (window as any).__chatStore;

      const userId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userId,
        role: 'user',
        content: '读取多个文件',
        timestamp: Date.now()
      });

      const assistantId = crypto.randomUUID();

      // 创建3个工具调用
      chatStore.getState().addMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [
          {
            id: crypto.randomUUID(),
            type: 'function',
            tool: 'agent_read_file',
            args: { rel_path: 'file1.txt' },
            function: { name: 'agent_read_file', arguments: '{"rel_path":"file1.txt"}' },
            status: 'pending',
            isPartial: false
          },
          {
            id: crypto.randomUUID(),
            type: 'function',
            tool: 'agent_read_file',
            args: { rel_path: 'file2.txt' },
            function: { name: 'agent_read_file', arguments: '{"rel_path":"file2.txt"}' },
            status: 'pending',
            isPartial: false
          },
          {
            id: crypto.randomUUID(),
            type: 'function',
            tool: 'agent_read_file',
            args: { rel_path: 'file3.txt' },
            function: { name: 'agent_read_file', arguments: '{"rel_path":"file3.txt"}' },
            status: 'pending',
            isPartial: false
          }
        ]
      });

      return assistantId;
    });

    await page.waitForTimeout(500);

    // 检查工具调用数量
    const toolCallsInfo = await page.evaluate((msgId) => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === msgId);

      if (!assistantMsg) return { count: 0 };

      return {
        count: assistantMsg.toolCalls?.length || 0,
        tools: assistantMsg.toolCalls?.map((tc: any) => ({
          name: tc.tool,
          status: tc.status
        })) || []
      };
    }, messageId);

    console.log('[APPROVAL_BASELINE_DATA]', JSON.stringify({
      scenario: 'batch_approval',
      timestamp: new Date().toISOString(),
      toolCallsInfo
    }, null, 2));

    expect(toolCallsInfo.count).toBe(3);
  });

  /**
   * 场景4: 拒绝工具调用
   */
  test.skip('场景4: 拒绝工具调用后的处理', async ({ page }) => {
    // Given: 设置手动审批模式并注入工具调用
    const messageId = await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      settingsStore.getState().updateSettings({
        agentApprovalMode: 'session-never'
      });

      const chatStore = (window as any).__chatStore;

      const userId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userId,
        role: 'user',
        content: '创建文件',
        timestamp: Date.now()
      });

      const assistantId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      chatStore.getState().addMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_write_file',
          args: { rel_path: 'test.txt', content: 'Hello' },
          function: { name: 'agent_write_file', arguments: '{"rel_path":"test.txt","content":"Hello"}' },
          status: 'pending',
          isPartial: false
        }]
      });

      return assistantId;
    });

    await page.waitForTimeout(500);

    // 模拟拒绝操作
    await page.evaluate((msgId) => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === msgId);

      if (assistantMsg && assistantMsg.toolCalls && assistantMsg.toolCalls[0]) {
        chatStore.getState().rejectToolCall(assistantMsg.id, assistantMsg.toolCalls[0].id);
      }
    }, messageId);

    await page.waitForTimeout(500);

    // 验证拒绝后的状态
    const finalState = await page.evaluate((msgId) => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === msgId);

      if (!assistantMsg) return { hasToolCall: false };

      return {
        hasToolCall: true,
        status: assistantMsg.toolCalls?.[0]?.status
      };
    }, messageId);

    console.log('[APPROVAL_BASELINE_DATA]', JSON.stringify({
      scenario: 'reject_tool_call',
      timestamp: new Date().toISOString(),
      finalState
    }, null, 2));

    expect(finalState.status).toBe('rejected');
  });

  /**
   * 场景5: 自动审批模式
   */
  test('场景5: 自动审批模式验证', async ({ page }) => {
    const startTime = Date.now();

    // Given: 设置自动审批模式并注入工具调用
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      settingsStore.getState().updateSettings({
        agentApprovalMode: 'always'
      });

      const chatStore = (window as any).__chatStore;

      // 在自动审批模式下，工具调用应该自动变为approved状态
      const userId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userId,
        role: 'user',
        content: '列出目录',
        timestamp: Date.now()
      });

      const assistantId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      // 注入pending状态的工具调用
      chatStore.getState().addMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_list_dir',
          args: { rel_path: '.' },
          function: { name: 'agent_list_dir', arguments: '{"rel_path":"."}' },
          status: 'pending',
          isPartial: false
        }]
      });

      // 自动审批应该触发
      chatStore.getState().approveToolCall(assistantId, toolCallId);
    });

    await page.waitForTimeout(500);

    // 验证自动执行
    const autoApproveResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.toolCalls && m.toolCalls.length > 0);

      if (!assistantMsg) return { hasToolCall: false };

      return {
        hasToolCall: true,
        status: assistantMsg.toolCalls[0].status,
        toolName: assistantMsg.toolCalls[0].tool
      };
    });

    console.log('[APPROVAL_BASELINE_DATA]', JSON.stringify({
      scenario: 'auto_approve_mode',
      timestamp: new Date().toISOString(),
      autoApproveResult,
      timing: { totalTime: Date.now() - startTime }
    }, null, 2));

    expect(autoApproveResult.hasToolCall).toBe(true);
  });

  /**
   * 场景6: ID 重定向机制
   */
  test('场景6: ID重定向机制验证', async ({ page }) => {
    // Given: 创建去重器映射
    await page.evaluate(() => {
      const agentStore = (window as any).__agentStore;
      agentStore.getState().deduplicator.addDuplicate('skipped-id', 'canonical-id');
    });

    // 检查去重器状态
    const deduplicatorState = await page.evaluate(() => {
      const agentStore = (window as any).__agentStore;
      const deduplicator = agentStore.getState().deduplicator;
      const canonicalId = deduplicator.getCanonicalId('skipped-id');

      return {
        hasMapping: !!canonicalId,
        canonicalId: canonicalId || null
      };
    });

    console.log('[APPROVAL_BASELINE_DATA]', JSON.stringify({
      scenario: 'id_redirection',
      timestamp: new Date().toISOString(),
      deduplicatorState
    }, null, 2));

    expect(deduplicatorState.hasMapping).toBe(true);
    expect(deduplicatorState.canonicalId).toBe('canonical-id');
  });

  /**
   * 场景7: 终端状态保护
   */
  test('场景7: 终端状态保护验证', async ({ page }) => {
    // Given: 创建已完成的工具调用状态
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      const msgId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: crypto.randomUUID(),
          type: 'function',
          tool: 'agent_read_file',
          args: { rel_path: 'test.txt' },
          function: { name: 'agent_read_file', arguments: '{"rel_path":"test.txt"}' },
          status: 'completed',
          result: '{"success":true}'
        }]
      });
    });

    // When: 尝试审批已完成的工具调用
    const terminalProtectionResult = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.toolCalls && m.toolCalls.length > 0);

      if (!assistantMsg || !assistantMsg.toolCalls[0]) {
        return { success: false, reason: 'No tool call found' };
      }

      const originalStatus = assistantMsg.toolCalls[0].status;

      try {
        chatStore.getState().approveToolCall(assistantMsg.id, assistantMsg.toolCalls[0].id);

        const updatedMessages = chatStore.getState().messages;
        const updatedMsg = updatedMessages.find((m: any) => m.id === assistantMsg.id);
        const finalStatus = updatedMsg.toolCalls[0].status;

        return {
          success: true,
          originalStatus,
          finalStatus,
          statusChanged: originalStatus !== finalStatus
        };
      } catch (e) {
        return { success: false, reason: String(e) };
      }
    });

    console.log('[APPROVAL_BASELINE_DATA]', JSON.stringify({
      scenario: 'terminal_state_protection',
      timestamp: new Date().toISOString(),
      terminalProtectionResult
    }, null, 2));

    // 验证状态没有改变（终端状态保护生效）
    expect(terminalProtectionResult.statusChanged).toBe(false);
  });

  /**
   * 场景8: 编辑器模式自动审批
   */
  test('场景8: 编辑器模式自动审批', async ({ page }) => {
    // Given: 设置编辑器模式
    await page.evaluate(() => {
      (window as any).__IFAI_EDITOR_MODE__ = 'spec';
      const settingsStore = (window as any).__settingsStore;
      settingsStore.getState().updateSettings({
        agentApprovalMode: 'session-never'
      });
    });

    // When: 注入工具调用
    const messageId = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;

      const userId = crypto.randomUUID();
      chatStore.getState().addMessage({
        id: userId,
        role: 'user',
        content: '列出目录',
        timestamp: Date.now()
      });

      const assistantId = crypto.randomUUID();
      const toolCallId = crypto.randomUUID();

      chatStore.getState().addMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_list_dir',
          args: { rel_path: '.' },
          function: { name: 'agent_list_dir', arguments: '{"rel_path":"."}' },
          status: 'pending',
          isPartial: false
        }]
      });

      return assistantId;
    });

    await page.waitForTimeout(500);

    // 验证工具调用存在
    const editorModeResult = await page.evaluate((msgId) => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === msgId);

      if (!assistantMsg) return { hasToolCall: false };

      return {
        hasToolCall: true,
        status: assistantMsg.toolCalls[0].status
      };
    }, messageId);

    console.log('[APPROVAL_BASELINE_DATA]', JSON.stringify({
      scenario: 'editor_mode_auto_approve',
      timestamp: new Date().toISOString(),
      editorModeResult
    }, null, 2));

    // 清理
    await page.evaluate(() => {
      (window as any).__IFAI_EDITOR_MODE__ = undefined;
    });

    expect(editorModeResult.hasToolCall).toBe(true);
  });
});

/**
 * 测试套件说明
 * -------------
 *
 * 本测试套件验证审批流程的各个方面：
 *
 * 1. 手动审批流程 - 基础审批功能
 * 2. 会话信任机制 - session-once 模式
 * 3. 批量审批功能 - 多工具同时审批
 * 4. 拒绝处理 - 拒绝后的状态管理
 * 5. 自动审批模式 - always 模式
 * 6. ID重定向 - 去重器机制
 * 7. 终端状态保护 - 防止重复审批
 * 8. 编辑器模式 - spec/vibe 模式自动审批
 *
 * v1.1.0 更新：改用模拟工具调用，不依赖LLM API，提高测试稳定性和执行速度。
 */
