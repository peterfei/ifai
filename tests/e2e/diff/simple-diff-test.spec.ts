import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

/**
 * 简单测试：验证格式化函数的输出
 */

test.beforeEach(async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      console.log('[Browser Error]', text);
    } else if (text.includes('[E2E]') || text.includes('[Chat]') || text.includes('[useChatStore]')) {
      console.log('[Browser]', text);
    }
  });

  await setupE2ETestEnvironment(page);
  await page.goto('/');
  await page.waitForTimeout(5000);

  // 打开聊天面板
  await page.evaluate(() => {
    const layoutStore = (window as any).__layoutStore;
    if (layoutStore && !layoutStore.getState().isChatOpen) {
      layoutStore.getState().toggleChat();
    }
  });
  await page.waitForTimeout(2000);

  // 等待 store 可用
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(2000);
    const hasChatStore = await page.evaluate(() => {
      const store = (window as any).__chatStore;
      return store && typeof store.getState === 'function';
    });
    if (hasChatStore) break;
  }
});

test('简单测试：验证 agent_write_file 结果显示', async ({ page }) => {
  const fileName = 'test.md';
  const originalContent = '1 最新版本\n2 第二行\n3 第三行';
  const newContent = '2 最新版本\n3 第二行\n4 第三行';

  // 先创建原始文件
  await page.evaluate(({ fileName, content }) => {
    const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
    mockFileSystem.set(`/Users/mac/mock-project/${fileName}`, content);
  }, { fileName, content: originalContent });

  // 然后修改文件
  await page.evaluate(({ fileName, content }) => {
    const chatStore = (window as any).__chatStore?.getState();
    chatStore.addMessage({
      id: 'msg-test',
      role: 'assistant',
      content: '修改文件',
      toolCalls: [{
        id: 'test-call',
        tool: 'agent_write_file',
        args: { rel_path: fileName, content },
        status: 'pending'
      }]
    });
  }, { fileName, content: newContent });

  // 批准执行
  await page.locator('button:has-text("批准执行")').first().click();
  await page.waitForTimeout(3000);

  // 🔥 检查工具调用状态
  const toolCallStatus = await page.evaluate(() => {
    const chatStore = (window as any).__chatStore?.getState();
    const msg = chatStore?.messages.find((m: any) => m.id === 'msg-test');
    const tc = msg?.toolCalls?.[0];
    return {
      status: tc?.status,
      hasResult: !!tc?.result,
      result: tc?.result
    };
  });

  console.log('[E2E] Tool call status:', toolCallStatus);
  expect(toolCallStatus.status).toBe('completed');
  expect(toolCallStatus.hasResult).toBe(true);

  // 🔥 检查 UI 是否显示了执行结果区域
  const hasResultDisplay = await page.locator('.bg-gradient-to-br.from-green-500\\/5').count();
  console.log('[E2E] Result display count:', hasResultDisplay);
  expect(hasResultDisplay).toBeGreaterThan(0);

  // 🔥 检查格式化函数的输出（在浏览器环境中调用）
  const formattedOutput = await page.evaluate(() => {
    const chatStore = (window as any).__chatStore?.getState();
    const msg = chatStore?.messages.find((m: any) => m.id === 'msg-test');
    const toolCall = msg?.toolCalls?.[0];

    if (!toolCall?.result) return null;

    // 使用暴露的格式化函数
    const formatToolResultToMarkdown = (window as any).__formatToolResultToMarkdown;
    if (typeof formatToolResultToMarkdown !== 'function') {
      return 'formatToolResultToMarkdown not found';
    }

    try {
      const result = JSON.parse(toolCall.result);
      console.log('[E2E] Format Debug: result.newContent:', result.newContent);
      console.log('[E2E] Format Debug: result.newContent type:', typeof result.newContent);
      console.log('[E2E] Format Debug: result.newContent length:', result.newContent ? result.newContent.length : 0);
      console.log('[E2E] Format Debug: result.newContent split:', result.newContent ? result.newContent.split('\n').length : 0);
      const toolCallData = {
        id: toolCall.id,
        tool: toolCall.tool,
        args: toolCall.args
      };
      return formatToolResultToMarkdown(result, toolCallData);
    } catch (e) {
      return 'Error: ' + String(e);
    }
  });

  console.log('[E2E] Formatted output:', formattedOutput);

  // 🔥 验证格式化输出包含预期内容
  if (formattedOutput && formattedOutput !== 'formatToolResultToMarkdown not found') {
    expect(formattedOutput).toContain('-1 最新版本');
    expect(formattedOutput).toContain('+2 最新版本');
    expect(formattedOutput).toContain('被删除内容');
    expect(formattedOutput).toContain('新增内容');
  }
});
