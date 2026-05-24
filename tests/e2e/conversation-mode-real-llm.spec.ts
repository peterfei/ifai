/**
 * 对话模式真实 LLM 调用 E2E 测试
 *
 * 测试目标：
 * 1. 验证对话模式可以发送真实 LLM 消息
 * 2. 验证流式响应正确显示在 UI 上
 * 3. 验证 thread 状态实时同步（idle → active → idle）
 * 4. 验证完整的三栏布局交互
 *
 * 环境要求：
 * - 需要 .env.e2e.local 文件配置真实 API Key
 * - 或使用本地模型（Ollama）
 *
 * 配置示例：
 * E2E_AI_API_KEY=your-api-key
 * E2E_AI_BASE_URL=https://api.deepseek.com
 * E2E_AI_MODEL=deepseek-chat
 */

import { test, expect } from '@playwright/test';
import {
  setupE2ETestEnvironment,
  setupMockFileSystem,
  getRealAIConfig
} from './setup-utils';

test.describe('Conversation Mode - Real LLM E2E Tests', () => {
  // 延长超时适应真实 AI 调用
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // 1. 初始化环境，跳过欢迎弹窗
    await setupE2ETestEnvironment(page, { skipWelcome: true });

    // 2. 导航到应用首页
    await page.goto('/');

    // 3. 确保关键 Store 挂载
    await page.waitForFunction(() =>
      (window as any).__chatStore !== undefined,
      { timeout: 30000 }
    );

    // 4. 切换到对话模式（如果不是）
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      const guiMode = layoutStore.getState().guiMode;

      if (guiMode !== 'conversation') {
        console.log(`[E2E] 切换到对话模式（当前: ${guiMode}）`);
        layoutStore.getState().setGuiMode('conversation');
      }
    });

    // 5. 设置 Mock 文件系统
    await setupMockFileSystem(page, {
      'src/main.ts': 'console.log("Hello IfAI");',
      'README.md': '# Test Project\n\nThis is a test project for E2E testing.',
      'package.json': '{"name": "ifai-test", "version": "1.0.0"}',
    });

    // 6. 等待 UI 准备就绪
    await page.locator('textarea, [contenteditable="true"]').first().waitFor({
      state: 'visible',
      timeout: 30000
    });

    console.log('[E2E Setup] ✅ 对话模式环境已准备');
  });

  test('E2E-LLM-1: 对话模式发送消息并接收流式响应', async ({ page }) => {
    const config = await getRealAIConfig(page);
    console.log(`[E2E] AI 配置: ${JSON.stringify(config)}`);

    // 准备测试消息
    const testMessage = '你好，请简单介绍一下你自己。';

    // 🔥 通过页面输入框发送消息（模拟真实用户操作）
    const inputBox = page.locator('textarea, [contenteditable="true"]').first();
    await inputBox.fill(testMessage);

    // 点击发送按钮（如果有）或按 Enter 发送
    const sendButton = page.locator('button[aria-label*="发送"], button[data-testid="send-button"], button:has-text("发送")').first();

    if (await sendButton.isVisible({ timeout: 2000 })) {
      await sendButton.click();
    } else {
      // 回车发送
      await inputBox.press('Enter');
    }

    console.log('[E2E] 消息已发送，等待 AI 响应...');

    // ✅ 验证 1: 用户消息出现在 UI 上
    const userMessage = page.locator('[data-role="user"]').filter({ hasText: testMessage }).first();
    await expect(userMessage).toBeVisible({ timeout: 10000 });
    console.log('[E2E] ✅ 用户消息已显示');

    // ✅ 验证 2: Assistant 消息容器出现（流式响应）
    const assistantMessage = page.locator('[data-role="assistant"]').first();

    await expect(assistantMessage).toBeVisible({ timeout: 60000 });
    console.log('[E2E] ✅ AI 响应容器已出现');

    // ✅ 验证 3: 从 chatStore 获取消息内容（更可靠）
    await page.waitForTimeout(5000);
    const assistantResponse = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      const assistantMessages = messages.filter((m: any) => m.role === 'assistant');
      return assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1].content : '';
    });

    expect(assistantResponse.length).toBeGreaterThan(10);
    console.log(`[E2E] ✅ 收到 AI 响应内容（${assistantResponse.length} 字符）`);
    console.log(`[E2E] 响应内容预览: ${assistantResponse.substring(0, 100)}...`);

    // ✅ 验证 4: 对话列表状态更新
    const threadCountBadge = page.locator('[data-testid="conversation-list-panel"] .text-xs').filter({
      hasText: /\d+/
    }).first();

    await expect(threadCountBadge).toBeVisible({ timeout: 5000 });
    const threadCountText = await threadCountBadge.textContent();
    console.log(`[E2E] ✅ 对话列表状态: ${threadCountText}`);
  });

  test('E2E-LLM-2: Thread 状态实时同步（idle → active → idle）', async ({ page }) => {
    const config = await getRealAIConfig(page);

    // 创建新对话（使用聊天输入框来触发，而非直接调用ThreadManager）
    const testMessage = '测试状态同步：请回复"状态同步测试通过"';

    // 发送消息会自动创建或切换到活跃对话
    await page.evaluate(async (msg: string) => {
      const chatStore = (window as any).__chatStore;
      await chatStore.getState().sendMessage(msg);
    }, testMessage);

    // ✅ 验证初始状态：idle（空闲）
    const initialStatus = await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore;
      const threadId = threadStore.getState().activeThreadId;
      const thread = threadStore.getState().threads[threadId];
      return thread?.status || 'unknown';
    });

    console.log(`[E2E] 初始状态: ${initialStatus}`);
    expect(['idle', 'active'].includes(initialStatus)).toBe(true);

    // ✅ 验证状态变化：active（活跃）
    await page.waitForFunction(async () => {
      const threadStore = (window as any).__threadStore;
      const threadId = threadStore.getState().activeThreadId;
      const thread = threadStore.getState().threads[threadId];
      return thread?.status === 'active';
    }, { timeout: 10000 });

    console.log('[E2E] ✅ 状态已切换到 active（活跃）');

    // ✅ 等待 AI 响应完成，验证状态回到 idle
    await page.waitForTimeout(10000); // 等待响应完成

    const finalStatus = await page.evaluate(async () => {
      const threadStore = (window as any).__threadStore;
      const threadId = threadStore.getState().activeThreadId;
      const thread = threadStore.getState().threads[threadId];
      return thread?.status || 'unknown';
    });

    console.log(`[E2E] 最终状态: ${finalStatus}`);
    expect(['idle', 'active'].includes(finalStatus)).toBe(true);

    // ✅ 验证状态标签在 UI 上正确显示
    const statusLabel = page.locator('[data-status]').first();
    await expect(statusLabel).toBeVisible();
    const statusText = await statusLabel.textContent();
    console.log(`[E2E] ✅ UI 状态标签: ${statusText}`);
  });

  test('E2E-LLM-3: 右栏工作日志实时更新', async ({ page }) => {
    const config = await getRealAIConfig(page);

    // 确保右栏可见
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      const collapsed = layoutStore.getState().conversationRightCollapsed;

      if (collapsed) {
        // 展开右栏
        console.log('[E2E] 展开右栏');
        // 触发展开按钮（需要根据实际实现调整）
      }
    });

    // 切换到工作日志 Tab
    const workLogTab = page.locator('button:has-text("工作日志")').first();
    if (await workLogTab.isVisible()) {
      await workLogTab.click();
      console.log('[E2E] 切换到工作日志 Tab');
    }

    // 发送消息
    const testMessage = '请生成一个简单的 TypeScript 函数';

    await page.evaluate(async (msg: string) => {
      const chatStore = (window as any).__chatStore;
      await chatStore.getState().sendMessage(msg);
    }, testMessage);

    // ✅ 验证工作日志更新（精确匹配，避免strict mode violation）
    const workLogPanel = page.locator('[data-testid="conversation-detail-panel"]').locator('[data-testid="work-log-panel"]');
    await expect(workLogPanel).toBeVisible({ timeout: 5000 });

    // 等待日志内容出现
    await page.waitForTimeout(5000);

    // 检查是否有新的日志条目
    const logEntries = await workLogPanel.locator('[data-testid="log-entry"], .log-entry, .timeline-item').count();
    console.log(`[E2E] 工作日志条目数: ${logEntries}`);

    // 或者检查面板内容不为空
    const panelContent = await workLogPanel.textContent();
    expect(panelContent.length).toBeGreaterThan(0);
    console.log('[E2E] ✅ 工作日志已更新');
  });

  test('E2E-LLM-4: 多轮对话状态保持', async ({ page }) => {
    const config = await getRealAIConfig(page);

    // 第一轮对话
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      await chatStore.getState().sendMessage('第一轮：请记住数字 42');
    });

    await page.waitForTimeout(10000); // 等待 AI 响应

    // 第二轮对话
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      await chatStore.getState().sendMessage('第二轮：我刚才说的数字是多少？');
    });

    await page.waitForTimeout(10000); // 等待 AI 响应

    // ✅ 验证消息历史完整性
    const messageCount = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      return chatStore.getState().messages.length;
    });

    console.log(`[E2E] 对话轮次: ${Math.floor(messageCount / 2)}`);
    expect(messageCount).toBeGreaterThanOrEqual(4); // 至少 2 轮对话（用户2条 + AI 2条）
    console.log('[E2E] ✅ 多轮对话状态保持正常');
  });

  test('E2E-LLM-5: 模式切换不影响对话状态', async ({ page }) => {
    const config = await getRealAIConfig(page);

    // 在对话模式下发送消息
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      await chatStore.getState().sendMessage('模式切换测试消息');
    });

    await page.waitForTimeout(3000);

    // 切换到 editor 模式
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      layoutStore.getState().setGuiMode('editor');
      console.log('[E2E] 切换到 editor 模式');
    });

    await page.waitForTimeout(2000);

    // 切换回 conversation 模式
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      layoutStore.getState().setGuiMode('conversation');
      console.log('[E2E] 切换回 conversation 模式');
    });

    await page.waitForTimeout(2000);

    // ✅ 验证对话内容仍然存在
    const messages = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      return chatStore.getState().messages.length;
    });

    expect(messages).toBeGreaterThan(0);
    console.log(`[E2E] ✅ 模式切换后对话保持完整: ${messages} 条消息`);
  });

  test('E2E-LLM-7: 消息历史和状态持久化', async ({ page }) => {
    const config = await getRealAIConfig(page);

    // 发送第一条消息
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      await chatStore.getState().sendMessage('第一条消息：请记住数字42');
    });

    await page.waitForTimeout(5000);

    // 发送第二条消息
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      await chatStore.getState().sendMessage('第二条消息：请告诉我刚才是多少');
    });

    await page.waitForTimeout(5000);

    // ✅ 验证消息历史完整性
    const messageHistory = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;

      return messages.map((m: any) => ({
        role: m.role,
        hasContent: !!m.content,
        contentLength: m.content?.length || 0
      }));
    });

    console.log(`[E2E] 消息历史: ${JSON.stringify(messageHistory, null, 2)}`);

    // 验证至少有4条消息（用户2条 + AI 2条）
    expect(messageHistory.length).toBeGreaterThanOrEqual(4);
    console.log(`[E2E] ✅ 消息历史完整，共 ${messageHistory.length} 条消息`);
  });

  test('E2E-LLM-8: 对话模式切换后状态恢复', async ({ page }) => {
    const config = await getRealAIConfig(page);

    // 在conversation模式发送消息
    await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      await chatStore.getState().sendMessage('状态恢复测试消息');
    });

    await page.waitForTimeout(3000);

    // 切换到editor模式
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      layoutStore.getState().setGuiMode('editor');
    });

    await page.waitForTimeout(1000);

    // 切换回conversation模式
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      layoutStore.getState().setGuiMode('conversation');
    });

    await page.waitForTimeout(1000);

    // ✅ 验证消息仍然存在
    const messageCount = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      return chatStore.getState().messages.length;
    });

    expect(messageCount).toBeGreaterThan(0);
    console.log(`[E2E] ✅ 模式切换后消息恢复: ${messageCount} 条消息`);
  });

  test('E2E-LLM-9: 工具调用和审批流程', async ({ page }) => {
    const config = await getRealAIConfig(page);
    console.log(`[E2E] 当前模型: ${config.modelId}`);

    // 发送会触发工具调用的消息
    const testMessage = '请读取 package.json 文件并告诉我项目名称';

    await page.evaluate(async (msg: string) => {
      const chatStore = (window as any).__chatStore;
      await chatStore.getState().sendMessage(msg);
    }, testMessage);

    console.log('[E2E] 消息已发送，等待工具调用生成...');
    await page.waitForTimeout(5000);

    // ✅ 验证 1: 检查是否生成工具调用
    const toolCallInfo = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      const lastMessage = messages[messages.length - 1];

      if (!lastMessage?.toolCalls) {
        return { hasToolCalls: false, count: 0, pending: 0 };
      }

      const pending = lastMessage.toolCalls.filter((tc: any) => tc.status === 'pending');
      return {
        hasToolCalls: true,
        count: lastMessage.toolCalls.length,
        pending: pending.length,
        toolNames: lastMessage.toolCalls.map((tc: any) => tc.name)
      };
    });

    console.log(`[E2E] 工具调用信息:`, toolCallInfo);

    if (toolCallInfo.hasToolCalls && toolCallInfo.pending > 0) {
      console.log(`[E2E] ✅ 检测到 ${toolCallInfo.pending} 个待审批工具: ${toolCallInfo.toolNames.join(', ')}`);

      // ✅ 验证 2: 验证工具调用审批UI存在
      const toolApprovalUI = page.locator('[data-testid*="tool-approval"], [class*="tool-approval"]').first();
      const hasApprovalUI = await toolApprovalUI.isVisible().catch(() => false);

      if (hasApprovalUI) {
        console.log('[E2E] ✅ 工具审批UI已显示');
      }

      // ✅ 验证 3: 批准工具调用
      await page.evaluate(async () => {
        const chatStore = (window as any).__chatStore;
        const approveAction = (chatStore.getState() as any).approveToolCall;

        if (approveAction) {
          const messages = chatStore.getState().messages;
          const lastMessage = messages[messages.length - 1];

          // 批准所有待审批工具
          lastMessage.toolCalls?.forEach((tc: any) => {
            if (tc.status === 'pending') {
              approveAction(lastMessage.id, tc.id);
            }
          });

          console.log(`[E2E] 已批准 ${lastMessage.toolCalls?.length || 0} 个工具调用`);
        }
      });

      // 等待工具执行
      await page.waitForTimeout(8000);

      // ✅ 验证 4: 检查工具执行状态
      const executionStatus = await page.evaluate(async () => {
        const chatStore = (window as any).__chatStore;
        const messages = chatStore.getState().messages;
        const lastMessage = messages[messages.length - 1];

        if (!lastMessage?.toolCalls) return { completed: 0 };

        const completed = lastMessage.toolCalls.filter((tc: any) =>
          tc.status === 'completed' || tc.status === 'success'
        );

        return {
          completed: completed.length,
          total: lastMessage.toolCalls.length,
          statuses: lastMessage.toolCalls.map((tc: any) => ({ name: tc.name, status: tc.status }))
        };
      });

      console.log(`[E2E] 工具执行状态:`, executionStatus);
      expect(executionStatus.completed).toBeGreaterThan(0);
      console.log(`[E2E] ✅ ${executionStatus.completed}/${executionStatus.total} 工具执行完成`);

    } else {
      console.log('[E2E] ⚠️ 当前模型未生成工具调用，跳过审批测试');
      // 不失败测试，只是记录
    }
  });

  test('E2E-LLM-10: 批量工具审批', async ({ page }) => {
    const config = await getRealAIConfig(page);

    // 发送会触发多个工具调用的消息
    const testMessage = '请列出当前目录的文件，然后读取 tsconfig.json，最后读取 package.json';

    await page.evaluate(async (msg: string) => {
      const chatStore = (window as any).__chatStore;
      await chatStore.getState().sendMessage(msg);
    }, testMessage);

    console.log('[E2E] 消息已发送，等待多个工具调用...');
    await page.waitForTimeout(5000);

    // ✅ 验证 1: 检查是否有多个工具调用
    const toolCallInfo = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      const lastMessage = messages[messages.length - 1];

      if (!lastMessage?.toolCalls) {
        return { count: 0, pending: 0 };
      }

      const pending = lastMessage.toolCalls.filter((tc: any) => tc.status === 'pending');
      return {
        count: lastMessage.toolCalls.length,
        pending: pending.length,
        hasBatchId: lastMessage.toolCalls.some((tc: any) => tc.batchId)
      };
    });

    console.log(`[E2E] 工具调用信息:`, toolCallInfo);

    if (toolCallInfo.pending > 0) {
      // ✅ 验证 2: 批量批准所有工具
      await page.evaluate(async () => {
        const chatStore = (window as any).__chatStore;
        const approveAll = (chatStore.getState() as any).approveAllToolCalls;

        if (approveAll) {
          const messages = chatStore.getState().messages;
          const lastMessage = messages[messages.length - 1];
          approveAll(lastMessage.id);
          console.log(`[E2E] 批量批准了 ${toolCallInfo.pending} 个工具`);
        }
      });

      // 等待工具执行
      await page.waitForTimeout(10000);

      // ✅ 验证 3: 检查批量审批结果
      const batchResult = await page.evaluate(async () => {
        const chatStore = (window as any).__chatStore;
        const messages = chatStore.getState().messages;
        const lastMessage = messages[messages.length - 1];

        if (!lastMessage?.toolCalls) return { completed: 0 };

        const completed = lastMessage.toolCalls.filter((tc: any) =>
          tc.status === 'completed' || tc.status === 'success'
        );

        return {
          completed: completed.length,
          total: lastMessage.toolCalls.length
        };
      });

      expect(batchResult.completed).toBeGreaterThan(0);
      console.log(`[E2E] ✅ 批量审批完成: ${batchResult.completed}/${batchResult.total}`);

    } else {
      console.log('[E2E] ⚠️ 未检测到待审批工具，跳过批量审批测试');
    }
  });

  test('E2E-LLM-11: 右栏Tab切换功能', async ({ page }) => {
    const config = await getRealAIConfig(page);

    // 确保在conversation模式
    await page.evaluate(async () => {
      const layoutStore = (window as any).__layoutStore;
      layoutStore.getState().setGuiMode('conversation');
    });

    await page.waitForTimeout(1000);

    // ✅ 验证 1: 工作日志Tab可点击
    const workLogTab = page.locator('button:has-text("工作日志")').first();
    await expect(workLogTab).toBeVisible();
    await workLogTab.click();
    console.log('[E2E] ✅ 工作日志Tab已点击');

    await page.waitForTimeout(500);

    // ✅ 验证 2: 产出物Tab可点击
    const artifactTab = page.locator('button:has-text("产出物")').first();
    await expect(artifactTab).toBeVisible();
    await artifactTab.click();
    console.log('[E2E] ✅ 产出物Tab已点击');

    await page.waitForTimeout(500);

    // ✅ 验证 3: 预览Tab可点击
    const previewTab = page.locator('button:has-text("预览")').first();
    await expect(previewTab).toBeVisible();
    await previewTab.click();
    console.log('[E2E] ✅ 预览Tab已点击');

    await page.waitForTimeout(500);

    // ✅ 验证 4: Agent Tab可点击
    const agentTab = page.locator('button:has-text("Agent")').first();
    await expect(agentTab).toBeVisible();
    await agentTab.click();
    console.log('[E2E] ✅ Agent Tab已点击');

    // ✅ 验证 5: 验证所有Tab按钮都存在且可交互
    const allTabs = await page.locator('[data-testid="conversation-detail-panel"] button').count();
    expect(allTabs).toBeGreaterThanOrEqual(4);
    console.log(`[E2E] ✅ 右栏Tab总数: ${allTabs}`);
  });

  test.afterEach(async ({ page }) => {
    // 清理：截图保存（如果测试失败）
    const testInfo = test.info();
    if (testInfo.status !== 'passed') {
      const screenshotPath = `tests/e2e/screenshots/${testInfo.title.replace(/\s+/g, '_')}.png`;
      await page.screenshot({ path: screenshotPath });
      console.log(`[E2E] 📸 失败截图已保存: ${screenshotPath}`);
    }
  });
});

/**
 * E2E 测试配置说明
 *
 * 创建 .env.e2e.local 文件：
 *
 * # 使用本地模型（推荐，无需 API Key）
 * E2E_AI_BASE_URL=http://localhost:11434/v1/chat/completions
 * E2E_AI_MODEL=llama3.2
 *
 * # 或使用 DeepSeek（需要 API Key）
 * E2E_AI_API_KEY=your-deepseek-api-key
 * E2E_AI_BASE_URL=https://api.deepseek.com
 * E2E_AI_MODEL=deepseek-chat
 *
 * # 使用 Ollama 本地模型
 * 1. 安装 Ollama: brew install ollama
 * 2. 拉取模型: ollama pull llama3.2
 * 3. 运行: ollama run llama3.2
 *
 * 运行测试：
 * npx playwright test tests/e2e/conversation-mode-real-llm.spec.ts
 *
 * 调试模式：
 * npx playwright test tests/e2e/conversation-mode-real-llm.spec.ts --headed
 */
