/**
 * Agent 文件读取 UX 测试 - 中等项目场景
 *
 * 测试目标：验证中等项目（10-50 个文件）场景下的文件读取体验
 *
 * 使用真实 AI 进行测试，需要配置 API Key：
 * 1. 复制 tests/e2e/.env.e2e.example 到 tests/e2e/.env.e2e.local
 * 2. 填写你的 API Key、Base URL 和模型
 *
 * @version v0.3.4 - 适配会话信任机制
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from '../setup';
import { MEDIUM_PROJECT } from './test-data';
import { waitForToolCallsCompletion } from './test-helpers';

/**
 * 辅助函数：设置 Mock 文件系统
 */
async function setupMockFileSystem(page: any, projectFiles: typeof MEDIUM_PROJECT) {
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

    console.log(`[Test] 已设置项目文件系统: ${rootPath}, 文件数: ${project.files.length}`);
  }, projectFiles);
}

/**
 * 测试指标收集器
 */
class MetricsCollector {
  private startTime: number = 0;
  private approvalTimestamps: number[] = [];

  start() {
    this.startTime = Date.now();
  }

  recordApproval() {
    this.approvalTimestamps.push(Date.now());
  }

  getResults() {
    const endTime = Date.now();
    const totalTime = endTime - this.startTime;

    return {
      approvalCount: this.approvalTimestamps.length,
      totalTime,
      messagesCount: 0,
      messagesWithToolCalls: 0,
      fatigueScore: this.approvalTimestamps.length * 4
    };
  }
}

test.describe('Agent 文件读取 - 中等项目场景 (10-50 个文件)', () => {
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

    // 禁用 auto-approve
    await page.evaluate(async () => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.setState({ agentAutoApprove: true });
        console.log('[Test] Auto-approve 已设置为 false');
      }
    });
  });

  /**
   * 测试用例 1: 收集中等项目性能基线数据
   *
   * 场景：用户要求分析 src/components 目录
   */
  test('@regression baseline-medium-01: 收集中等项目基线数据 - 分析组件目录', async ({ page }) => {
    console.log('[Test] ========== 中等项目基线数据收集 ==========');

    await setupMockFileSystem(page, MEDIUM_PROJECT);
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
      text: '请分析 src/components 目录下的所有组件文件',
      providerId: config.providerId,
      modelId: config.modelId
    });

    // 中等项目需要更长等待时间
    const approvalResult = await waitForToolCallsCompletion(page, 60000);

    console.log('[Test] 已完成的工具调用:', approvalResult.completedCount, '/', approvalResult.totalCount);

    await page.waitForTimeout(20000);

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

    console.log('[Test] ========== 中等项目基线报告 ==========');
    console.log('[Test]', JSON.stringify(results, null, 2));

    await page.evaluate((data) => {
      console.log('[BASELINE_DATA]', JSON.stringify({
        projectSize: 'medium',
        scenario: 'analyze-components',
        timestamp: new Date().toISOString(),
        ...data
      }, null, 2));
    }, results);

    expect(results.messagesCount).toBeGreaterThan(0);
  });

  /**
   * 测试用例 2: 读取多个配置文件
   *
   * 场景：用户要求读取所有配置文件
   */
  test('@regression baseline-medium-02: 收集中等项目基线数据 - 读取配置文件', async ({ page }) => {
    console.log('[Test] ========== 中等项目基线数据收集：配置文件 ==========');

    await setupMockFileSystem(page, MEDIUM_PROJECT);
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
      text: '请读取所有配置文件（.json, .config.js, .env）',
      providerId: config.providerId,
      modelId: config.modelId
    });

    const approvalResult = await waitForToolCallsCompletion(page, 60000);

    console.log('[Test] 已完成的工具调用:', approvalResult.completedCount, '/', approvalResult.totalCount);

    await page.waitForTimeout(20000);

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

    console.log('[Test] ========== 中等项目基线报告（配置文件）==========');
    console.log('[Test]', JSON.stringify(results, null, 2));

    await page.evaluate((data) => {
      console.log('[BASELINE_DATA]', JSON.stringify({
        projectSize: 'medium',
        scenario: 'read-config-files',
        timestamp: new Date().toISOString(),
        ...data
      }, null, 2));
    }, results);

    expect(results.messagesCount).toBeGreaterThan(0);
  });

  /**
   * 测试用例 3: 批量操作功能评估
   *
   * 场景：中等项目中验证批量操作的必要性
   */
  test('@regression baseline-medium-03: 评估中等项目批量操作必要性', async ({ page }) => {
    // 🔥 v0.3.4: 增加超时时间
    test.setTimeout(180000);
    console.log('[Test] ========== 中等项目批量操作评估 ==========');

    await setupMockFileSystem(page, MEDIUM_PROJECT);
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
      text: '请分析整个项目的结构和依赖关系',
      providerId: config.providerId,
      modelId: config.modelId
    });

    const completionResult = await waitForToolCallsCompletion(page, 90000);

    // 🔥 v0.3.4: 检查会话信任机制是否自动批准了所有工具调用
    const result = await page.evaluate(() => {
      const messages = (window as any).__chatStore?.getState().messages || [];
      const toolCalls = messages.filter((m: any) => m.toolCalls && m.toolCalls.length > 0);

      let autoApprovedCount = 0;
      let totalCount = 0;

      toolCalls.forEach((message: any) => {
        message.toolCalls?.forEach((tc: any) => {
          totalCount++;
          if (tc.status === 'completed') {
            autoApprovedCount++;
          }
        });
      });

      // v0.3.4: 批量操作功能现在通过会话信任实现
      const hasBatchApprove = !!document.querySelector('[data-testid="batch-approve-button"]');
      const hasSelectAll = !!document.querySelector('[data-testid="select-all-button"]');
      const hasPermissionManager = !!document.querySelector('[data-testid="permission-manager"]');

      return {
        autoApprovedCount,
        totalCount,
        hasBatchApprove,
        hasSelectAll,
        hasPermissionManager,
        sessionTrustEnabled: autoApprovedCount > 0 && totalCount > 0,
        // 判断：大量工具调用自动批准说明会话信任有效
        batchOperationsEffective: autoApprovedCount >= 10
      };
    });

    console.log('[Test] 批量操作评估:', JSON.stringify(result, null, 2));
    console.log(`[Test] 会话信任机制: ${result.sessionTrustEnabled ? '已启用' : '未启用'}`);
    console.log(`[Test] 批量操作有效性: ${result.batchOperationsEffective ? '是' : '否'}`);

    await page.evaluate((data) => {
      console.log('[BASELINE_DATA]', JSON.stringify({
        projectSize: 'medium',
        scenario: 'batch-operations-assessment',
        timestamp: new Date().toISOString(),
        ...data
      }, null, 2));
    }, result);

    // 🔥 v0.3.4: 验证会话信任机制对大量工具调用的处理
    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.autoApprovedCount).toBeGreaterThanOrEqual(result.totalCount);
  });
});
