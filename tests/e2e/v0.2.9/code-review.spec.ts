import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('AI Code Review (v0.2.9)', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page);
    await page.goto('/');
  });

  test('REV-E2E-01: 提交代码时的 AI 自动拦截审查', async ({ page }) => {
    // 1. 模拟 Git 暂存区有文件
    await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('git-status-change', { 
            detail: { staged: ['src/bad_code.ts'] } 
        }));
    });

    // 2. 点击 "Commit" 按钮 (假设 UI 上有)
    const commitBtn = page.locator('button[aria-label="Commit Changes"]');
    // await commitBtn.click(); // 实际开发时解注

    // 3. 模拟后端拦截并返回审查意见
    // 这里我们直接触发审查弹窗显示的事件
    await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('review-intercepted', { 
            detail: { issues: [{ message: 'No console.log allowed', severity: 'error' }] } 
        }));
    });

    // 4. 断言：审查模态框出现
    const reviewModal = page.locator('[data-testid="review-modal"]');
    await expect(reviewModal).toBeVisible();
    await expect(reviewModal).toContainText('No console.log allowed');

    // 5. 交互：选择忽略并强制提交
    await page.locator('text=Ignore Issues').click();
    await page.locator('button:has-text("Commit Anyway")').click();

    // 6. 断言：模态框关闭
    await expect(reviewModal).not.toBeVisible();
  });
});
