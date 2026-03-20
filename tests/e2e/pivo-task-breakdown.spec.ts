import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from './setup';

/**
 * 🏆 PIVO 任务拆解全链路集成测试
 * 遵循 REAL_AI_COMMERCIAL_METHODOLOGY.md 规范
 */
test.describe('PIVO Task Breakdown Integration', () => {
  // 🏆 延长超时以适应资源加载和潜在的 LLM 推理
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // 1. 初始化环境，跳过欢迎弹窗
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false // 本次测试主要验证 UI 与 Store 联动，使用 Mock AI 即可
    });

    await page.goto('/');

    // 🏆 强力锁定：确保关键 Store 挂载完成
    // PIVO 专有 Store
    await page.waitForFunction(() => (window as any).__pivoStore !== undefined, { timeout: 60000 });
    // 基础聊天 Store
    await page.waitForFunction(() => (window as any).__chatStore !== undefined, { timeout: 60000 });
    // Settings Store
    await page.waitForFunction(() => (window as any).__settingsStore !== undefined, { timeout: 60000 });

    // 🔥 FIX: 设置 mock API key 以绕过 "Please set API key" 检查
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey: 'mock-api-key-for-testing'
        });
      }
    });

    console.log('[E2E Setup] ✅ PIVO and Chat Stores verified, Mock API key configured');
  });

  test('应该能通过 Store 驱动渲染极简 Checkbox 任务列表并同步状态', async ({ page }) => {
    const messageId = "msg-pivo-integration-test";
    const mockTasks = [
      {
        id: "task-init",
        label: "初始化组件结构",
        status: "success",
        task_type: "Plan",
        children: []
      },
      {
        id: "task-impl",
        label: "实现核心业务逻辑",
        status: "running",
        task_type: "Implement",
        children: [
          {
            id: "task-api",
            label: "添加 API 挂钩",
            status: "pending",
            task_type: "Implement",
            children: []
          }
        ]
      }
    ];

    // 🚀 1. 注入模拟数据并验证初始渲染
    await page.evaluate(({ msgId, tasks }) => {
      const pivoStore = (window as any).__pivoStore;
      const chatStore = (window as any).__chatStore;

      // 添加基础消息
      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        content: '任务已拆解完成。',
        timestamp: Date.now()
      });

      // 设置 PIVO 任务树（setTaskTree 会自动设置 activeMessageId）
      pivoStore.getState().setTaskTree(msgId, tasks);

      // 🔥 DEBUG: 验证状态已正确设置
      console.log('[PIVO Debug] After setTaskTree:', {
        taskTrees: pivoStore.getState().taskTrees,
        activeMessageId: pivoStore.getState().activeMessageId,
        chatMessages: chatStore.getState().messages.length,
        lastMessage: chatStore.getState().messages[chatStore.getState().messages.length - 1]
      });
    }, { msgId: messageId, tasks: mockTasks });

    // 🔥 DEBUG: 验证状态
    const debugInfo = await page.evaluate(({ msgId }) => {
      const pivoStore = (window as any).__pivoStore;
      const chatStore = (window as any).__chatStore;
      return {
        hasTaskTree: !!pivoStore.getState().taskTrees[msgId],
        activeMessageId: pivoStore.getState().activeMessageId,
        taskTree: pivoStore.getState().taskTrees[msgId],
        messageCount: chatStore.getState().messages.length,
        lastMessageId: chatStore.getState().messages[chatStore.getState().messages.length - 1]?.id
      };
    }, { msgId: messageId });

    console.log('[Integration] Store state after injection:', debugInfo);

    // 等待 UI 更新
    await page.waitForTimeout(1000);

    // 验证 UI 渲染
    // 使用模糊定位适配 CSS Modules
    const taskContainer = page.locator('div:has(> span:text("初始化组件结构"))').locator('..').locator('..');
    await expect(page.locator('text=初始化组件结构')).toBeVisible();
    await expect(page.locator('text=实现核心业务逻辑')).toBeVisible();
    
    // 验证运行中状态（旋转图标）
    const spinner = page.locator('.animate-spin');
    await expect(spinner).toBeVisible();

    // 🚀 2. 模拟后端状态更新事件并验证 UI 响应
    console.log('[Integration] Simulating task status update...');
    await page.evaluate(({ msgId }) => {
        const pivoStore = (window as any).__pivoStore;
        // 将“实现核心业务逻辑”标记为成功
        pivoStore.getState().updateTaskStatus(msgId, "task-impl", "success");
    }, { msgId: messageId });

    // 验证 UI 同步：应显示删除线（line-through）
    const completedTask = page.locator('text=实现核心业务逻辑');
    await expect(completedTask).toHaveClass(/line-through/);
    
    // 🚀 3. 验证嵌套任务
    await expect(page.locator('text=添加 API 挂钩')).toBeVisible();
    
    console.log('[Integration] ✅ PIVO Task Breakdown UI/Store sync verified successfully.');
  });
});
