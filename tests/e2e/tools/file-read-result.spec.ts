import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

/**
 * E2E 测试：文件读取工具结果应该包含实际文件内容
 *
 * 问题描述：
 * - agent_read_file 工具执行成功，但 tool 消息只显示"读取成功"
 * - LLM 无法看到文件内容，导致分析失败
 *
 * 期望行为：
 * - tool 消息应该包含实际的文件内容
 * - 文件内容应该被正确传递给 LLM
 */

test.beforeEach(async ({ page }) => {
  // 设置控制台监听
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      console.log('[Browser Error]', text);
    } else if (text.includes('[E2E]') || text.includes('[Chat]') || text.includes('[useChatStore]')) {
      console.log('[Browser]', text);
    }
  });

  // 使用标准的 E2E 测试环境设置
  await setupE2ETestEnvironment(page);
  await page.goto('/');
  await page.waitForTimeout(5000);

  // 确保聊天面板打开
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

test.describe('File Read Tool - Content Display', () => {

  test('agent_read_file 工具消息应该包含实际文件内容', async ({ page }) => {
    const testFileName = 'test-read.txt';
    const testFileContent = 'Hello, this is test content for file reading!';

    // 1. 在内存文件系统中创建测试文件
    await page.evaluate(({ fileName, content }) => {
      const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      if (mockFileSystem) {
        const filePath = `/Users/mac/mock-project/${fileName}`;
        mockFileSystem.set(filePath, content);
        console.log('[E2E] Test file created:', filePath);
      }
    }, { fileName: testFileName, content: testFileContent });

    // 2. 添加包含文件读取工具调用的消息
    await page.evaluate(({ fileName }) => {
      const chatStore = (window as any).__chatStore?.getState();
      console.log('[E2E] Adding message with agent_read_file tool call');
      chatStore.addMessage({
        id: 'msg-read-test',
        role: 'assistant',
        content: '我会读取一个文件',
        toolCalls: [{
          id: 'read-call-1',
          tool: 'agent_read_file',
          args: { rel_path: fileName },
          status: 'pending'
        }]
      });

      const newState = (window as any).__chatStore?.getState();
      console.log('[E2E] Message added, current messages:', newState?.messages?.length);
    }, { fileName: testFileName });

    // 等待 UI 更新 - ToolApproval 组件需要时间渲染
    await page.waitForTimeout(2000);

    // 3. 批准执行
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 4. 验证工具调用状态变为 completed
    const toolCallStatus = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const msg = chatStore?.messages.find((m: any) => m.id === 'msg-read-test');
      return msg?.toolCalls?.[0]?.status;
    });
    expect(toolCallStatus).toBe('completed');

    // 5. 🔥 关键验证：tool 消息应该包含文件内容
    const toolMessageContent = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const toolMsg = chatStore?.messages.find((m: any) =>
        m.tool_call_id === 'read-call-1' && m.role === 'tool'
      );
      return toolMsg?.content;
    });

    console.log('[E2E] Tool message content:', toolMessageContent);
    console.log('[E2E] Tool message length:', toolMessageContent?.length);

    // 6. 验证 tool 消息包含文件内容
    expect(toolMessageContent).toBeTruthy();
    expect(toolMessageContent).toContain(testFileContent);
  });

  test('agent_read_file 应该读取多行文件内容', async ({ page }) => {
    const testFileName = 'multiline-test.md';
    const testFileContent = `# Title

This is a multiline file.

Line 1: Some content
Line 2: More content
Line 3: Even more content

End of file.
`;

    // 创建多行测试文件
    await page.evaluate(({ fileName, content }) => {
      const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      if (mockFileSystem) {
        const filePath = `/Users/mac/mock-project/${fileName}`;
        mockFileSystem.set(filePath, content);
        console.log('[E2E] Multiline file created:', filePath);
      }
    }, { fileName: testFileName, content: testFileContent });

    // 添加文件读取请求
    await page.evaluate(({ fileName }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-multiline',
        role: 'assistant',
        content: '读取多行文件',
        toolCalls: [{
          id: 'read-multiline',
          tool: 'agent_read_file',
          args: { rel_path: fileName },
          status: 'pending'
        }]
      });
      console.log('[E2E] Multiline file message added');
    }, { fileName: testFileName });

    // 批准执行
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 验证 tool 消息包含完整的多行内容
    const toolMessageContent = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const toolMsg = chatStore?.messages.find((m: any) =>
        m.tool_call_id === 'read-multiline' && m.role === 'tool'
      );
      return toolMsg?.content;
    });

    console.log('[E2E] Multiline file content length:', toolMessageContent?.length);
    console.log('[E2E] Content preview:', toolMessageContent?.substring(0, 100));

    expect(toolMessageContent).toBeTruthy();
    expect(toolMessageContent).toContain('# Title');
    expect(toolMessageContent).toContain('Line 1: Some content');
    expect(toolMessageContent).toContain('End of file');
  });

  test('agent_read_file 对于空文件应该返回空字符串', async ({ page }) => {
    const testFileName = 'empty-file.txt';

    // 创建空文件
    await page.evaluate(({ fileName }) => {
      const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      if (mockFileSystem) {
        const filePath = `/Users/mac/mock-project/${fileName}`;
        mockFileSystem.set(filePath, '');
        console.log('[E2E] Empty file created:', filePath);
      }
    }, { fileName: testFileName });

    // 添加文件读取请求
    await page.evaluate(({ fileName }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-empty',
        role: 'assistant',
        content: '读取空文件',
        toolCalls: [{
          id: 'read-empty',
          tool: 'agent_read_file',
          args: { rel_path: fileName },
          status: 'pending'
        }]
      });
      console.log('[E2E] Empty file message added');
    }, { fileName: testFileName });

    // 批准执行
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 验证 tool 消息内容（空文件应该返回空字符串）
    const toolMessageContent = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const toolMsg = chatStore?.messages.find((m: any) =>
        m.tool_call_id === 'read-empty' && m.role === 'tool'
      );
      return toolMsg?.content;
    });

    console.log('[E2E] Empty file content:', toolMessageContent);
    console.log('[E2E] Content length:', toolMessageContent?.length);

    expect(toolMessageContent).toBeDefined();
    // 空文件应该返回空字符串或非常短的提示消息
    expect(toolMessageContent.length).toBeLessThan(100);
  });

  test('agent_read_file 读取大文件时应该截断内容', async ({ page }) => {
    const testFileName = 'large-file.txt';
    // 创建一个超过 50KB 的文件内容
    const largeContent = 'x'.repeat(60000); // 60KB

    // 创建大文件
    await page.evaluate(({ fileName, content }) => {
      const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      if (mockFileSystem) {
        const filePath = `/Users/mac/mock-project/${fileName}`;
        mockFileSystem.set(filePath, content);
        console.log('[E2E] Large file created:', filePath, 'size:', content.length);
      }
    }, { fileName: testFileName, content: largeContent });

    // 添加文件读取请求
    await page.evaluate(({ fileName }) => {
      const chatStore = (window as any).__chatStore?.getState();
      chatStore.addMessage({
        id: 'msg-large',
        role: 'assistant',
        content: '读取大文件',
        toolCalls: [{
          id: 'read-large',
          tool: 'agent_read_file',
          args: { rel_path: fileName },
          status: 'pending'
        }]
      });
      console.log('[E2E] Large file message added');
    }, { fileName: testFileName });

    // 批准执行
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 验证 tool 消息内容
    const toolMessageContent = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const toolMsg = chatStore?.messages.find((m: any) =>
        m.tool_call_id === 'read-large' && m.role === 'tool'
      );
      return toolMsg?.content;
    });

    console.log('[E2E] Large file - original size:', largeContent.length);
    console.log('[E2E] Large file - tool message length:', toolMessageContent?.length);

    expect(toolMessageContent).toBeTruthy();
    // 应该被截断到大约 50KB
    expect(toolMessageContent.length).toBeLessThan(largeContent.length);
    expect(toolMessageContent.length).toBeGreaterThan(50000);
    // 应该包含截断提示
    expect(toolMessageContent).toContain('省略剩余');
  });

  test('LLM 应该能够基于文件内容回答问题', async ({ page }) => {
    const testFileName = 'project-info.md';
    const testFileContent = `# Project Information

Name: Test Project
Version: 1.0.0
Description: This is a test project for E2E testing.

Features:
- Feature 1: Testing
- Feature 2: Development
- Feature 3: Deployment

Tech Stack:
- Frontend: React
- Backend: Rust
- Database: SQLite
`;

    // 创建项目信息文件
    await page.evaluate(({ fileName, content }) => {
      const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
      if (mockFileSystem) {
        const filePath = `/Users/mac/mock-project/${fileName}`;
        mockFileSystem.set(filePath, content);
        console.log('[E2E] Project info file created:', filePath);
      }
    }, { fileName: testFileName, content: testFileContent });

    // 添加消息：询问项目信息
    await page.evaluate(({ fileName }) => {
      const chatStore = (window as any).__chatStore?.getState();

      // 用户消息
      chatStore.addMessage({
        id: 'msg-user-query',
        role: 'user',
        content: `${fileName} 中描述了哪些功能？`
      });

      // AI 助手响应（包含文件读取工具调用）
      chatStore.addMessage({
        id: 'msg-assistant-response',
        role: 'assistant',
        content: '我来读取文件并回答您的问题',
        toolCalls: [{
          id: 'read-project-info',
          tool: 'agent_read_file',
          args: { rel_path: fileName },
          status: 'pending'
        }]
      });
      console.log('[E2E] Project info messages added');
    }, { fileName: testFileName });

    // 批准执行
    await removeJoyrideOverlay(page);
    await page.locator('button:has-text("批准执行")').first().click();
    await page.waitForTimeout(2000);

    // 验证 tool 消息包含文件内容
    const toolMessageContent = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const toolMsg = chatStore?.messages.find((m: any) =>
        m.tool_call_id === 'read-project-info' && m.role === 'tool'
      );
      return toolMsg?.content;
    });

    console.log('[E2E] Tool message for LLM analysis:', toolMessageContent?.substring(0, 200));

    // 验证 LLM 能够看到文件内容中的关键信息
    expect(toolMessageContent).toBeTruthy();
    expect(toolMessageContent).toContain('Features:');
    expect(toolMessageContent).toContain('Feature 1: Testing');
    expect(toolMessageContent).toContain('Tech Stack:');
    expect(toolMessageContent).toContain('React');
  });

});
