/**
 * E2E 测试：流式工具参数显示
 * 验证工具参数在生成过程中的流式显示
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe('流式工具参数显示测试', () => {
    test.beforeEach(async ({ page }) => {
        // 使用标准 E2E 环境设置
        await setupE2ETestEnvironment(page);
        await page.goto('/');

        // 等待聊天输入框可见
        await page.waitForSelector('[data-testid="chat-input"]', { timeout: 10000 }).catch(() => {
            // 如果聊天面板不可见，尝试打开它
            const chatToggleButton = page.locator('button[title*="IfAI Chat"], button:has-text("IfAI Chat")').first();
            chatToggleButton.click().catch(() => {});
            // 再次等待
            return page.waitForSelector('[data-testid="chat-input"]', { timeout: 5000 });
        });
    });

    test('应该显示流式参数查看器而非JSON', async ({ page }) => {
        // 发送一个会触发工具调用的消息
        await removeJoyrideOverlay(page);
        await page.fill('[data-testid="chat-input"]', '创建一个测试文件 test.txt，内容为 hello world');
        await page.click('[data-testid="send-button"]');

        // 等待工具调用卡片出现
        await page.waitForSelector('[data-testid="tool-approval-card"]', { timeout: 5000 });

        // 验证：不应该看到原始JSON字符串
        const toolCard = page.locator('[data-testid="tool-approval-card"]').first();
        await expect(toolCard).not.toContainText('{');

        // 验证：应该看到参数名（非JSON格式）
        await expect(toolCard).toContainText('path:');
        await expect(toolCard).toContainText('content:');

        // 验证：应该看到checkbox样式的参数列表
        const checkboxes = toolCard.locator('.w-3\\.5, .h-3\\.5');
        await expect(checkboxes).toHaveCount(await toolCard.locator('text=path:|text=content:').count());
    });

    test('流式生成时应显示加载动画而非已完成状态', async ({ page }) => {
        // 发送消息触发工具调用
        await removeJoyrideOverlay(page);
        await page.fill('[data-testid="chat-input"]', '列出当前目录的文件');
        await page.click('[data-testid="send-button"]');

        // 等待工具调用出现（在流式生成状态）
        await page.waitForSelector('[data-testid="tool-approval-card"]', { timeout: 5000 });

        const toolCard = page.locator('[data-testid="tool-approval-card"]').first();

        // 在生成过程中，应该看到Loader2或spinner图标
        const spinner = toolCard.locator('.animate-spin');
        await expect(spinner).toBeVisible({ timeout: 3000 });

        // 应该看到"生成中..."文本
        await expect(toolCard).toContainText('生成中...');
    });

    test('完成后应显示checkbox选中状态', async ({ page }) => {
        // 发送消息
        await removeJoyrideOverlay(page);
        await page.fill('[data-testid="chat-input"]', '创建文件 hello.txt');
        await page.click('[data-testid="send-button"]');

        // 等待工具调用完成
        await page.waitForSelector('[data-testid="tool-approval-card"]', { timeout: 5000 });
        const toolCard = page.locator('[data-testid="tool-approval-card"]').first();

        // 等待生成完成（spinning消失）
        await page.waitForSelector('.animate-spin', { state: 'detached', timeout: 10000 });

        // 验证：应显示绿色checkbox
        const checkedBox = toolCard.locator('.bg-green-500\\/20');
        await expect(checkedBox).toBeVisible();

        // 验证：应显示Check图标
        const checkIcon = toolCard.locator('svg.text-green-400');
        await expect(checkIcon).toBeVisible();
    });

    test('不应该显示"正在解析工具参数"提示', async ({ page }) => {
        // 发送消息
        await removeJoyrideOverlay(page);
        await page.fill('[data-testid="chat-input"]', '读取文件 package.json');
        await page.click('[data-testid="send-button"]');

        // 等待工具调用
        await page.waitForSelector('[data-testid="tool-approval-card"]', { timeout: 5000 });
        const toolCard = page.locator('[data-testid="tool-approval-card"]').first();

        // 验证：不应该看到"正在解析工具参数"文本
        await expect(toolCard).not.toContainText('正在解析工具参数');
        await expect(toolCard).not.toContainText('AI 正在分析操作需求');
    });

    test('应该正确显示不同类型的参数图标', async ({ page }) => {
        // 发送涉及多种参数类型的消息
        await removeJoyrideOverlay(page);
        await page.fill('[data-testid="chat-input"]', '在 /tmp 目录创建文件 test.log');
        await page.click('[data-testid="send-button"]');

        await page.waitForSelector('[data-testid="tool-approval-card"]', { timeout: 5000 });
        const toolCard = page.locator('[data-testid="tool-approval-card"]').first();

        // 验证：应显示文件夹图标（包含path参数）
        const folderIcon = toolCard.locator('svg').filter({ hasText: 'folder' });
        await expect(folderIcon).toBeVisible();

        // 验证：应显示文件图标（文件相关）
        const fileIcon = toolCard.locator('svg').filter({ hasText: 'file' });
        await expect(fileIcon).toBeVisible();
    });

    test('流式生成时不应该显示上一个工具的结果', async ({ page }) => {
        // 第一个工具调用
        await removeJoyrideOverlay(page);
        await page.fill('[data-testid="chat-input"]', '创建文件 a.txt');
        await page.click('[data-testid="send-button"]');

        // 等待第一个工具完成
        await page.waitForSelector('[data-testid="tool-approval-card"]', { timeout: 5000 });
        await page.waitForSelector('.animate-spin', { state: 'detached', timeout: 10000 });

        // 第二个工具调用（在同一个消息中）
        await removeJoyrideOverlay(page);
        await page.fill('[data-testid="chat-input"]', '创建文件 b.txt');
        await page.click('[data-testid="send-button"]');

        // 等待第二个工具开始生成
        await page.waitForSelector('[data-testid="tool-approval-card"]', { timeout: 5000 });

        // 验证：在流式生成时，不应显示"执行结果"
        const resultSection = page.locator('text=执行结果').first();
        const isStreaming = await page.locator('.animate-spin').isVisible();

        if (isStreaming) {
            await expect(resultSection).not.toBeVisible();
        }
    });

    test('参数值应被正确截断而不是显示完整JSON', async ({ page }) => {
        // 发送会产生长内容的消息
        const longContent = 'x'.repeat(200);
        await removeJoyrideOverlay(page);
        await page.fill('[data-testid="chat-input"]', `创建文件，内容为：${longContent}`);
        await page.click('[data-testid="send-button"]');

        await page.waitForSelector('[data-testid="tool-approval-card"]', { timeout: 5000 });
        const toolCard = page.locator('[data-testid="tool-approval-card"]').first();

        // 等待内容显示
        await page.waitForTimeout(1000);

        // 获取显示的内容
        const contentText = await toolCard.textContent();

        // 验证：应该被截断（显示"..."而不是完整200个字符）
        expect(contentText).toContain('...');
        expect(contentText?.length).toBeLessThan(200);
    });
});

test.describe('流式参数显示UI验证', () => {
    test('应该有正确的样式类', async ({ page }) => {
        await page.goto('http://localhost:1420');
        await page.waitForLoadState('networkidle');

        await removeJoyrideOverlay(page);
        await page.fill('[data-testid="chat-input"]', '创建测试文件');
        await page.click('[data-testid="send-button"]');

        await page.waitForSelector('[data-testid="tool-approval-card"]', { timeout: 5000 });
        const toolCard = page.locator('[data-testid="tool-approval-card"]').first();

        // 验证流式参数查看器的容器样式
        const container = toolCard.locator('.space-y-1').first();
        await expect(container).toBeVisible();

        // 验证参数项有hover效果
        const paramItems = toolCard.locator('.hover\\:bg-gray-800\\/30');
        await expect(paramItems).toHaveCount(await toolCard.locator('text=path:|text=content:').count());
    });
});
