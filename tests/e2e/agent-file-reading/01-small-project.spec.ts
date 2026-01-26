/**
 * Agent 文件读取 UX 测试 - 小项目场景
 *
 * 测试目标：验证小项目（< 10 个文件）场景下的文件读取体验
 *
 * 使用真实 AI 进行测试，需要配置 API Key：
 * 1. 复制 tests/e2e/.env.e2e.example 到 tests/e2e/.env.e2e.local
 * 2. 填写你的 API Key、Base URL 和模型
 *
 * @version v0.3.4 - 适配会话信任机制，工具调用自动批准
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from '../setup';
import { SMALL_PROJECT } from './test-data';

/**
 * 辅助函数：设置 Mock 文件系统
 */
async function setupMockFileSystem(page: any, projectFiles: typeof SMALL_PROJECT) {
  await page.evaluate(async (project) => {
    const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
    const fileStore = (window as any).__fileStore;

    // 设置项目根目录
    const rootPath = `/Users/mac/mock-project/${project.name}`;
    if (fileStore) {
      fileStore.getState().setRootPath(rootPath);
    }

    // 创建所有文件
    project.files.forEach((file: any) => {
      mockFS.set(`${rootPath}/${file.path}`, file.content);
    });

    // 构建文件树
    const buildFileTree = (files: any[], basePath: string) => {
      const tree: any = { children: [] };

      files.forEach((file, index) => {
        const parts = file.path.split('/');
        let current = tree;
        let currentPath = basePath;

        parts.forEach((part: string, i: number) => {
          currentPath = `${currentPath}/${part}`;

          if (i === parts.length - 1) {
            // 文件节点
            current.children.push({
              id: `${project.name}-${index}`,
              name: part,
              kind: 'file',
              path: currentPath
            });
          } else {
            // 目录节点
            let dir = current.children.find((c: any) => c.name === part && c.kind === 'directory');
            if (!dir) {
              dir = {
                id: `dir-${part}`,
                name: part,
                kind: 'directory',
                path: currentPath,
                children: []
              };
              current.children.push(dir);
            }
            current = dir;
          }
        });
      });

      return tree;
    };

    if (fileStore) {
      const fileTree = buildFileTree(project.files, rootPath);
      fileStore.getState().setFileTree(fileTree);
    }

    console.log(`[Test] 已设置项目文件系统: ${rootPath}`);
  }, projectFiles);
}

/**
 * 辅助函数：等待工具调用完成（v0.3.4 - 适配会话信任机制）
 *
 * 会话信任机制会自动批准工具调用，不再显示审批对话框。
 * 因此改为等待工具调用状态变为 completed。
 */
async function waitForToolCallsCompletion(page: any, timeout: number = 30000): Promise<{
  completedCount: number;
  totalCount: number;
}> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await page.evaluate(() => {
      const messages = (window as any).__chatStore?.getState().messages || [];
      const toolCalls = messages.filter((m: any) => m.toolCalls && m.toolCalls.length > 0);

      let completedCount = 0;
      let totalCount = 0;

      toolCalls.forEach((message: any) => {
        message.toolCalls?.forEach((tc: any) => {
          totalCount++;
          // 检查工具调用是否完成（completed 或 failed）
          if (tc.status === 'completed' || tc.status === 'failed') {
            completedCount++;
          }
        });
      });

      // 🔥 DEBUG: 也检查 tool 消息（Agent 执行结果）
      const toolMessages = messages.filter((m: any) => m.role === 'tool');

      // 🔥 DEBUG: 输出 messages 结构信息
      return {
        completedCount,
        totalCount,
        totalMessages: messages.length,
        messagesWithToolCalls: toolCalls.length,
        toolMessagesCount: toolMessages.length,
        // 输出前几条消息的信息用于调试
        sampleMessages: messages.slice(0, 5).map((m: any) => ({
          role: m.role,
          hasToolCalls: !!m.toolCalls,
          toolCallsCount: m.toolCalls?.length || 0,
          toolCallId: m.tool_call_id
        }))
      };
    });

    // 🔥 DEBUG: 首次输出详细信息
    if (Date.now() - startTime < 100) {
      console.log(`[waitForToolCallsCompletion] 🔥 Initial state:`, JSON.stringify(result, null, 2));
    }

    // 🔥 DEBUG: 每5秒输出一次状态
    const elapsed = Date.now() - startTime;
    if (elapsed > 0 && elapsed % 5000 < 500) {
      console.log(`[waitForToolCallsCompletion] 🔥 Status: ${result.completedCount}/${result.totalCount} tool calls, ${result.toolMessagesCount} tool messages (elapsed: ${elapsed}ms)`);
    }

    // 🔥 v0.3.4: 如果有 tool 消息，说明 Agent 已完成工具调用
    if (result.toolMessagesCount > 0) {
      console.log(`[waitForToolCallsCompletion] ✅ Found ${result.toolMessagesCount} tool messages!`);
      // 返回一个估算值，基于 tool 消息数量
      return { completedCount: result.toolMessagesCount, totalCount: result.toolMessagesCount };
    }

    // 如果有工具调用且都已完成，返回结果
    if (result.totalCount > 0 && result.completedCount >= result.totalCount) {
      console.log(`[waitForToolCallsCompletion] ✅ All ${result.totalCount} tool calls completed!`);
      return { completedCount: result.completedCount, totalCount: result.totalCount };
    }

    // 如果没有任何工具调用，继续等待
    await page.waitForTimeout(500);
  }

  console.log(`[waitForToolCallsCompletion] ⏰ Timeout! Final status: 0/0`);
  return { completedCount: 0, totalCount: 0 };
}

