import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

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
 *
 * 🔥 FIX: ifainew-core 的 approveToolCall 不会立即创建 tool 消息
 * tool 消息只在调用 generateResponse 时才会创建
 * 因此我们检查 toolCall.result 字段来验证工具执行结果
 */

test.describe.skip('Agent Tools - Result Content Transmission - TODO: Fix Tauri invoke mocking', () => {
  test.beforeEach(async ({ page }) => {
    // 设置控制台日志监听
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') {
        console.log('[Browser Error]', text);
      } else if (text.includes('[E2E]') || text.includes('[Chat]') || text.includes('[useChatStore]')) {
        console.log('[Browser]', text);
      }
    });

    // 设置 E2E 测试环境
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
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const hasChatStore = await page.evaluate(() => {
        const store = (window as any).__chatStore;
        return store && typeof store.getState === 'function';
      });
      if (hasChatStore) break;
    }
  });

  test.describe('agent_read_file', () => {

    test('应该将文件内容传递给 LLM', async ({ page }) => {
      const fileName = 'test-content.txt';
      const fileContent = 'Hello World! This is test content.';

      // 创建测试文件
      await page.evaluate(({ name, content }) => {
        const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
        mockFileSystem.set(`/Users/mac/mock-project/${name}`, content);
      }, { name: fileName, content: fileContent });

      // 添加文件读取工具调用并直接批准
      const result = await page.evaluate(async ({ fileName }) => {
        const chatStore = (window as any).__chatStore;
        const state = chatStore.getState();

        // 添加消息
        state.addMessage({
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

        // 直接调用批准工具
        await state.approveToolCall('msg-read', 'read-call');

        // 等待一下让工具执行完成
        await new Promise(resolve => setTimeout(resolve, 500));

        // 🔥 FIX: 检查 toolCall.result 而不是 tool 消息
        const msg = state.messages.find((m: any) => m.id === 'msg-read');
        const toolCall = msg?.toolCalls?.[0];

        return {
          hasToolCall: !!toolCall,
          toolCallStatus: toolCall?.status,
          toolCallResult: toolCall?.result,
          resultContainsContent: toolCall?.result?.includes(fileContent)
        };
      }, { fileName });

      console.log('[E2E] File content result:', result);
      expect(result.hasToolCall).toBe(true);
      expect(result.toolCallStatus).toBe('completed');
      expect(result.toolCallResult).toBeTruthy();
      expect(result.resultContainsContent).toBe(true);
    });

    test('空文件应该返回空字符串', async ({ page }) => {
      const fileName = 'empty.txt';

      const result = await page.evaluate(async ({ fileName }) => {
        const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
        mockFileSystem.set(`/Users/mac/mock-project/${fileName}`, '');

        const chatStore = (window as any).__chatStore;
        const state = chatStore.getState();

        state.addMessage({
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

        await state.approveToolCall('msg-empty', 'empty-call');
        await new Promise(resolve => setTimeout(resolve, 500));

        const msg = state.messages.find((m: any) => m.id === 'msg-empty');
        const toolCall = msg?.toolCalls?.[0];

        return {
          toolCallStatus: toolCall?.status,
          toolCallResult: toolCall?.result,
          resultLength: toolCall?.result?.length || 0
        };
      }, { fileName });

      console.log('[E2E] Empty file result:', result);
      expect(result.toolCallStatus).toBe('completed');
      expect(result.toolCallResult).toBeDefined();
      expect(result.resultLength).toBe(0);
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

      const result = await page.evaluate(async () => {
        const chatStore = (window as any).__chatStore;
        const state = chatStore.getState();

        state.addMessage({
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

        await state.approveToolCall('msg-list', 'list-call');
        await new Promise(resolve => setTimeout(resolve, 500));

        const msg = state.messages.find((m: any) => m.id === 'msg-list');
        const toolCall = msg?.toolCalls?.[0];

        return {
          hasToolCall: !!toolCall,
          toolCallStatus: toolCall?.status,
          toolCallResult: toolCall?.result,
          containsFile1: toolCall?.result?.includes('file1.txt'),
          containsFile2: toolCall?.result?.includes('file2.txt'),
          notContainsFile3: !toolCall?.result?.includes('file3.txt')
        };
      });

      console.log('[E2E] Dir list result:', result);
      expect(result.hasToolCall).toBe(true);
      expect(result.toolCallStatus).toBe('completed');
      expect(result.toolCallResult).toBeTruthy();
      expect(result.containsFile1).toBe(true);
      expect(result.containsFile2).toBe(true);
      expect(result.notContainsFile3).toBe(true);
    });

    test('空目录应该返回空字符串或非常短的内容', async ({ page }) => {
      const result = await page.evaluate(async () => {
        const chatStore = (window as any).__chatStore;
        const state = chatStore.getState();

        state.addMessage({
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

        await state.approveToolCall('msg-list-empty', 'list-empty-call');
        await new Promise(resolve => setTimeout(resolve, 500));

        const msg = state.messages.find((m: any) => m.id === 'msg-list-empty');
        const toolCall = msg?.toolCalls?.[0];

        return {
          toolCallStatus: toolCall?.status,
          toolCallResult: toolCall?.result,
          resultLength: toolCall?.result?.length || 0
        };
      });

      console.log('[E2E] Empty dir list result:', result);
      // 空目录应该返回空或很短的内容
      expect(result.toolCallResult).toBeDefined();
    });
  });

  test.describe('agent_write_file', () => {

    test('写入成功后应该返回确认信息', async ({ page }) => {
      const fileName = 'new-file.txt';
      const content = 'New file content';

      const result = await page.evaluate(async ({ fileName, content }) => {
        const chatStore = (window as any).__chatStore;
        const state = chatStore.getState();

        state.addMessage({
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

        await state.approveToolCall('msg-write', 'write-call');
        await new Promise(resolve => setTimeout(resolve, 500));

        // 获取工具调用状态
        const msg = state.messages.find((m: any) => m.id === 'msg-write');
        const toolCall = msg?.toolCalls?.[0];
        const toolCallStatus = toolCall?.status;
        const resultStr = toolCall?.result;

        // 验证文件确实被写入
        const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
        const fileContent = mockFileSystem.get(`/Users/mac/mock-project/${fileName}`);

        // 解析 result
        let resultData;
        try {
          resultData = JSON.parse(resultStr || '{}');
        } catch (e) {
          resultData = { success: false };
        }

        return {
          toolCallStatus,
          resultData,
          fileContent,
          statusMatches: toolCallStatus === 'completed',
          contentMatches: fileContent === content,
          isSuccess: resultData.success === true
        };
      }, { fileName, content });

      console.log('[E2E] Write result:', result);
      expect(result.statusMatches).toBe(true);
      expect(result.isSuccess).toBe(true);
      expect(result.contentMatches).toBe(true);
    });

    test('应该捕获原始内容用于回滚', async ({ page }) => {
      const fileName = 'existing-file.txt';
      const originalContent = 'Original content';
      const newContent = 'New content';

      const result = await page.evaluate(async ({ fileName, originalContent, newContent }) => {
        // 先创建文件
        const mockFileSystem = (window as any).__E2E_MOCK_FILE_SYSTEM__;
        mockFileSystem.set(`/Users/mac/mock-project/${fileName}`, originalContent);

        const chatStore = (window as any).__chatStore;
        const state = chatStore.getState();

        state.addMessage({
          id: 'msg-write-rollback',
          role: 'assistant',
          content: '修改文件',
          toolCalls: [{
            id: 'write-rollback-call',
            tool: 'agent_write_file',
            args: { rel_path: fileName, content: newContent },
            status: 'pending'
          }]
        });

        await state.approveToolCall('msg-write-rollback', 'write-rollback-call');
        await new Promise(resolve => setTimeout(resolve, 500));

        // 获取 result
        const msg = state.messages.find((m: any) => m.id === 'msg-write-rollback');
        const resultStr = msg?.toolCalls?.[0]?.result;

        let resultData;
        try {
          resultData = JSON.parse(resultStr || '{}');
        } catch (e) {
          resultData = {};
        }

        return {
          resultStr,
          resultData,
          hasOriginalContent: !!resultData.originalContent,
          originalContentMatches: resultData.originalContent === originalContent,
          isSuccess: resultData.success === true
        };
      }, { fileName, originalContent, newContent });

      console.log('[E2E] Rollback result:', result);
      expect(result.hasOriginalContent).toBe(true);
      expect(result.originalContentMatches).toBe(true);
      expect(result.isSuccess).toBe(true);
    });
  });

  test.describe('bash', () => {

    test('应该将命令输出传递给 LLM', async ({ page }) => {
      const command = 'echo "Test Output"';
      const expectedOutput = 'Test Output';

      const result = await page.evaluate(async ({ command }) => {
        const chatStore = (window as any).__chatStore;
        const state = chatStore.getState();

        state.addMessage({
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

        await state.approveToolCall('msg-bash', 'bash-call');
        await new Promise(resolve => setTimeout(resolve, 500));

        const msg = state.messages.find((m: any) => m.id === 'msg-bash');
        const toolCall = msg?.toolCalls?.[0];

        return {
          hasToolCall: !!toolCall,
          toolCallStatus: toolCall?.status,
          toolCallResult: toolCall?.result,
          containsExpected: toolCall?.result?.includes(expectedOutput)
        };
      }, { command });

      console.log('[E2E] Bash output result:', result);
      expect(result.hasToolCall).toBe(true);
      expect(result.toolCallStatus).toBe('completed');
      expect(result.toolCallResult).toBeTruthy();
      expect(result.containsExpected).toBe(true);
    });

    test('应该包含 stderr 输出', async ({ page }) => {
      const command = 'echo "stdout" && echo "stderr" >&2';

      const result = await page.evaluate(async ({ command }) => {
        const chatStore = (window as any).__chatStore;
        const state = chatStore.getState();

        state.addMessage({
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

        await state.approveToolCall('msg-stderr', 'stderr-call');
        await new Promise(resolve => setTimeout(resolve, 500));

        const msg = state.messages.find((m: any) => m.id === 'msg-stderr');
        const toolCall = msg?.toolCalls?.[0];

        return {
          toolCallStatus: toolCall?.status,
          toolCallResult: toolCall?.result,
          hasStdout: toolCall?.result?.includes('stdout'),
          hasStderr: toolCall?.result?.includes('stderr')
        };
      }, { command });

      console.log('[E2E] Stderr result:', result);
      expect(result.toolCallStatus).toBe('completed');
      expect(result.hasStdout).toBe(true);
      expect(result.hasStderr).toBe(true);
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

      const result = await page.evaluate(async ({ fileName }) => {
        const chatStore = (window as any).__chatStore;
        const state = chatStore.getState();

        // 用户消息
        state.addMessage({
          id: 'msg-user',
          role: 'user',
          content: `分析 ${fileName} 并列出当前目录的文件`
        });

        // AI 响应（包含多个工具调用）
        state.addMessage({
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

        // 批准两个工具调用
        await state.approveToolCall('msg-assistant', 'read-info');
        await new Promise(resolve => setTimeout(resolve, 500));
        await state.approveToolCall('msg-assistant', 'list-dir');
        await new Promise(resolve => setTimeout(resolve, 500));

        // 获取工具调用结果
        const msg = state.messages.find((m: any) => m.id === 'msg-assistant');
        const toolCalls = msg?.toolCalls || [];

        const readCall = toolCalls.find((tc: any) => tc.id === 'read-info');
        const listCall = toolCalls.find((tc: any) => tc.id === 'list-dir');

        return {
          readCallStatus: readCall?.status,
          listCallStatus: listCall?.status,
          readCallResult: readCall?.result,
          listCallResult: listCall?.result,
          readHasVersion: readCall?.result?.includes('Version: 1.0.0'),
          listHasReadme: listCall?.result?.includes('README.md')
        };
      }, { fileName });

      console.log('[E2E] Combined scenario result:', result);
      expect(result.readCallStatus).toBe('completed');
      expect(result.listCallStatus).toBe('completed');
      expect(result.readHasVersion).toBe(true);
      expect(result.listHasReadme).toBe(true);
    });
  });

});
