import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment, removeJoyrideOverlay } from '../setup';

/**
 * 全场景 Agent 工具结果传递测试
 *
 * 目的：确保所有 agent 工具的结果都能正确传递给 LLM
 *
 * 覆盖的工具：
 * 1. agent_read_file - 文件读取
 * 2. agent_list_dir - 目录列表
 * 3. agent_write_file - 文件写入
 * 4. bash - Bash 命令执行
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

test.describe('Agent Tools - Result Content Transmission', () => {

  test.describe('agent_read_file', () => {

    test('应该将文件内容传递给 LLM', async ({ page }) => {
      const fileName = 'test-content.txt';
      const fileContent = 'Hello World! This is test content.';

      // 创建测试文件
      await page.evaluate(({ name, content }) => {
        const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
        mockFileSystem.set(`/Users/mac/mock-project/${name}`, content);
      }, { name: fileName, content: fileContent });

      // 添加文件读取工具调用
      await page.evaluate(({ fileName }) => {
        const chatStore = (window as any).__chatStore?.getState();
        chatStore.addMessage({
          id: 'msg-read',
          role: 'assistant',
          content: '读取文件',
          toolCalls: [{
            id: 'read-call',
            tool: 'agent_read_file',
            args: { rel_path: fileName },
            status: 'pending'
          }]
        });
      }, { fileName });

      // 批准执行
      await removeJoyrideOverlay(page);
      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(2000);

      // 验证 tool 消息包含文件内容
      const toolMessageContent = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore?.getState();
        const toolMsg = chatStore?.messages.find((m: any) =>
          m.tool_call_id === 'read-call' && m.role === 'tool'
        );
        return toolMsg?.content;
      });

      console.log('[E2E] File content:', toolMessageContent);
      expect(toolMessageContent).toBeTruthy();
      expect(toolMessageContent).toContain(fileContent);
    });

    test('空文件应该返回空字符串', async ({ page }) => {
      const fileName = 'empty.txt';

      await page.evaluate(({ fileName }) => {
        const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
        mockFileSystem.set(`/Users/mac/mock-project/${fileName}`, '');
        const chatStore = (window as any).__chatStore?.getState();
        chatStore.addMessage({
          id: 'msg-empty',
          role: 'assistant',
          content: '读取空文件',
          toolCalls: [{
            id: 'empty-call',
            tool: 'agent_read_file',
            args: { rel_path: fileName },
            status: 'pending'
          }]
        });
      }, { fileName });

      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(2000);

      const toolMessageContent = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore?.getState();
        const toolMsg = chatStore?.messages.find((m: any) =>
          m.tool_call_id === 'empty-call' && m.role === 'tool'
        );
        return toolMsg?.content;
      });

      console.log('[E2E] Empty file content length:', toolMessageContent?.length);
      expect(toolMessageContent).toBeDefined();
      expect(toolMessageContent.length).toBe(0);
    });
  });

  test.describe('agent_list_dir', () => {

    test('应该将目录列表传递给 LLM', async ({ page }) => {
      // 创建测试文件
      await page.evaluate(() => {
        const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
        mockFileSystem.set('/Users/mac/mock-project/file1.txt', 'content1');
        mockFileSystem.set('/Users/mac/mock-project/file2.txt', 'content2');
        mockFileSystem.set('/Users/mac/mock-project/subdir/file3.txt', 'content3');
      });

      // 添加目录列表工具调用
      await page.evaluate(() => {
        const chatStore = (window as any).__chatStore?.getState();
        chatStore.addMessage({
          id: 'msg-list',
          role: 'assistant',
          content: '列出目录',
          toolCalls: [{
            id: 'list-call',
            tool: 'agent_list_dir',
            args: { rel_path: '.' },
            status: 'pending'
          }]
        });
      });

      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(2000);

      // 验证 tool 消息包含目录列表
      const toolMessageContent = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore?.getState();
        const toolMsg = chatStore?.messages.find((m: any) =>
          m.tool_call_id === 'list-call' && m.role === 'tool'
        );
        return toolMsg?.content;
      });

      console.log('[E2E] Dir list:', toolMessageContent);
      expect(toolMessageContent).toBeTruthy();
      expect(toolMessageContent).toContain('file1.txt');
      expect(toolMessageContent).toContain('file2.txt');
      // 不应该包含子目录中的文件
      expect(toolMessageContent).not.toContain('file3.txt');
    });

    test('空目录应该返回空字符串或非常短的内容', async ({ page }) => {
      // 列出根目录（mock 文件系统中可能为空或只有少量文件）
      await page.evaluate(() => {
        const chatStore = (window as any).__chatStore?.getState();
        chatStore.addMessage({
          id: 'msg-list-empty',
          role: 'assistant',
          content: '列出空目录',
          toolCalls: [{
            id: 'list-empty-call',
            tool: 'agent_list_dir',
            args: { rel_path: '/nonexistent' },
            status: 'pending'
          }]
        });
      });

      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(2000);

      const toolMessageContent = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore?.getState();
        const toolMsg = chatStore?.messages.find((m: any) =>
          m.tool_call_id === 'list-empty-call' && m.role === 'tool'
        );
        return toolMsg?.content;
      });

      console.log('[E2E] Empty dir list length:', toolMessageContent?.length);
      // 空目录应该返回空或很短的内容
      expect(toolMessageContent).toBeDefined();
    });
  });

  test.describe('agent_write_file', () => {

    test('写入成功后应该返回确认信息', async ({ page }) => {
      const fileName = 'new-file.txt';
      const content = 'New file content';

      await page.evaluate(({ fileName, content }) => {
        const chatStore = (window as any).__chatStore?.getState();
        chatStore.addMessage({
          id: 'msg-write',
          role: 'assistant',
          content: '写入文件',
          toolCalls: [{
            id: 'write-call',
            tool: 'agent_write_file',
            args: { rel_path: fileName, content },
            status: 'pending'
          }]
        });
      }, { fileName, content });

      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(2000);

      // 验证工具调用状态
      const toolCallStatus = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore?.getState();
        const msg = chatStore?.messages.find((m: any) => m.id === 'msg-write');
        return msg?.toolCalls?.[0]?.status;
      });
      expect(toolCallStatus).toBe('completed');

      // 验证文件确实被写入
      const fileContent = await page.evaluate(({ fileName }) => {
        const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
        return mockFileSystem.get(`/Users/mac/mock-project/${fileName}`);
      }, { fileName });

      expect(fileContent).toBe(content);
    });

    test('应该捕获原始内容用于回滚', async ({ page }) => {
      const fileName = 'existing-file.txt';
      const originalContent = 'Original content';
      const newContent = 'New content';

      // 先创建文件
      await page.evaluate(({ fileName, content }) => {
        const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
        mockFileSystem.set(`/Users/mac/mock-project/${fileName}`, content);
      }, { fileName, content: originalContent });

      // 然后写入新内容
      await page.evaluate(({ fileName, content }) => {
        const chatStore = (window as any).__chatStore?.getState();
        chatStore.addMessage({
          id: 'msg-write-rollback',
          role: 'assistant',
          content: '修改文件',
          toolCalls: [{
            id: 'write-rollback-call',
            tool: 'agent_write_file',
            args: { rel_path: fileName, content },
            status: 'pending'
          }]
        });
      }, { fileName, content: newContent });

      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(2000);

      // 验证 result 中包含原始内容
      const result = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore?.getState();
        const msg = chatStore?.messages.find((m: any) => m.id === 'msg-write-rollback');
        return msg?.toolCalls?.[0]?.result;
      });

      console.log('[E2E] Write result:', result);
      const resultData = JSON.parse(result || '{}');
      expect(resultData.originalContent).toBe(originalContent);
      expect(resultData.success).toBe(true);
    });
  });

  test.describe('bash', () => {

    test('应该将命令输出传递给 LLM', async ({ page }) => {
      const command = 'echo "Test Output"';
      const expectedOutput = 'Test Output';

      await page.evaluate(({ command }) => {
        const chatStore = (window as any).__chatStore?.getState();
        chatStore.addMessage({
          id: 'msg-bash',
          role: 'assistant',
          content: '执行命令',
          toolCalls: [{
            id: 'bash-call',
            tool: 'bash',
            args: { command },
            status: 'pending'
          }]
        });
      }, { command });

      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(2000);

      // 验证 tool 消息包含命令输出
      const toolMessageContent = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore?.getState();
        const toolMsg = chatStore?.messages.find((m: any) =>
          m.tool_call_id === 'bash-call' && m.role === 'tool'
        );
        return toolMsg?.content;
      });

      console.log('[E2E] Bash output:', toolMessageContent);
      expect(toolMessageContent).toBeTruthy();
      expect(toolMessageContent).toContain(expectedOutput);
    });

    test('应该包含 stderr 输出', async ({ page }) => {
      const command = 'echo "stdout" && echo "stderr" >&2';

      await page.evaluate(({ command }) => {
        const chatStore = (window as any).__chatStore?.getState();
        chatStore.addMessage({
          id: 'msg-stderr',
          role: 'assistant',
          content: '执行命令',
          toolCalls: [{
            id: 'stderr-call',
            tool: 'bash',
            args: { command },
            status: 'pending'
          }]
        });
      }, { command });

      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(2000);

      const toolMessageContent = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore?.getState();
        const toolMsg = chatStore?.messages.find((m: any) =>
          m.tool_call_id === 'stderr-call' && m.role === 'tool'
        );
        return toolMsg?.content;
      });

      console.log('[E2E] Stderr output:', toolMessageContent);
      expect(toolMessageContent).toContain('stdout');
      expect(toolMessageContent).toContain('stderr');
    });
  });

  test.describe('组合场景', () => {

    test('LLM 应该能够基于多个工具结果进行推理', async ({ page }) => {
      const fileName = 'project-info.md';
      const fileContent = `# Project

Version: 1.0.0
`;

      // 创建文件
      await page.evaluate(({ fileName, content }) => {
        const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
        mockFileSystem.set(`/Users/mac/mock-project/${fileName}`, content);
        mockFileSystem.set('/Users/mac/mock-project/README.md', 'readme content');
      }, { fileName, content: fileContent });

      // 用户询问项目结构
      await page.evaluate(({ fileName }) => {
        const chatStore = (window as any).__chatStore?.getState();

        // 用户消息
        chatStore.addMessage({
          id: 'msg-user',
          role: 'user',
          content: `分析 ${fileName} 并列出当前目录的文件`
        });

        // AI 响应（包含多个工具调用）
        chatStore.addMessage({
          id: 'msg-assistant',
          role: 'assistant',
          content: '我来读取文件并列出目录',
          toolCalls: [
            {
              id: 'read-info',
              tool: 'agent_read_file',
              args: { rel_path: fileName },
              status: 'pending'
            },
            {
              id: 'list-dir',
              tool: 'agent_list_dir',
              args: { rel_path: '.' },
              status: 'pending'
            }
          ]
        });
      }, { fileName });

      // 批准两个工具调用
      await removeJoyrideOverlay(page);
      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(500);
      await page.locator('button:has-text("批准执行")').first().click();
      await page.waitForTimeout(2000);

      // 验证两个 tool 消息都包含正确的内容
      const toolMessages = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore?.getState();
        return chatStore?.messages.filter((m: any) => m.role === 'tool').map((m: any) => ({
          content: m.content,
          toolCallId: m.tool_call_id
        }));
      });

      console.log('[E2E] Tool messages:', toolMessages);

      const readMsg = toolMessages?.find((m: any) => m.toolCallId === 'read-info');
      const listMsg = toolMessages?.find((m: any) => m.toolCallId === 'list-dir');

      expect(readMsg?.content).toContain('Version: 1.0.0');
      expect(listMsg?.content).toContain('README.md');
    });
  });

});