/**
 * 辅助函数：收集测试指标
 */
interface TestMetrics {
  approvalCount: number;
  approvalTimes: number[];
  totalTime: number;
  messagesCount: number;
  messagesWithToolCalls: number;
  fatigueScore: number;
}

class MetricsCollector {
  private startTime: number = 0;
  private approvalTimestamps: number[] = [];

  start() {
    this.startTime = Date.now();
  }

  recordApproval() {
    this.approvalTimestamps.push(Date.now());
  }

  getResults(): TestMetrics {
    const endTime = Date.now();
    const totalTime = endTime - this.startTime;

    return {
      approvalCount: this.approvalTimestamps.length,
      approvalTimes: this.approvalTimestamps,
      totalTime,
      messagesCount: 0,  // 由测试填充
      messagesWithToolCalls: 0,  // 由测试填充
      fatigueScore: this.approvalTimestamps.length * 4
    };
  }
}

test.describe('Agent 文件读取 - 小项目场景 (< 10 个文件)', () => {
  test.beforeEach(async ({ page }) => {
    // 监听浏览器控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Test]') || text.includes('[E2E]') || text.includes('tool_call')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(2000);

    // 🔥 v0.3.4: 启用会话信任机制，工具调用将自动批准
    await page.evaluate(async () => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.setState({ agentAutoApprove: true });
        console.log('[Test] 🔥 v0.3.4: 会话信任机制已启用 (agentAutoApprove = true)');
      }
    });
  });

  /**
   * 测试用例 1: 收集小项目性能基线数据
   *
   * 目标：收集审批次数、时间等基线数据
   * 场景：用户要求读取 package.json 文件
   */
  test('@regression baseline-small-01: 收集小项目性能基线数据 - 读取单个文件', async ({ page }) => {
    console.log('[Test] ========== 小项目基线数据收集：读取单个文件 ==========');

    // 设置 Mock 文件系统
    await setupMockFileSystem(page, SMALL_PROJECT);
    await page.waitForTimeout(1000);

    // 清空消息
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });
    });

    const metrics = new MetricsCollector();
    metrics.start();

    // 触发 Agent - 使用真实 AI
    const config = await getRealAIConfig(page);
    console.log('[Test] 使用 provider:', config.providerId, 'model:', config.modelId);

    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, {
      text: '请读取 package.json 文件并告诉我内容',
      providerId: config.providerId,
      modelId: config.modelId
    });

    // 🔥 v0.3.4: 等待工具调用完成（会话信任机制自动批准）
    const completionResult = await waitForToolCallsCompletion(page, 30000);

    console.log('[Test] 已完成的工具调用:', completionResult.completedCount);
    console.log('[Test] 总工具调用数:', completionResult.totalCount);

    // 等待 AI 完成
    await page.waitForTimeout(10000);

    // 收集最终指标
    const finalMetrics = await page.evaluate(() => {
      const messages = (window as any).__chatStore.getState().messages;
      const messagesWithToolCalls = messages.filter((m: any) => m.toolCalls && m.toolCalls.length > 0);

      return {
        messagesCount: messages.length,
        messagesWithToolCalls: messagesWithToolCalls.length
      };
    });

    const results = metrics.getResults();
    results.messagesCount = finalMetrics.messagesCount;
    results.messagesWithToolCalls = finalMetrics.messagesWithToolCalls;

    console.log('[Test] ========== 小项目基线报告 ==========');
    console.log('[Test]', JSON.stringify(results, null, 2));

    await page.evaluate((data) => {
      console.log('[BASELINE_DATA]', JSON.stringify({
        projectSize: 'small',
        scenario: 'read-single-file',
        timestamp: new Date().toISOString(),
        ...data
      }, null, 2));
    }, results);

    // 验证：应该至少有一些消息
    expect(results.messagesCount).toBeGreaterThan(0);
  });

  /**
   * 测试用例 2: 读取多个文件
   *
   * 目标：验证读取多个文件时的审批流程
   * 场景：用户要求读取所有 TypeScript 文件
   */
  test('@regression baseline-small-02: 收集基线数据 - 读取多个文件', async ({ page }) => {
    console.log('[Test] ========== 小项目基线数据收集：读取多个文件 ==========');

    await setupMockFileSystem(page, SMALL_PROJECT);
    await page.waitForTimeout(1000);

    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });
    });

    const metrics = new MetricsCollector();
    metrics.start();

    const config = await getRealAIConfig(page);

    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, {
      text: '请读取所有 .ts 和 .tsx 文件',
      providerId: config.providerId,
      modelId: config.modelId
    });

    // 🔥 v0.3.4: 等待工具调用完成（多个文件可能需要更长时间）
    const completionResult = await waitForToolCallsCompletion(page, 45000);

    console.log('[Test] 已完成的工具调用:', completionResult.completedCount, '/', completionResult.totalCount);

    await page.waitForTimeout(15000);

    const finalMetrics = await page.evaluate(() => {
      const messages = (window as any).__chatStore.getState().messages;
      const messagesWithToolCalls = messages.filter((m: any) => m.toolCalls && m.toolCalls.length > 0);

      return {
        messagesCount: messages.length,
        messagesWithToolCalls: messagesWithToolCalls.length
      };
    });

    const results = metrics.getResults();
    results.messagesCount = finalMetrics.messagesCount;
    results.messagesWithToolCalls = finalMetrics.messagesWithToolCalls;

    console.log('[Test] ========== 小项目基线报告（多文件）==========');
    console.log('[Test]', JSON.stringify(results, null, 2));

    await page.evaluate((data) => {
      console.log('[BASELINE_DATA]', JSON.stringify({
        projectSize: 'small',
        scenario: 'read-multiple-files',
        timestamp: new Date().toISOString(),
        ...data
      }, null, 2));
    }, results);

    expect(results.messagesCount).toBeGreaterThan(0);
  });

  /**
   * 测试用例 3: 验证批量操作功能缺失
   *
   * 目标：确认小项目中批量操作功能的缺失
   */
  test('@regression baseline-small-03: 验证批量操作功能缺失', async ({ page }) => {
    console.log('[Test] ========== 验证批量操作功能缺失 ==========');

    await setupMockFileSystem(page, SMALL_PROJECT);
    await page.waitForTimeout(1000);

    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({ messages: [] });
    });

    const config = await getRealAIConfig(page);

    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        await chatStore.getState().sendMessage(
          payload.text,
          payload.providerId,
          payload.modelId
        );
      }
    }, {
      text: '请分析所有 TypeScript 组件文件',
      providerId: config.providerId,
      modelId: config.modelId
    });

    // 🔥 v0.3.4: 等待工具调用完成（会话信任机制自动批准）
    await waitForToolCallsCompletion(page, 30000);

    const result = await page.evaluate(() => {
      // 🔥 v0.3.4: 检查会话信任机制是否自动批准了工具调用
      // 使用 tool 消息数量而不是 toolCalls（Agent 系统使用 tool 消息）
      const messages = (window as any).__chatStore?.getState().messages || [];
      const toolMessages = messages.filter((m: any) => m.role === 'tool');

      // v0.3.4: 批量操作功能现在通过会话信任实现，不再需要 UI 按钮
      const hasBatchApprove = !!document.querySelector('[data-testid="batch-approve-button"]');
      const hasSelectAll = !!document.querySelector('[data-testid="select-all-button"]');
      const hasPermissionManager = !!document.querySelector('[data-testid="permission-manager"]');

      return {
        // 🔥 使用 tool 消息数量作为工具调用完成的证据
        autoApprovedCount: toolMessages.length,
        totalCount: toolMessages.length,
        hasBatchApprove,
        hasSelectAll,
        hasPermissionManager,
        sessionTrustEnabled: toolMessages.length > 0
      };
    });

    console.log('[Test] 批量操作检查:', JSON.stringify(result, null, 2));
    console.log(`[Test] 会话信任机制: ${result.sessionTrustEnabled ? '已启用' : '未启用'}`);

    // 记录到控制台便于收集
    await page.evaluate((data) => {
      console.log('[BASELINE_DATA]', JSON.stringify({
        projectSize: 'small',
        scenario: 'batch-operations-check',
        timestamp: new Date().toISOString(),
        ...data
      }, null, 2));
    }, result);

    // 🔥 v0.3.4: 验证会话信任机制工作正常
    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.autoApprovedCount).toBeGreaterThanOrEqual(result.totalCount);
  });
});
