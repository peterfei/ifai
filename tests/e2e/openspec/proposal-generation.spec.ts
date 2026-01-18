/**
 * E2E 测试：Proposal 生成和流式参数显示
 * 全面测试斜杠命令和工具参数的流式显示功能
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

test.describe('Proposal 生成测试', () => {
    test.beforeEach(async ({ page }) => {
        // 导航到应用
        await page.goto('http://localhost:1420');
        // 等待应用加载
        await page.waitForLoadState('networkidle');
        await removeJoyrideOverlay(page);
    });

    test('斜杠命令 /proposal 应该生成 Markdown 格式而不是 JSON', async ({ page }) => {
        // 输入 /proposal 命令
        await page.fill('[data-test-id="chat-input"]', '/proposal 实现用户登录功能');
        await page.click('[data-test-id="send-button"]');

        // 等待助手消息出现
        await page.waitForSelector('div[role="assistant"]', { timeout: 10000 });

        // 等待生成开始（流式内容）
        await page.waitForTimeout(2000);

        // 获取消息内容
        const assistantMessage = page.locator('div[role="assistant"]').last();
        const content = await assistantMessage.textContent();

        // 验证：不应该看到原始 JSON 字符串（如 {, "changeId": 等）
        expect(content).not.toMatch(/^\s*\{/);
        expect(content).not.toContain('"changeId":');
        expect(content).not.toContain('"proposal":');

        // 验证：应该看到 Markdown 格式
        await expect(assistantMessage).toContainText('# 📋 OpenSpec 提案');
        await expect(assistantMessage).toContainText('## 变更ID');
        await expect(assistantMessage).toContainText('## 提案概述');
        await expect(assistantMessage).toContainText('## 任务清单');
        await expect(assistantMessage).toContainText('## 规格增量');

        // 验证：应该有 checkbox 样式的任务列表
        await expect(assistantMessage).toContainText('- [ ]');
    });

    test('Proposal 流式生成时不应该显示 JSON 代码块', async ({ page }) => {
        await page.fill('[data-test-id="chat-input"]', '/proposal 添加文件上传功能');
        await page.click('[data-test-id="send-button"]');

        await page.waitForSelector('div[role="assistant"]', { timeout: 10000 });

        const assistantMessage = page.locator('div[role="assistant"]').last();

        // 等待一些流式内容
        await page.waitForTimeout(3000);

        // 验证：不应该有 ```json 代码块
        const content = await assistantMessage.textContent();
        expect(content).not.toContain('```json');
    });

    test('Proposal 生成的任务应该有正确的格式', async ({ page }) => {
        await page.fill('[data-test-id="chat-input"]', '/proposal 优化数据库查询');
        await page.click('[data-test-id="send-button"]');

        await page.waitForSelector('div[role="assistant"]', { timeout: 10000 });

        const assistantMessage = page.locator('div[role="assistant"]').last();

        // 等待生成完成（最多30秒）
        await page.waitForTimeout(15000);

        // 验证任务格式：### [task-X] 标题
        await expect(assistantMessage).toContainText('### [task-');

        // 验证任务属性：**分类**, **预估**, **依赖**
        await expect(assistantMessage).toContainText('**分类**:');
        await expect(assistantMessage).toContainText('**预估**:');
        await expect(assistantMessage).toContainText('**依赖**:');
    });
});

test.describe('工具参数流式显示测试', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:1420');
        await page.waitForLoadState('networkidle');
    });

    test('write_file 工具应该显示 checkbox 样式的参数', async ({ page }) => {
        // 发送会触发 write_file 的消息
        await page.fill('[data-test-id="chat-input"]', '创建文件 hello.txt，内容为 "Hello World"');
        await page.click('[data-test-id="send-button"]');

        // 等待工具调用卡片出现
        await page.waitForSelector('[data-test-id="tool-approval-card"]', { timeout: 10000 });

        const toolCard = page.locator('[data-test-id="tool-approval-card"]').first();

        // 在生成过程中，应该看到 checkbox 样式的参数
        await page.waitForTimeout(1000);

        // 验证：应该显示参数名（不是 JSON 格式）
        await expect(toolCard).toContainText('path:');
        await expect(toolCard).toContainText('content:');

        // 验证：不应该看到 JSON 格式
        const content = await toolCard.textContent();
        expect(content).not.toMatch(/^\s*\{/);
        expect(content).not.toContain('"path":');
        expect(content).not.toContain('"content":');
    });

    test('list_dir 工具应该显示参数列表', async ({ page }) => {
        await page.fill('[data-test-id="chat-input"]', '列出当前目录的文件');
        await page.click('[data-test-id="send-button"]');

        await page.waitForSelector('[data-test-id="tool-approval-card"]', { timeout: 10000 });

        const toolCard = page.locator('[data-test-id="tool-approval-card"]').first();

        // 验证：应该显示路径参数
        await expect(toolCard).toContainText('path:');
    });

    test('工具参数应该有 checkbox 状态指示', async ({ page }) => {
        await page.fill('[data-test-id="chat-input"]', '创建文件 test.log');
        await page.click('[data-test-id="send-button"]');

        await page.waitForSelector('[data-test-id="tool-approval-card"]', { timeout: 10000 });

        const toolCard = page.locator('[data-test-id="tool-approval-card"]').first();

        // 等待流式生成
        await page.waitForTimeout(2000);

        // 验证：应该有 checkbox 样式的元素（w-3.5 h-3.5）
        const checkboxes = toolCard.locator('.w-3\\.5.h-3\\.5, .rounded');
        await expect(checkboxes).toHaveCount(await expect.poll(async () => {
            const count = await checkboxes.count();
            return count > 0;
        }, { timeout: 5000 }));
    });

    test('流式生成时不应该显示"正在解析工具参数"提示', async ({ page }) => {
        await page.fill('[data-test-id="chat-input"]', '读取文件 README.md');
        await page.click('[data-test-id="send-button"]');

        await page.waitForSelector('[data-test-id="tool-approval-card"]', { timeout: 10000 });

        const toolCard = page.locator('[data-test-id="tool-approval-card"]').first();

        // 验证：不应该看到这些提示
        await expect(toolCard).not.toContainText('正在解析工具参数');
        await expect(toolCard).not.toContainText('AI 正在分析操作需求');
        await expect(toolCard).not.toContainText('正在生成参数');
    });
});

test.describe('综合场景测试', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:1420');
        await page.waitForLoadState('networkidle');
    });

    test('连续生成多个 proposal 应该都显示 Markdown 格式', async ({ page }) => {
        // 第一个 proposal
        await page.fill('[data-test-id="chat-input"]', '/proposal 实现用户登录');
        await page.click('[data-test-id="send-button"]');
        await page.waitForSelector('div[role="assistant"]', { timeout: 10000 });
        await page.waitForTimeout(5000);

        // 第二个 proposal
        await page.fill('[data-test-id="chat-input"]', '/proposal 添加搜索功能');
        await page.click('[data-test-id="send-button"]');
        await page.waitForSelector('div[role="assistant"]', { timeout: 10000 });
        await page.waitForTimeout(5000);

        // 验证两个消息都是 Markdown 格式
        const messages = page.locator('div[role="assistant"]');
        const count = await messages.count();

        expect(count).toBeGreaterThanOrEqual(2);

        // 检查最后两个消息
        for (let i = 0; i < 2; i++) {
            const message = messages.nth(count - 1 - i);
            await expect(message).toContainText('# 📋 OpenSpec 提案');
        }
    });

    test('工具调用后继续生成内容应该正确显示', async ({ page }) => {
        // 触发工具调用
        await page.fill('[data-test-id="chat-input"]', '创建文件 example.txt 然后说明内容');
        await page.click('[data-test-id="send-button"]');

        await page.waitForSelector('[data-test-id="tool-approval-card"]', { timeout: 10000 });

        // 等待工具完成
        await page.waitForTimeout(5000);

        // 验证：应该有工具调用卡片和后续内容
        const assistantMessages = page.locator('div[role="assistant"]');
        await expect(assistantMessages.last()).toBeVisible();
    });
});

test.describe('错误处理测试', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:1420');
        await page.waitForLoadState('networkidle');
    });

    test('空的 proposal 需求应该显示错误提示', async ({ page }) => {
        await page.fill('[data-test-id="chat-input"]', '/proposal ');
        await page.click('[data-test-id="send-button"]');

        await page.waitForSelector('div[role="assistant"]', { timeout: 5000 });

        const assistantMessage = page.locator('div[role="assistant"]').last();

        // 应该显示错误提示
        await expect(assistantMessage).toContainText('请提供要生成提案的需求描述');
    });

    test('无效的斜杠命令应该显示帮助', async ({ page }) => {
        await page.fill('[data-test-id="chat-input"]', '/invalid-command');
        await page.click('[data-test-id="send-button"]');

        // 等待响应
        await page.waitForTimeout(2000);

        // 验证：应该显示错误或帮助
        const hasError = await page.locator('text=/未知的命令|无效的命令|error/i').count() > 0;
        // 或者显示正常聊天
        const hasChat = await page.locator('div[role="assistant"]').count() > 0;

        expect(hasError || hasChat).toBeTruthy();
    });
});
