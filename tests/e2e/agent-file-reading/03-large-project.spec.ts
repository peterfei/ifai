/**
 * Agent 文件读取 UX 测试 - 大项目场景
 *
 * 测试目标：验证大项目（50+ 个文件）场景下的文件读取体验
 *
 * 使用真实 AI 进行测试，需要配置 API Key：
 * 1. 复制 tests/e2e/.env.e2e.example 到 tests/e2e/.env.e2e.local
 * 2. 填写你的 API Key、Base URL 和模型
 *
 * @version v0.3.3
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, getRealAIConfig } from '../setup';
import { LARGE_PROJECT } from './test-data';

/**
 * 辅助函数：设置 Mock 文件系统（大项目版本）
 */
async function setupMockFileSystem(page: any, projectFiles: typeof LARGE_PROJECT) {
  await page.evaluate(async (project) => {
    const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM__;
    const fileStore = (window as any).__fileStore;

    // 设置项目根目录
    const rootPath = `/Users/mac/mock-project/${project.name}`;
    if (fileStore) {
      fileStore.getState().setRootPath(rootPath);
    }

    // 大项目：动态生成文件
    const generateLargeProjectFiles = () => {
      const files: any[] = [];
      const directories = [
        'src/components',
        'src/pages',
        'src/hooks',
        'src/utils',
        'src/services',
        'src/types',
        'src/store',
        'tests/unit',
        'tests/e2e',
        'config'
      ];

      directories.forEach((dir, dirIndex) => {
        const fileCount = dir.includes('components') || dir.includes('pages') ? 12 : 5;
        for (let i = 0; i < fileCount; i++) {
          const fileName = dir.includes('components')
            ? `${dir}/Component${i}.tsx`
            : dir.includes('pages')
            ? `${dir}/Page${i}.tsx`
            : `${dir}/file${i}.ts`;
          files.push({
            path: fileName,
            content: `// ${fileName}\nexport default function Component${i}() {\n  return <div>Content</div>;\n}`
          });
        }
      });

      return files;
    };

    const files = generateLargeProjectFiles();

    // 创建所有文件
    files.forEach((file: any) => {
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
            current.children.push({
              id: `${project.name}-${index}`,
              name: part,
              kind: 'file',
              path: currentPath
            });
          } else {
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
      const fileTree = buildFileTree(files, rootPath);
      fileStore.getState().setFileTree(fileTree);
    }

    console.log(`[Test] 已设置大项目文件系统: ${rootPath}, 文件数: ${files.length}`);
  }, projectFiles);
}

/**
 * 辅助函数：等待工具批准对话框出现（大项目使用更长的超时）
 */
async function waitForApprovalDialog(page: any, timeout: number = 90000): Promise<{
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

    await page.waitForTimeout(1000); // 大项目使用更长的轮询间隔
  }

  return { dialogCount: 0, approveButtonCount: 0, rejectButtonCount: 0 };
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

test.describe('Agent 文件读取 - 大项目场景 (50+ 个文件)', () => {
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
        settingsStore.setState({ agentAutoApprove: false });
        console.log('[Test] Auto-approve 已设置为 false');
      }
    });
  });

  /**
   * 测试用例 1: 收集大项目性能基线数据
   *
   * 场景：用户要求分析整个项目结构
   */
  test('@regression baseline-large-01: 收集大项目基线数据 - 分析项目结构', async ({ page }) => {
    console.log('[Test] ========== 大项目基线数据收集 ==========');

    await setupMockFileSystem(page, LARGE_PROJECT);
    await page.waitForTimeout(2000);

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
      text: '请分析整个项目的结构和主要模块',
      providerId: config.providerId,
      modelId: config.modelId
    });

    // 大项目需要非常长的等待时间
    const approvalResult = await waitForApprovalDialog(page, 120000);

    console.log('[Test] 审批对话框数量:', approvalResult.dialogCount);

    await page.waitForTimeout(30000);

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

    console.log('[Test] ========== 大项目基线报告 ==========');
    console.log('[Test]', JSON.stringify(results, null, 2));

    await page.evaluate((data) => {
      console.log('[BASELINE_DATA]', JSON.stringify({
        projectSize: 'large',
        scenario: 'analyze-project-structure',
        timestamp: new Date().toISOString(),
        ...data
      }, null, 2));
    }, results);

    expect(results.messagesCount).toBeGreaterThan(0);
  });

  /**
   * 测试用例 2: 大项目批量操作必要性验证
   *
   * 场景：验证大项目中批量操作功能的必要性
   */
  test('@regression baseline-large-02: 验证大项目批量操作必要性', async ({ page }) => {
    console.log('[Test] ========== 大项目批量操作必要性验证 ==========');

    await setupMockFileSystem(page, LARGE_PROJECT);
    await page.waitForTimeout(2000);

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
      text: '请为项目添加用户认证功能，包括登录、注册和权限管理',
      providerId: config.providerId,
      modelId: config.modelId
    });

    // 大项目添加功能需要很长时间
    const approvalResult = await waitForApprovalDialog(page, 150000);

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
        // 判断：超过 20 个按钮认为批量操作是强必要的
        batchOperationsStronglyNeeded: approveButtons.length > 20
      };
    });

    console.log('[Test] 批量操作评估:', JSON.stringify(result, null, 2));
    console.log(`[Test] 批量操作强必要性: ${result.batchOperationsStronglyNeeded ? '是' : '否'}`);

    await page.evaluate((data) => {
      console.log('[BASELINE_DATA]', JSON.stringify({
        projectSize: 'large',
        scenario: 'batch-operations-necessity',
        timestamp: new Date().toISOString(),
        ...data
      }, null, 2));
    }, result);

    expect(result.dialogCount).toBeGreaterThanOrEqual(0);
  });

  /**
   * 测试用例 3: 用户疲劳度评估
   *
   * 场景：评估大项目中用户审批多个文件时的疲劳度
   */
  test('@regression baseline-large-03: 评估大项目用户疲劳度', async ({ page }) => {
    console.log('[Test] ========== 大项目用户疲劳度评估 ==========');

    await setupMockFileSystem(page, LARGE_PROJECT);
    await page.waitForTimeout(2000);

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
      text: '请重构所有组件，使用 TypeScript 严格模式',
      providerId: config.providerId,
      modelId: config.modelId
    });

    // 记录审批对话框出现的时间点
    let dialogAppearTime = 0;
    const checkStartTime = Date.now();

    while (Date.now() - checkStartTime < 120000) {
      const state = await page.evaluate(() => {
        const toolApprovalCards = document.querySelectorAll('[data-testid="file-approval-dialog"]');
        return {
          dialogCount: toolApprovalCards.length
        };
      });

      if (state.dialogCount > 0 && dialogAppearTime === 0) {
        dialogAppearTime = Date.now();
        break;
      }

      await page.waitForTimeout(1000);
    }

    const results = metrics.getResults();

    // 计算疲劳度指标
    const finalResult = await page.evaluate(() => {
      const toolApprovalCards = document.querySelectorAll('[data-testid="file-approval-dialog"]');
      const approveButtons = document.querySelectorAll('[data-testid="approve-button"]');

      return {
        dialogCount: toolApprovalCards.length,
        approveButtonCount: approveButtons.length
      };
    });

    const fatigueAssessment = {
      dialogCount: finalResult.dialogCount,
      approveButtonCount: finalResult.approveButtonCount,
      timeToFirstDialog: dialogAppearTime - checkStartTime,
      fatigueScore: finalResult.approveButtonCount * 5, // 大项目使用更高的疲劳系数
      fatigueLevel: finalResult.approveButtonCount > 30 ? 'severe' :
                    finalResult.approveButtonCount > 15 ? 'high' :
                    finalResult.approveButtonCount > 5 ? 'medium' : 'low'
    };

    console.log('[Test] ========== 大项目疲劳度评估报告 ==========');
    console.log('[Test]', JSON.stringify(fatigueAssessment, null, 2));

    await page.evaluate((data) => {
      console.log('[BASELINE_DATA]', JSON.stringify({
        projectSize: 'large',
        scenario: 'user-fatigue-assessment',
        timestamp: new Date().toISOString(),
        ...data
      }, null, 2));
    }, fatigueAssessment);

    expect(fatigueAssessment.fatigueLevel).toBeDefined();
  });
});
