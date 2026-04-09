/**
 * 工作流流式输出 - 红绿测试
 *
 * 🎯 测试目标：
 * - ✅ 绿测试：验证工作流成功执行（当前通过）
 * - ❌ 红测试：验证流式进度输出（当前失败/缺失）
 * - ⚡ 性能测试：验证执行时间 < 20秒
 *
 * 📋 测试场景：
 * 1. 用户执行 /explore 命令
 * 2. 工作流开始执行
 * 3. 【绿】工作流完成并显示结果
 * 4. 【红】实时显示执行进度
 * 5. 【绿】执行时间在可接受范围内
 *
 * 🔧 运行方式：
 * ```bash
 * npm run test:e2e -- tests/e2e/workflow/workflow-streaming-red-green.spec.ts
 * ```
 *
 * @see tests/e2e/CODING_STANDARDS.md
 * @see tests/e2e/workflow/README.md
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('工作流流式输出 - 红绿测试', () => {
  test.beforeEach(async ({ page }) => {
    // 🔍 监听所有控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('workflow') ||
          text.includes('Workflow') ||
          text.includes('[E2E]') ||
          text.includes('[StoreMapper]') ||
          text.includes('[WorkflowIntentHandler]')) {
        console.log(`[Browser Console ${msg.type()}]`, text);
      }
    });

    // 🔍 监听所有 Tauri 事件
    page.on('tauri:event', (event) => {
      console.log('[Tauri Event]', event.event, event.payload);
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 🔥 打开聊天面板（通过点击按钮而不是直接调用 store）
    const chatToggle = page.locator('button').filter({ hasText: /IfAI Chat|Toggle IfAI Chat/i }).or(
      page.locator('[data-testid="chat-toggle"]')
    ).or(
      page.locator('text=/Toggle IfAI Chat/')
    ).first();

    // 尝试点击聊天切换按钮
    try {
      await chatToggle.click({ timeout: 5000 });
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log('[E2E] ⚠️ 聊天切换按钮未找到，尝试其他方式');
      // 备用方案：使用快捷键
      await page.keyboard.press('Meta+l');
      await page.waitForTimeout(1000);
    }

    // 🔥 确认聊天面板已打开
    const chatPanel = page.locator('[data-testid="chat-panel"], .chat-panel, [class*="chat"]').or(
      page.locator('aside').filter({ hasText: /IfAI|Chat/i })
    ).first();

    // 等待聊天面板可见
    try {
      await chatPanel.waitFor({ state: 'visible', timeout: 5000 });
      console.log('[E2E] ✅ 聊天面板已打开');
    } catch (e) {
      console.log('[E2E] ⚠️ 聊天面板可能未打开，继续测试');
    }
  });

  /**
   * ✅ 绿测试 #1：工作流成功执行
   *
   * 验证点：
   * 1. 工作流启动
   * 2. 工作流完成
   * 3. 显示正确的结果
   * 4. 包含执行时间
   */
  test('✅ GREEN: 工作流成功执行并显示结果', async ({ page }) => {
    console.log('[E2E] 🟢 绿测试：工作流成功执行');

    // Given: 用户在聊天中
    const startTime = Date.now();

    // When: 发送 /explore 命令（通过 chatStore 而不是 UI）
    console.log('[E2E] 📤 发送 /explore 命令');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    // 等待消息发送
    await page.waitForTimeout(1000);

    // Then: 等待工作流完成
    console.log('[E2E] ⏳ 等待工作流完成...');

    // 🔍 验证：工作流完成消息出现
    const completionMessage = page.locator('text=/工作流执行完成/').or(
      page.locator('text=/✅.*completed/')
    );

    // ⏱️ 超时时间：60秒（工作流执行需要时间）
    await expect(completionMessage, {
      timeout: 60000
    }).toBeVisible({ timeout: 60000 });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`[E2E] ⏱️ 总耗时: ${duration}秒`);

    // 🔍 验证：显示执行时间
    const durationText = page.locator('text=/执行时长/');
    await expect(durationText).toBeVisible();

    // 🔍 验证：显示节点结果
    const nodeResults = page.locator('text=/节点执行结果/');
    await expect(nodeResults).toBeVisible();

    // 🔍 验证：包含探索节点
    const exploreNode = page.locator('text=/explore/');
    await expect(exploreNode).toBeVisible();

    // 🔍 验证：状态为 completed
    const completedStatus = page.locator('text=/completed/').or(
      page.locator('text=/✅/')
    );
    await expect(completedStatus).toBeVisible();

    console.log('[E2E] ✅ 绿测试通过：工作流成功执行');
  });

  /**
   * ❌ 红测试 #1：实时进度显示
   *
   * 验证点：
   * 1. 工作流启动后显示"正在执行..."
   * 2. 显示节点开始执行的提示
   * 3. 进度实时更新（而不是一次性显示）
   *
   * 🚨 当前状态：FAIL
   * 原因：流式进度输出尚未实现或未正确连接到 UI
   */
  test('❌ RED: 实时显示工作流执行进度', async ({ page }) => {
    console.log('[E2E] 🔴 红测试：实时进度显示');

    // Given: 用户在聊天中
    const progressUpdates: string[] = [];

    // 🔍 监听消息变化
    await page.evaluate(() => {
      const checkProgress = () => {
        const messages = (window as any).__chatStore?.getState()?.messages || [];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.content) {
          return lastMessage.content;
        }
        return '';
      };

      // 每 100ms 检查一次进度
      (window as any).__e2e_progress_checker = setInterval(() => {
        const content = checkProgress();
        if (content && (content.includes('🔄') || content.includes('执行中'))) {
          console.log('[E2E] 📊 检测到进度更新:', content.substring(-100));
        }
      }, 100);
    });

    // When: 发送 /explore 命令（通过 chatStore 而不是 UI）
    console.log('[E2E] 📤 发送 /explore 命令');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    // 等待消息发送
    await page.waitForTimeout(1000);

    // 🔍 验证：在 5 秒内应该看到进度提示
    console.log('[E2E] ⏳ 等待进度提示...');

    try {
      // 🚨 这个断言预期失败（红测试）
      const progressIndicator = page.locator('text=/🔄.*执行中/').or(
        page.locator('text=/正在执行/')
      ).or(
        page.locator('text=/开始执行节点/')
      );

      await expect(progressIndicator, {
        timeout: 5000
      }).toBeVisible({ timeout: 5000 });

      console.log('[E2E] ✅ 进度提示已显示');
    } catch (error) {
      console.log('[E2E] ❌ 红测试失败：未看到进度提示');
      console.log('[E2E] 💡 需要实现：workflow:progress 事件监听和 UI 更新');
      throw error;
    }

    // 清理
    await page.evaluate(() => {
      if ((window as any).__e2e_progress_checker) {
        clearInterval((window as any).__e2e_progress_checker);
      }
    });
  });

  /**
   * ✅ 绿测试 #2：性能基准测试
   *
   * 验证点：
   * 1. 工作流在合理时间内完成
   * 2. 基准：< 20 秒（优化后的目标）
   *
   * 基准历史：
   * - v0.4.0 初始: 79.79秒
   * - 移除延迟后: 62.86秒
   * - 合并节点后: 29.44秒
   * - 优化提示词后: 16.65秒 ✅
   */
  test('✅ GREEN: 性能基准 - 执行时间 < 20秒', async ({ page }) => {
    console.log('[E2E] 🟢 绿测试：性能基准');

    const startTime = Date.now();

    // When: 执行 /explore
    console.log('[E2E] 📤 发送 /explore 命令');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    // 等待消息发送
    await page.waitForTimeout(1000);

    // Then: 等待完成
    const completionMessage = page.locator('text=/工作流执行完成/');
    await expect(completionMessage, {
      timeout: 60000
    }).toBeVisible({ timeout: 60000 });

    const endTime = Date.now();
    const durationSeconds = (endTime - startTime) / 1000;

    console.log(`[E2E] ⏱️ 执行时间: ${durationSeconds.toFixed(2)}秒`);

    // 🔍 验证：执行时间 < 20秒
    expect(durationSeconds).toBeLessThan(20);

    console.log('[E2E] ✅ 绿测试通过：性能达标');
  });

  /**
   * ✅ 绿测试 #3：结果显示完整性
   *
   * 验证点：
   * 1. 显示工作流 ID
   * 2. 显示执行状态
   * 3. 显示执行时长
   * 4. 显示每个节点的详细结果
   * 5. 包含探索输出的内容
   */
  test('✅ GREEN: 结果显示包含完整信息', async ({ page }) => {
    console.log('[E2E] 🟢 绿测试：结果显示完整性');

    // When: 执行 /explore
    console.log('[E2E] 📤 发送 /explore 命令');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    // 等待消息发送
    await page.waitForTimeout(1000);

    // Then: 等待完成
    const completionMessage = page.locator('text=/工作流执行完成/');
    await expect(completionMessage, {
      timeout: 60000
    }).toBeVisible({ timeout: 60000 });

    // 🔍 验证：包含工作流 ID
    const workflowId = page.locator('text=/工作流 ID/');
    await expect(workflowId).toBeVisible();

    // 🔍 验证：包含状态
    const statusText = page.locator('text=/状态:/');
    await expect(statusText).toBeVisible();

    // 🔍 验证：包含节点结果
    const nodeResults = page.locator('text=/节点执行结果/');
    await expect(nodeResults).toBeVisible();

    // 🔍 验证：包含实际输出内容（探索结果）
    const outputContent = page.locator('text=/项目概述/').or(
      page.locator('text=/技术栈/').or(
        page.locator('text=/目录结构/')
      )
    );
    await expect(outputContent).toBeVisible();

    console.log('[E2E] ✅ 绿测试通过：结果显示完整');
  });

  /**
   * 🐛 调试辅助：捕获所有工作流相关事件
   *
   * 这个测试用于调试，帮助理解工作流执行过程中的事件流
   */
  test('🐛 DEBUG: 捕获完整的工作流事件流', async ({ page }) => {
    console.log('[E2E] 🐛 调试模式：捕获事件流');

    const events: any[] = [];

    // 🔍 监听所有 store 事件
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('workflow') || text.includes('Workflow')) {
        events.push({
          type: 'console',
          text,
          timestamp: Date.now()
        });
      }
    });

    // When: 执行 /explore
    console.log('[E2E] 📤 发送 /explore 命令');
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage('/explore');
      }
    });

    // 等待消息发送
    await page.waitForTimeout(1000);

    // 等待完成
    const completionMessage = page.locator('text=/工作流执行完成/');
    await expect(completionMessage, {
      timeout: 60000
    }).toBeVisible({ timeout: 60000 });

    // 打印所有捕获的事件
    console.log('[E2E] 📋 捕获的事件流:');
    events.forEach((event, index) => {
      console.log(`  [${index + 1}] ${event.timestamp} - ${event.type}: ${event.text.substring(0, 100)}`);
    });

    console.log(`[E2E] 📊 总事件数: ${events.length}`);

    // 分析事件流
    const hasProgressEvent = events.some(e =>
      e.text.includes('progress') || e.text.includes('进度')
    );
    const hasCompletedEvent = events.some(e =>
      e.text.includes('completed') || e.text.includes('完成')
    );

    console.log('[E2E] 📊 事件分析:');
    console.log(`  - 包含进度事件: ${hasProgressEvent ? '✅' : '❌'}`);
    console.log(`  - 包含完成事件: ${hasCompletedEvent ? '✅' : '❌'}`);

    if (!hasProgressEvent) {
      console.log('[E2E] 💡 提示：未检测到进度事件，需要实现 workflow:progress 事件处理');
    }
  });
});

/**
 * 📋 测试清单
 *
 * ✅ 绿测试（应该通过）：
 *   - [x] 工作流成功执行
 *   - [x] 显示执行结果
 *   - [x] 性能基准 < 20秒
 *   - [x] 结果显示完整
 *
 * ❌ 红测试（预期失败，待修复）：
 *   - [ ] 实时进度显示
 *
 * 🔧 待实现功能：
 *   1. workflow:progress 事件监听（WorkflowIntentHandler.ts）
 *   2. 进度事件转发到 chatEventBus
 *   3. StoreMapper 处理进度事件
 *   4. UI 实时更新消息内容
 *
 * 📊 性能基准历史：
 *   - v0.4.0 初始: 79.79秒 ❌
 *   - v0.4.0 优化: 16.65秒 ✅
 */
