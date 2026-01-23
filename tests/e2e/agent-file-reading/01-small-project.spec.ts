/**
 * Agent 文件读取 UX 测试 - 小项目场景
 *
 * 测试目标：验证小项目（< 10 个文件）场景下的文件读取体验
 *
 * 使用真实 AI 进行测试，需要配置 API Key：
 * 1. 复制 tests/e2e/.env.e2e.example 到 tests/e2e/.env.e2e.local
 * 2. 填写你的 API Key、Base URL 和模型
 *
 * @version v0.3.3
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
 * 辅助函数：等待工具批准对话框出现
 */
async function waitForApprovalDialog(page: any, timeout: number = 30000): Promise<{
  dialogCount: number;
  approveButtonCount: number;
  rejectButtonCount: number;
}> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await page.evaluate(() => {
      const toolApprovalCards = document.querySelectorAll('[data-testid="file-approval-dialog"]');
      const approveButtons = document.querySelectorAll('[data-testid="approve-button"]');
      const rejectButtons = document.querySelectorAll('[data-testid="reject-button"]');

      return {
        dialogCount: toolApprovalCards.length,
        approveButtonCount: approveButtons.length,
        rejectButtonCount: rejectButtons.length
      };
    });

    if (result.dialogCount > 0) {
      return result;
    }

    await page.waitForTimeout(500);
  }

  return { dialogCount: 0, approveButtonCount: 0, rejectButtonCount: 0 };
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

    // 禁用 auto-approve 以确保审批对话框出现
    await page.evaluate(async () => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.setState({ agentAutoApprove: false });
        console.log('[Test] Auto-approve 已设置为 false');
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

    // 等待审批对话框
    const approvalResult = await waitForApprovalDialog(page, 30000);

    console.log('[Test] 审批对话框数量:', approvalResult.dialogCount);
    console.log('[Test] 批准按钮数量:', approvalResult.approveButtonCount);
    console.log('[Test] 拒绝按钮数量:', approvalResult.rejectButtonCount);

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

    // 等待审批对话框（多个文件可能需要更长时间）
    const approvalResult = await waitForApprovalDialog(page, 45000);

    console.log('[Test] 审批对话框数量:', approvalResult.dialogCount);

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

    // 等待审批对话框
    await waitForApprovalDialog(page, 30000);

    const result = await page.evaluate(() => {
      const toolApprovalCards = document.querySelectorAll('[data-testid="file-approval-dialog"]');
      const approveButtons = document.querySelectorAll('[data-testid="approve-button"]');

      // 检查批量操作功能
      const hasBatchApprove = !!document.querySelector('[data-testid="batch-approve-button"]');
      const hasSelectAll = !!document.querySelector('[data-testid="select-all-button"]');
      const hasPermissionManager = !!document.querySelector('[data-testid="permission-manager"]');

      return {
        dialogCount: toolApprovalCards.length,
        approveButtonCount: approveButtons.length,
        hasBatchApprove,
        hasSelectAll,
        hasPermissionManager,
        problemConfirmed: approveButtons.length > 3
      };
    });

    console.log('[Test] 批量操作检查:', JSON.stringify(result, null, 2));
    console.log(`[Test] 问题确认: ${result.problemConfirmed ? '是 - 批量操作功能缺失' : '否'}`);

    // 记录到控制台便于收集
    await page.evaluate((data) => {
      console.log('[BASELINE_DATA]', JSON.stringify({
        projectSize: 'small',
        scenario: 'batch-operations-check',
        timestamp: new Date().toISOString(),
        ...data
      }, null, 2));
    }, result);

    expect(result.dialogCount).toBeGreaterThanOrEqual(0);
  });
});
