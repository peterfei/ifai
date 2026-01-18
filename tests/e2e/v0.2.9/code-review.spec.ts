/**
 * v0.2.9 AI 代码审查 E2E 测试

 * **架构说明**：
 * - 这些测试使用 Mock 对象，验证 UI 交互和流程逻辑
 * - **社区版**：可以运行此测试，测试 UI 和接口定义
 * - **商业版**：核心功能由 `ifainew-core` 私有库实现
 *
 * 测试目标：验证代码提交前的 AI 自动拦截审查功能
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay, safeClick } from '../setup';

test.describe('AI Code Review (v0.2.9)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('REV-E2E-01: Git 提交拦截与审查流程', async ({ page }) => {
    // Given: 模拟 Git 状态，有文件被暂存
    await page.evaluate(async () => {
      const mockGit = (window as any).__E2E_MOCK_GIT || {
        status: () => ({
          staged: ['src/service/user.ts', 'src/dto/user.ts'],
          modified: []
        }),
        diff: (file: string) => {
          if (file === 'src/service/user.ts') {
            return `diff --git a/src/service/user.ts b/src/service/user.ts
index abc123..def456 100644
--- a/src/service/user.ts
+++ b/src/service/user.ts
@@ -10,6 +10,7 @@
 export class UserService {
   async getUser(id: string) {
+    console.log('Debug: getUser called with', id);
     return await this.db.findUser(id);
   }
`;
          }
          return '';
        }
      };

      // 设置 Git mock
      (window as any).__mockGit = mockGit;

      // 触发 Git 状态变更事件
      window.dispatchEvent(new CustomEvent('git-status-change', {
        detail: { staged: ['src/service/user.ts'] }
      }));
    });

    await page.waitForTimeout(1000);

    // When: 用户点击 Commit 按钮
    // 首先移除可能的 Joyride overlay 防挡
    await removeJoyrideOverlay(page);
    const commitBtn = page.locator('button:has-text("Commit"), button[aria-label="Commit Changes"]');
    await commitBtn.click();

    // Then: 应该触发 AI 审查
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (chatStore) {
        // 模拟 AI 审查完成
        window.dispatchEvent(new CustomEvent('review-complete', {
          detail: {
            issues: [
              {
                id: 'issue-1',
                type: 'style',
                severity: 'warning',
                message: '不应在生产代码中使用 console.log',
                file: 'src/service/user.ts',
                line: 13,
                code: 'no-console'
              }
            ],
            summary: '发现 1 个代码质量问题'
          }
        }));
      }
    });

    await page.waitForTimeout(2000);

    // And: 应该显示审查模态框
    const reviewModal = page.locator('[data-testid="review-modal"], .review-modal');
    await expect(reviewModal).toBeVisible({ timeout: 10000 });

    // And: 模态框应该包含问题信息
    await expect(reviewModal).toContainText('console.log');
    await expect(reviewModal).toContainText('warning');
  });

  test('REV-E2E-02: 多类型审查意见分类显示', async ({ page }) => {
    // Given: 准备多种类型的审查问题
    const reviewIssues = [
      {
        type: 'security',
        severity: 'critical',
        message: 'SQL 注入风险：使用参数化查询',
        file: 'src/service/user.ts',
        line: 25,
        suggestion: '使用 prepared statement 代替字符串拼接'
      },
      {
        type: 'performance',
        severity: 'warning',
        message: '循环中重复查询数据库',
        file: 'src/service/user.ts',
        line: 30,
        suggestion: '考虑使用批量查询'
      },
      {
        type: 'style',
        severity: 'info',
        message: '缺少分号',
        file: 'src/dto/user.ts',
        line: 8,
        suggestion: '在行末添加分号'
      },
      {
        type: 'error',
        severity: 'error',
        message: '未定义的变量',
        file: 'src/utils/helper.ts',
        line: 12,
        suggestion: '声明变量或使用已定义的变量'
      }
    ];

    // When: 触发审查完成事件
    await page.evaluate((issues) => {
      window.dispatchEvent(new CustomEvent('review-complete', {
        detail: {
          issues: issues,
          summary: '发现 4 个问题：1 个严重、1 个警告、2 个建议'
        }
      }));
    }, reviewIssues);

    await page.waitForTimeout(1000);

    // Then: 审查模态框应该按类别分组显示问题
    const reviewModal = page.locator('[data-testid="review-modal"], .review-modal');
    await expect(reviewModal).toBeVisible();

    // 验证安全问题组
    await expect(reviewModal).toContainText('Security');
    await expect(reviewModal).toContainText('SQL 注入');
    await expect(reviewModal).toContainText('critical');

    // 验证性能问题组
    await expect(reviewModal).toContainText('Performance');
    await expect(reviewModal).toContainText('循环中重复查询');

    // 验证风格问题组
    await expect(reviewModal).toContainText('Style');
    await expect(reviewModal).toContainText('缺少分号');

    // 验证错误组
    await expect(reviewModal).toContainText('Error');
    await expect(reviewModal).toContainText('未定义的变量');
  });

  test('REV-E2E-03: 查看并应用修复建议', async ({ page }) => {
    // Given: 显示了有修复建议的审查问题
    await page.evaluate(async () => {
      // 先触发审查完成
      window.dispatchEvent(new CustomEvent('review-complete', {
        detail: {
          issues: [{
            id: 'issue-1',
            type: 'security',
            severity: 'critical',
            message: 'SQL 注入风险',
            file: 'src/service/user.ts',
            line: 25,
            hasFix: true,  // 表示有修复建议
            suggestion: '使用参数化查询'
          }],
          summary: '发现 1 个安全问题'
        }
      }));
    });

    await page.waitForTimeout(1000);

    // When: 点击"查看修复"按钮
    await removeJoyrideOverlay(page);
    const viewFixButton = page.locator('button:has-text("View Fix"), button:has-text("查看修复")');
    await viewFixButton.click();

    await page.waitForTimeout(1000);

    // Then: 应该显示修复建议模态框
    const fixModal = page.locator('[data-testid="fix-suggestion-modal"], .fix-modal');
    await expect(fixModal).toBeVisible();

    // And: 应该显示 Diff 对比
    await expect(fixModal).toContainText('Current');  // 当前代码
    await expect(fixModal).toContainText('Suggested');  // 建议修复

    // When: 点击"应用修复"按钮
    await page.evaluate(async () => {
      // 设置模拟文件系统
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      mockFS.set('/test-project/src/service/user.ts', `
export class UserService {
  async getUser(id: string) {
    const query = "SELECT * FROM users WHERE id = " + id;
    return await this.db.query(query);
  }
}
`);
    });

    await page.waitForTimeout(500);

    await removeJoyrideOverlay(page);
    const applyFixButton = page.locator('button:has-text("Apply Fix"), button:has-text("应用修复")');
    await applyFixButton.click();

    // Then: 验证文件已修改
    await page.waitForTimeout(1000);
    const newContent = await page.evaluate(() => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      return mockFS.get('/test-project/src/service/user.ts');
    });

    // 验证 SQL 注入问题被修复
    expect(newContent).not.toContain('"SELECT * FROM users WHERE id = " + id');
    expect(newContent).toMatch(/prepared|parameter|query/);
  });

  test('REV-E2E-04: 忽略问题并强制提交', async ({ page }) => {
    // Given: 显示了审查问题
    await page.evaluate(async () => {
      window.dispatchEvent(new CustomEvent('review-complete', {
        detail: {
          issues: [{
            id: 'issue-1',
            type: 'style',
            severity: 'info',
            message: '建议使用 const 代替 let',
            file: 'src/utils/helper.ts',
            line: 5
          }],
          summary: '发现 1 个建议'
        }
      }));
    });

    await page.waitForTimeout(1000);

    // When: 用户选择忽略问题并强制提交
    await removeJoyrideOverlay(page);
    const ignoreButton = page.locator('button:has-text("Ignore Issues"), button:has-text("忽略问题")');
    await ignoreButton.click();

    await page.waitForTimeout(500);

    await removeJoyrideOverlay(page);
    const commitButton = page.locator('button:has-text("Commit Anyway"), button:has-text("强制提交")');
    await commitButton.click();

    // Then: 审查模态框应该关闭
    const reviewModal = page.locator('[data-testid="review-modal"], .review-modal');
    await expect(reviewModal).not.toBeVisible();

    // And: 应该显示提交成功提示
    const successToast = page.locator('.toast, [data-testid="toast-success"]');
    await expect(successToast).toContainText('已提交');
  });

  test('REV-E2E-05: 审查历史记录', async ({ page }) => {
    // Given: 有历史审查记录
    await page.evaluate(async () => {
      const reviewStore = (window as any).__reviewStore;

      if (reviewStore) {
        reviewStore.getState().addReviewHistory({
          id: 'review-1',
          timestamp: Date.now() - 86400000, // 1天前
          commitHash: 'abc123',
          issues: [
            { type: 'security', severity: 'critical', message: 'SQL 注入' }
          ],
          status: 'fixed'
        });

        reviewStore.getState().addReviewHistory({
          id: 'review-2',
          timestamp: Date.now() - 3600000, // 1小时前
          commitHash: 'def456',
          issues: [
            { type: 'style', severity: 'info', message: '命名不规范' }
          ],
          status: 'ignored'
        });
      }
    });

    // When: 打开审查历史面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.getState().toggleReviewHistory();
      }
    });

    await page.waitForTimeout(1000);

    // Then: 应该显示历史记录列表
    await removeJoyrideOverlay(page);
    const historyPanel = page.locator('[data-testid="review-history-panel"], .review-history');
    await expect(historyPanel).toBeVisible();

    // And: 应该包含两条历史记录
    await expect(historyPanel).toContainText('abc123');
    await expect(historyPanel).toContainText('def456');

    // And: 应该显示状态标签
    await expect(historyPanel).toContainText('fixed');
    await expect(historyPanel).toContainText('ignored');
  });

  test('REV-E2E-06: 自定义审查规则', async ({ page }) => {
    // Given: 用户设置了自定义审查规则
    await page.evaluate(async () => {
      const reviewStore = (window as any).__reviewStore;

      if (reviewStore) {
        reviewStore.getState().setCustomRules([
          {
            id: 'rule-1',
            name: '禁止 TODO 注释',
            pattern: 'TODO:',
            severity: 'warning',
            message: '提交前应处理所有 TODO'
          },
          {
            id: 'rule-2',
            name: '函数名必须驼峰',
            pattern: 'function [a-z_]+',
            severity: 'style',
            message: '函数名应使用驼峰命名'
          }
        ]);
      }
    });

    // When: 触发审查（包含触发自定义规则的代码）
    await page.evaluate(async () => {
      const mockFS = (window as any).__E2E_MOCK_FILE_SYSTEM;
      mockFS.set('/test.ts', `
// TODO: 优化性能
function bad_name() {
  return 42;
}
`);

      window.dispatchEvent(new CustomEvent('git-status-change', {
        detail: { staged: ['test.ts'] }
      }));
    });

    await page.waitForTimeout(1000);

    // 模拟提交触发审查
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('review-complete', {
        detail: {
          issues: [
            {
              id: 'custom-rule-1',
              type: 'custom',
              severity: 'warning',
              message: '禁止 TODO 注释',
              ruleId: 'rule-1'
            },
            {
              id: 'custom-rule-2',
              type: 'custom',
              severity: 'style',
              message: '函数名必须驼峰',
              ruleId: 'rule-2'
            }
          ],
          summary: '发现 2 个自定义规则问题'
        }
      }));
    });

    await page.waitForTimeout(1000);

    // Then: 审查结果应该包含自定义规则问题
    const reviewModal = page.locator('[data-testid="review-modal"], .review-modal');
    await expect(reviewModal).toBeVisible();
    await expect(reviewModal).toContainText('TODO');
    await expect(reviewModal).toContainText('bad_name');
  });
});
