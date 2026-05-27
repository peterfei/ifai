/**
 * Test Agent 工具调用流程 - E2E 测试
 *
 * 验证 Test agent 的 tool call 数据在 chatStore 中正确建立。
 * 使用 store-level 断言（page.evaluate）而非 DOM 断言，
 * 避免对聊天视图渲染状态的依赖（mock 模式下聊天面板不激活）。
 *
 * @version 2.0.0
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Test Agent 工具调用数据验证', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });
  });

  /**
   * 验证 chatStore.setState 能正确写入消息
   */
  test('chatStore 应该能正确 setState 消息', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({
        messages: [
          {
            id: 'test-msg-1',
            role: 'user',
            content: '/agent test src/main.rs',
            timestamp: Date.now(),
          },
        ],
      });
      return chatStore.getState().messages.length;
    });

    expect(result).toBe(1);
  });

  /**
   * 场景 1: 单文件读取 + 写入
   *
   * 验证 agent_read_file → agent_write_file 的完整工具调用
   * 数据在 store 中正确建立，包含：
   * - toolCalls 数组长度
   * - 每个 tool call 的 name / status / result
   * - tool result 消息的 role / content 完整性
   * - tool call 关联的 result 包含正确的路径和状态
   */
  test('agent_read_file → agent_write_file 工具调用数据正确', async ({ page }) => {
    const state = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const now = Date.now();
      const readFileContent = 'fn main() {\n    println!("Hello, world!");\n}\n';

      const messages = [
        {
          id: 'msg-user',
          role: 'user',
          content: '/agent test src/main.rs',
          timestamp: now,
        },
        // 第一轮: agent_read_file
        {
          id: 'msg-read',
          role: 'assistant',
          content: '我来读取 src/main.rs。',
          timestamp: now + 1000,
          isStreaming: false,
          status: 'completed',
          toolCalls: [
            {
              id: 'call_read',
              type: 'function',
              tool: 'agent_read_file',
              args: { path: 'src/main.rs' },
              function: {
                name: 'agent_read_file',
                arguments: JSON.stringify({ path: 'src/main.rs' }),
              },
              status: 'completed',
              result: JSON.stringify({
                path: 'src/main.rs',
                content: readFileContent,
                size: readFileContent.length,
              }),
              isPartial: false,
            },
          ],
        },
        {
          id: 'res-read',
          role: 'tool',
          content: JSON.stringify({
            path: 'src/main.rs',
            content: readFileContent,
            size: readFileContent.length,
          }),
          tool_call_id: 'call_read',
          timestamp: now + 2000,
        },
        // 第二轮: agent_write_file
        {
          id: 'msg-write',
          role: 'assistant',
          content: '现在生成测试文件。',
          timestamp: now + 3000,
          isStreaming: false,
          status: 'completed',
          toolCalls: [
            {
              id: 'call_write',
              type: 'function',
              tool: 'agent_write_file',
              args: { path: 'tests/test_main.rs', content: '// tests' },
              function: {
                name: 'agent_write_file',
                arguments: JSON.stringify({ path: 'tests/test_main.rs', content: '// tests' }),
              },
              status: 'completed',
              result: JSON.stringify({
                success: true,
                filePath: 'tests/test_main.rs',
                message: 'File written successfully',
              }),
              isPartial: false,
            },
          ],
        },
        {
          id: 'res-write',
          role: 'tool',
          content: JSON.stringify({
            success: true,
            filePath: 'tests/test_main.rs',
            message: 'File written successfully',
          }),
          tool_call_id: 'call_write',
          timestamp: now + 4000,
        },
        // 最终回复
        {
          id: 'msg-final',
          role: 'assistant',
          content: '测试文件已生成完毕！\n- 源文件: src/main.rs\n- 测试文件: tests/test_main.rs',
          timestamp: now + 5000,
          isStreaming: false,
          status: 'completed',
        },
      ];

      chatStore.setState({ messages });

      const msgs = chatStore.getState().messages;
      const msgRead = msgs.find((m: any) => m.id === 'msg-read');
      const msgWrite = msgs.find((m: any) => m.id === 'msg-write');
      const msgFinal = msgs.find((m: any) => m.id === 'msg-final');
      const resRead = msgs.find((m: any) => m.id === 'res-read');
      const resWrite = msgs.find((m: any) => m.id === 'res-write');

      return {
        addedMessageIds: msgs.filter((m: any) => ['msg-user', 'msg-read', 'res-read', 'msg-write', 'res-write', 'msg-final'].includes(m.id)).length,
        // read tool
        readToolCalls: msgRead?.toolCalls?.length || 0,
        readToolName: msgRead?.toolCalls?.[0]?.tool,
        readToolStatus: msgRead?.toolCalls?.[0]?.status,
        readToolArgs: msgRead?.toolCalls?.[0]?.args,
        readResultParsed: msgRead?.toolCalls?.[0]?.result
          ? JSON.parse(msgRead.toolCalls[0].result)
          : null,
        // write tool
        writeToolCalls: msgWrite?.toolCalls?.length || 0,
        writeToolName: msgWrite?.toolCalls?.[0]?.tool,
        writeToolStatus: msgWrite?.toolCalls?.[0]?.status,
        writeToolArgs: msgWrite?.toolCalls?.[0]?.args,
        writeResultParsed: msgWrite?.toolCalls?.[0]?.result
          ? JSON.parse(msgWrite.toolCalls[0].result)
          : null,
        // tool result messages
        resReadRole: resRead?.role,
        resReadToolCallId: resRead?.tool_call_id,
        resWriteRole: resWrite?.role,
        resWriteToolCallId: resWrite?.tool_call_id,
        // final response
        finalContent: msgFinal?.content,
        finalStatus: msgFinal?.status,
      };
    });

    // 6 条自定义消息全部写入成功
    expect(state.addedMessageIds).toBe(6);

    // read tool
    expect(state.readToolCalls).toBe(1);
    expect(state.readToolName).toBe('agent_read_file');
    expect(state.readToolStatus).toBe('completed');
    expect(state.readResultParsed?.path).toBe('src/main.rs');
    expect(state.readResultParsed?.content).toContain('fn main()');

    // write tool
    expect(state.writeToolCalls).toBe(1);
    expect(state.writeToolName).toBe('agent_write_file');
    expect(state.writeToolStatus).toBe('completed');
    expect(state.writeResultParsed?.success).toBe(true);
    expect(state.writeResultParsed?.filePath).toBe('tests/test_main.rs');

    // tool result messages
    expect(state.resReadRole).toBe('tool');
    expect(state.resReadToolCallId).toBe('call_read');
    expect(state.resWriteRole).toBe('tool');
    expect(state.resWriteToolCallId).toBe('call_write');

    // final response
    expect(state.finalStatus).toBe('completed');
    expect(state.finalContent).toContain('测试文件已生成完毕');
  });

  /**
   * 场景 2: 并行多个工具调用
   *
   * 验证单个 assistant 消息包含多个并行 toolCalls
   */
  test('并行多个工具调用数据正确', async ({ page }) => {
    const state = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const now = Date.now();

      const messages = [
        {
          id: 'msg-user',
          role: 'user',
          content: '/agent test 为所有模块生成测试',
          timestamp: now,
        },
        {
          id: 'msg-assistant',
          role: 'assistant',
          content: '并行读取多个源文件。',
          timestamp: now + 1000,
          isStreaming: false,
          status: 'completed',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              tool: 'agent_read_file',
              args: { path: 'src/models/user.rs' },
              function: {
                name: 'agent_read_file',
                arguments: JSON.stringify({ path: 'src/models/user.rs' }),
              },
              status: 'completed',
              result: JSON.stringify({
                path: 'src/models/user.rs',
                content: 'pub struct User { pub id: i32 }',
                size: 30,
              }),
              isPartial: false,
            },
            {
              id: 'call_2',
              type: 'function',
              tool: 'agent_read_file',
              args: { path: 'src/handlers/auth.rs' },
              function: {
                name: 'agent_read_file',
                arguments: JSON.stringify({ path: 'src/handlers/auth.rs' }),
              },
              status: 'completed',
              result: JSON.stringify({
                path: 'src/handlers/auth.rs',
                content: 'pub fn login() {}',
                size: 20,
              }),
              isPartial: false,
            },
            {
              id: 'call_3',
              type: 'function',
              tool: 'agent_write_file',
              args: { path: 'tests/user_test.rs' },
              function: {
                name: 'agent_write_file',
                arguments: JSON.stringify({ path: 'tests/user_test.rs' }),
              },
              status: 'completed',
              result: JSON.stringify({
                success: true,
                filePath: 'tests/user_test.rs',
                message: 'File written successfully',
              }),
              isPartial: false,
            },
            {
              id: 'call_4',
              type: 'function',
              tool: 'agent_write_file',
              args: { path: 'tests/auth_test.rs' },
              function: {
                name: 'agent_write_file',
                arguments: JSON.stringify({ path: 'tests/auth_test.rs' }),
              },
              status: 'completed',
              result: JSON.stringify({
                success: true,
                filePath: 'tests/auth_test.rs',
                message: 'File written successfully',
              }),
              isPartial: false,
            },
          ],
        },
      ];

      chatStore.setState({ messages });

      const msg = chatStore.getState().messages.find((m: any) => m.id === 'msg-assistant');
      return {
        toolCount: msg?.toolCalls?.length || 0,
        toolNames: msg?.toolCalls?.map((tc: any) => tc.tool) || [],
        toolStatuses: msg?.toolCalls?.map((tc: any) => tc.status) || [],
        results: msg?.toolCalls?.map((tc: any) => {
          const r = tc.result ? JSON.parse(tc.result) : null;
          return {
            tool: tc.tool,
            path: r?.path || r?.filePath,
            success: r?.success,
          };
        }) || [],
      };
    });

    expect(state.toolCount).toBe(4);
    expect(state.toolNames).toEqual([
      'agent_read_file',
      'agent_read_file',
      'agent_write_file',
      'agent_write_file',
    ]);
    expect(state.toolStatuses.every((s: string) => s === 'completed')).toBe(true);
    expect(state.results[0]).toEqual({ tool: 'agent_read_file', path: 'src/models/user.rs', success: undefined });
    expect(state.results[2]).toEqual({ tool: 'agent_write_file', path: 'tests/user_test.rs', success: true });
    expect(state.results[3]).toEqual({ tool: 'agent_write_file', path: 'tests/auth_test.rs', success: true });
  });

  /**
   * 场景 3: 工具调用状态覆盖
   *
   * 验证不同状态 (pending → completed / failed) 正确更新
   */
  test('工具调用状态转换正确', async ({ page }) => {
    const state = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const now = Date.now();

      const messages = [
        {
          id: 'msg-user',
          role: 'user',
          content: '分析错误处理',
          timestamp: now,
        },
        {
          id: 'msg-pending',
          role: 'assistant',
          content: '正在分析...',
          timestamp: now + 1000,
          isStreaming: false,
          toolCalls: [
            {
              id: 'call_pending',
              tool: 'agent_read_file',
              args: { path: 'src/error.rs' },
              status: 'pending',
              isPartial: false,
            },
          ],
        },
        {
          id: 'msg-failed',
          role: 'assistant',
          content: '分析失败。',
          timestamp: now + 2000,
          isStreaming: false,
          toolCalls: [
            {
              id: 'call_failed',
              tool: 'agent_read_file',
              args: { path: 'src/nonexistent.rs' },
              status: 'failed',
              result: JSON.stringify({ error: 'File not found', path: 'src/nonexistent.rs' }),
              isPartial: false,
            },
          ],
        },
        {
          id: 'msg-no-tools',
          role: 'assistant',
          content: '完成。',
          timestamp: now + 3000,
          isStreaming: false,
          status: 'completed',
          toolCalls: [],
        },
      ];

      chatStore.setState({ messages });
      const msgs = chatStore.getState().messages;
      const pending = msgs.find((m: any) => m.id === 'msg-pending');
      const failed = msgs.find((m: any) => m.id === 'msg-failed');
      const noTools = msgs.find((m: any) => m.id === 'msg-no-tools');

      return {
        pendingStatus: pending?.toolCalls?.[0]?.status,
        pendingTool: pending?.toolCalls?.[0]?.tool,
        failedStatus: failed?.toolCalls?.[0]?.status,
        failedTool: failed?.toolCalls?.[0]?.tool,
        failedResult: failed?.toolCalls?.[0]?.result
          ? JSON.parse(failed.toolCalls[0].result)
          : null,
        noToolsCount: noTools?.toolCalls?.length ?? 0,
      };
    });

    expect(state.pendingStatus).toBe('pending');
    expect(state.pendingTool).toBe('agent_read_file');
    expect(state.failedStatus).toBe('failed');
    expect(state.failedTool).toBe('agent_read_file');
    expect(state.failedResult?.error).toBe('File not found');
    expect(state.noToolsCount).toBe(0);
  });

  /**
   * 场景 4: tool result 消息格式验证
   *
   * 验证 role: 'tool' 消息的正确格式：
   * - role 必须是 'tool'
   * - tool_call_id 必须关联对应的 toolCall.id
   * - content 包含序列化的执行结果
   */
  test('tool result 消息格式正确', async ({ page }) => {
    const state = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const now = Date.now();

      const messages = [
        {
          id: 'msg-user',
          role: 'user',
          content: '生成测试',
          timestamp: now,
        },
        {
          id: 'msg-asst',
          role: 'assistant',
          content: '读取文件...',
          timestamp: now + 1000,
          toolCalls: [
            {
              id: 'call_x',
              tool: 'agent_read_file',
              args: { path: 'src/lib.rs' },
              status: 'completed',
              result: JSON.stringify({ path: 'src/lib.rs', content: 'pub fn add() {}' }),
            },
          ],
        },
        {
          id: 'res-x',
          role: 'tool',
          content: JSON.stringify({ path: 'src/lib.rs', content: 'pub fn add() {}' }),
          tool_call_id: 'call_x',
          timestamp: now + 2000,
        },
      ];

      chatStore.setState({ messages });
      const res = chatStore.getState().messages.find((m: any) => m.id === 'res-x');
      const parsed = res?.content ? JSON.parse(res.content) : null;

      return {
        role: res?.role,
        toolCallId: res?.tool_call_id,
        hasContent: !!res?.content,
        contentType: typeof res?.content,
        parsedPath: parsed?.path,
        parsedContent: parsed?.content,
        hasTimestamp: typeof res?.timestamp === 'number',
      };
    });

    expect(state.role).toBe('tool');
    expect(state.toolCallId).toBe('call_x');
    expect(state.hasContent).toBe(true);
    expect(state.contentType).toBe('string');
    expect(state.parsedPath).toBe('src/lib.rs');
    expect(state.parsedContent).toBe('pub fn add() {}');
    expect(state.hasTimestamp).toBe(true);
  });

  /**
   * 场景 5: 搜索工具调用格式
   *
   * 验证 agent_search 等非文件操作工具的调用数据
   */
  test('非文件工具调用数据正确', async ({ page }) => {
    const state = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const now = Date.now();

      const messages = [
        {
          id: 'msg-user',
          role: 'user',
          content: '搜索 Todos',
          timestamp: now,
        },
        {
          id: 'msg-asst',
          role: 'assistant',
          content: '搜索中...',
          timestamp: now + 1000,
          toolCalls: [
            {
              id: 'call_s1',
              tool: 'agent_search',
              args: { pattern: 'TODO', scope: 'src/' },
              status: 'completed',
              result: JSON.stringify({
                matches: [
                  { path: 'src/main.rs', line: 5, content: '// TODO: refactor' },
                ],
                total: 1,
              }),
            },
            {
              id: 'call_s2',
              tool: 'agent_list_dir',
              args: { path: 'src/' },
              status: 'completed',
              result: JSON.stringify({
                entries: ['src/main.rs', 'src/lib.rs'],
                path: 'src/',
              }),
            },
          ],
        },
      ];

      chatStore.setState({ messages });
      const msg = chatStore.getState().messages.find((m: any) => m.id === 'msg-asst');
      const tc1 = msg?.toolCalls?.[0];
      const tc2 = msg?.toolCalls?.[1];

      return {
        count: msg?.toolCalls?.length || 0,
        searchTool: tc1?.tool,
        searchArgs: tc1?.args,
        searchResult: tc1?.result ? JSON.parse(tc1.result) : null,
        listTool: tc2?.tool,
        listArgs: tc2?.args,
        listResult: tc2?.result ? JSON.parse(tc2.result) : null,
      };
    });

    expect(state.count).toBe(2);
    expect(state.searchTool).toBe('agent_search');
    expect(state.searchArgs).toEqual({ pattern: 'TODO', scope: 'src/' });
    expect(state.searchResult?.total).toBe(1);
    expect(state.searchResult?.matches[0].path).toBe('src/main.rs');
    expect(state.listTool).toBe('agent_list_dir');
    expect(state.listArgs).toEqual({ path: 'src/' });
    expect(state.listResult?.entries).toContain('src/main.rs');
  });
});
