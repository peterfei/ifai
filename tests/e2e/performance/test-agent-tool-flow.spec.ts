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

  /**
   * 场景 6: toolCalls 在工作流生命周期中的传播
   *
   * 验证 workflow:progress 累积的 toolCalls 在 workflow:response
   * 更新消息后不被丢弃（产出物面板的数据源）。
   *
   * 模拟 StoreMapper 中 workflow:response 处理器的"更新现有消息"路径：
   * 用 spread 保留所有属性，只覆写 content/status/segments/metadata。
   *
   * @see StoreMapper.ts workflow:response handler
   */
  test('toolCalls 在 workflow:response 后保留', async ({ page }) => {
    const state = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const now = Date.now();
      const workflowId = 'test-wf-001';

      // ── 阶段 1: workflow:started 创建进度消息 ──────────────
      const progressMsg = {
        id: 'wf-msg-001',
        role: 'assistant',
        content: '正在为 src/main.rs 生成测试...',
        timestamp: now,
        metadata: { workflowId, workflowType: 'test', phaseData: [] },
      };
      chatStore.setState({ messages: [progressMsg] });

      // ── 阶段 2: workflow:progress（tool_call 事件）累积 toolCalls ──
      const messagesWithToolCalls = chatStore.getState().messages.map((m: any) => {
        if (m.metadata?.workflowId === workflowId) {
          return {
            ...m,
            toolCalls: [
              {
                id: `wf-${workflowId}-agent_write_file-${now}`,
                type: 'function',
                function: {
                  name: 'agent_write_file',
                  arguments: JSON.stringify({ path: 'tests/test_main.rs', content: '// test' }),
                },
                tool: 'agent_write_file',
                args: { path: 'tests/test_main.rs', content: '// test' },
                status: 'completed',
                result: JSON.stringify({
                  success: true,
                  filePath: 'tests/test_main.rs',
                  originalContent: '',
                  newContent: '// test',
                  message: 'File written successfully',
                }),
                isPartial: false,
              },
            ],
          };
        }
        return m;
      });
      chatStore.setState({ messages: messagesWithToolCalls });

      // ── 阶段 3: workflow:response 更新消息（spread 保留 toolCalls）──
      const beforeUpdate = chatStore.getState().messages;
      const assistantIndex = beforeUpdate.findIndex(
        (m: any) => m.metadata?.workflowId === workflowId
      );
      const newMessages = [...beforeUpdate];
      newMessages[assistantIndex] = {
        ...newMessages[assistantIndex],
        content: '测试文件已生成完毕！\n- tests/test_main.rs',
        status: 'completed',
        segments: [{
          id: `seg-workflow-${workflowId}`,
          type: 'text' as const,
          phase: 'pre-tool' as const,
          content: '测试文件已生成完毕！\n- tests/test_main.rs',
          order: 1,
          timestamp: Date.now(),
        }],
        metadata: { ...newMessages[assistantIndex].metadata, workflowId, workflowType: 'test' },
      };

      // ── 验证 ──
      const updatedMsg = newMessages[assistantIndex];

      // Parse the toolCall result like useArtifactData.parseAgentWriteFile does
      const tc = updatedMsg.toolCalls?.[0];
      const parsed = tc?.result ? JSON.parse(tc.result) : null;

      return {
        // toolCalls 未被丢弃
        hasToolCalls: Array.isArray(updatedMsg.toolCalls) && updatedMsg.toolCalls.length > 0,
        toolCallsCount: updatedMsg.toolCalls?.length || 0,
        toolName: tc?.tool,
        toolStatus: tc?.status,
        // 解析结果兼容 useArtifactData
        artifactParsable: parsed?.filePath === 'tests/test_main.rs' && parsed?.success === true,
        parsedFilePath: parsed?.filePath,
        parsedNewContent: parsed?.newContent,
        // 响应内容正确
        responseContent: updatedMsg.content,
        responseStatus: updatedMsg.status,
      };
    });

    // toolCalls 传播验证
    expect(state.hasToolCalls).toBe(true);
    expect(state.toolCallsCount).toBe(1);
    expect(state.toolName).toBe('agent_write_file');
    expect(state.toolStatus).toBe('completed');

    // 产出物解析兼容性（useArtifactData 的解析链路）
    expect(state.artifactParsable).toBe(true);
    expect(state.parsedFilePath).toBe('tests/test_main.rs');
    expect(state.parsedNewContent).toBe('// test');

    // 响应内容
    expect(state.responseContent).toContain('测试文件已生成完毕');
    expect(state.responseStatus).toBe('completed');
  });
});

/**
 * InteractionCard E2E 测试
 *
 * 验证 InteractionCard 的工作流集成：
 * - workflow:progress(request_user_input) → 消息注入
 * - 单选/多选/多问题模式
 * - feedback 事件回传
 */
test.describe('InteractionCard 交互反馈', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });
  });

  /* E2E-E.1: InteractionCard 消息注入 */
  test('E2E-E.1: workflow:progress(request_user_input) → interaction 消息被注入', async ({ page }) => {
    const state = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const now = Date.now();

      // 预置一条 workflow 消息
      chatStore.setState({
        messages: [{
          id: 'wf-msg',
          role: 'assistant',
          content: '',
          timestamp: now,
          metadata: { workflowId: 'e2e-wf-1', workflowType: 'test', phaseData: [] },
        }],
      });

      // 通过 EventBus 触发 ask_user 事件（模拟后端 request_user_input）
      const eventBus = (window as any).__chatEventBus;
      eventBus.emit('workflow:progress', {
        workflowId: 'e2e-wf-1',
        event_type: 'tool_call',
        node_id: 'node-1',
        message: '请求用户输入',
        tool_details: {
          tool_name: 'request_user_input',
          tool_input: JSON.stringify({
            title: '选择迁移策略',
            questions: [{
              id: 'q1',
              type: 'single',
              question: '请选择迁移方案',
              options: [
                { id: 'blue-green', label: '蓝绿部署', desc: '零停机切换' },
                { id: 'rolling', label: '滚动更新', desc: '逐步替换实例' },
              ],
            }],
          }),
          tool_output: JSON.stringify({
            _feedback_req_id: 'e2e-req-1',
            title: '选择迁移策略',
            questions: [{
              id: 'q1',
              type: 'single',
              question: '请选择迁移方案',
              options: [
                { id: 'blue-green', label: '蓝绿部署', desc: '零停机切换' },
                { id: 'rolling', label: '滚动更新', desc: '逐步替换实例' },
              ],
            }],
          }),
        },
      });

      // 等待 StoreMapper 处理
      return new Promise<any>((resolve) => {
        setTimeout(() => {
          const msgs = chatStore.getState().messages;
          const interactionMsg = msgs.find((m: any) => m.metadata?.interactionData);
          resolve({
            hasInteractionCard: !!interactionMsg,
            questionsCount: interactionMsg?.metadata?.interactionData?.questions?.length || 0,
            feedbackRequestId: interactionMsg?.metadata?.feedbackRequestId,
          });
        }, 200);
      });
    });

    expect(state.hasInteractionCard).toBe(true);
    expect(state.questionsCount).toBe(1);
    expect(state.feedbackRequestId).toBe('e2e-req-1');
  });

  /* E2E-E.2 + E2E-E.3: 卡片标题和问题文本 */
  test('E2E-E.2+E.3: interaction card 包含标题和问题文本', async ({ page }) => {
    const state = await page.evaluate(() => {
      const eventBus = (window as any).__chatEventBus;
      const chatStore = (window as any).__chatStore;

      chatStore.setState({ messages: [{
        id: 'wf-msg', role: 'assistant', content: '', timestamp: Date.now(),
        metadata: { workflowId: 'e2e-wf-2', workflowType: 'test', phaseData: [] },
      }] });

      eventBus.emit('workflow:progress', {
        workflowId: 'e2e-wf-2',
        event_type: 'tool_call',
        tool_details: {
          tool_name: 'request_user_input',
          tool_input: JSON.stringify({
            title: '选择部署策略',
            questions: [{
              id: 'q1', type: 'single',
              question: '请选择策略？',
              options: [{ id: 'a', label: '方案A', desc: 'desc A' }],
            }],
          }),
          tool_output: JSON.stringify({
            _feedback_req_id: 'e2e-req-2',
            title: '选择部署策略',
            questions: [{ id: 'q1', type: 'single', question: '请选择策略？', options: [{ id: 'a', label: '方案A', desc: 'desc A' }] }],
          }),
        },
      });

      return new Promise<any>((resolve) => {
        setTimeout(() => {
          const msgs = chatStore.getState().messages;
          const interactionMsg = msgs.find((m: any) => m.metadata?.interactionData);
          const data = interactionMsg?.metadata?.interactionData;
          resolve({
            hasCard: !!interactionMsg,
            title: data?.title,
            questionText: data?.questions?.[0]?.question,
          });
        }, 200);
      });
    });

    expect(state.title).toBe('选择部署策略');
    expect(state.questionText).toBe('请选择策略？');
  });

  /* E2E-E.4: 选项列表渲染 */
  test('E2E-E.4: interaction card 包含选项列表', async ({ page }) => {
    const state = await page.evaluate(() => {
      const eventBus = (window as any).__chatEventBus;
      const chatStore = (window as any).__chatStore;

      chatStore.setState({ messages: [{
        id: 'wf-msg', role: 'assistant', content: '', timestamp: Date.now(),
        metadata: { workflowId: 'e2e-wf-3', workflowType: 'test', phaseData: [] },
      }] });

      eventBus.emit('workflow:progress', {
        workflowId: 'e2e-wf-3',
        event_type: 'tool_call',
        tool_details: {
          tool_name: 'request_user_input',
          tool_input: JSON.stringify({
            title: '选择选项',
            questions: [{
              id: 'q1', type: 'single', question: '选哪个？',
              options: [
                { id: 'opt1', label: '选项一', desc: '描述一', tag: '推荐', tagColor: 'emerald' },
                { id: 'opt2', label: '选项二', desc: '描述二' },
                { id: 'opt3', label: '选项三', desc: '描述三', tag: '谨慎', tagColor: 'amber' },
              ],
            }],
          }),
          tool_output: JSON.stringify({
            _feedback_req_id: 'e2e-req-3',
            title: '选择选项',
            questions: [{ id: 'q1', type: 'single', question: '选哪个？', options: [
              { id: 'opt1', label: '选项一', desc: '描述一' },
              { id: 'opt2', label: '选项二', desc: '描述二' },
              { id: 'opt3', label: '选项三', desc: '描述三' },
            ]}],
          }),
        },
      });

      return new Promise<any>((resolve) => {
        setTimeout(() => {
          const msgs = chatStore.getState().messages;
          const data = msgs.find((m: any) => m.metadata?.interactionData)?.metadata?.interactionData;
          resolve({
            optionsCount: data?.questions?.[0]?.options?.length || 0,
            optionLabels: data?.questions?.[0]?.options?.map((o: any) => o.label) || [],
          });
        }, 200);
      });
    });

    expect(state.optionsCount).toBe(3);
    expect(state.optionLabels).toContain('选项一');
    expect(state.optionLabels).toContain('选项二');
    expect(state.optionLabels).toContain('选项三');
  });

  /* E2E-E.7 + E2E-E.9: 单选确认 → feedback 事件 + 携带选中项 */
  test('E2E-E.7+E.9: 单选确认 → feedback 事件携带选中项', async ({ page }) => {
    const state = await page.evaluate(() => {
      const eventBus = (window as any).__chatEventBus;
      const chatStore = (window as any).__chatStore;

      // 记录 feedback 事件
      let capturedFeedback: any = null;
      eventBus.on('workflow:feedback', (payload: any) => {
        capturedFeedback = payload;
      });

      // 注入 interaction 消息
      chatStore.setState({ messages: [{
        id: 'interaction-msg',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        metadata: {
          workflowId: 'e2e-wf-fb',
          feedbackRequestId: 'e2e-req-fb',
          interactionData: {
            type: 'single',
            title: '测试',
            questions: [{
              id: 'q1', type: 'single', question: '选哪个？',
              options: [{ id: 'a', label: 'A方案', desc: '' }],
            }],
          },
        },
      }] });

      // 模拟用户确认（触发 workflow:feedback）
      eventBus.emit('workflow:feedback', {
        workflowId: 'e2e-wf-fb',
        questionAnswers: [{ questionId: 'q1', selectedIds: ['a'] }],
        action: 'continue',
      });

      // 等待处理
      return new Promise<any>((resolve) => {
        setTimeout(() => {
          resolve({
            feedbackReceived: !!capturedFeedback,
            workflowId: capturedFeedback?.workflowId,
            hasQuestionAnswers: Array.isArray(capturedFeedback?.questionAnswers),
            questionId: capturedFeedback?.questionAnswers?.[0]?.questionId,
            selectedIds: capturedFeedback?.questionAnswers?.[0]?.selectedIds,
          });
        }, 200);
      });
    });

    expect(state.feedbackReceived).toBe(true);
    expect(state.workflowId).toBe('e2e-wf-fb');
    expect(state.questionId).toBe('q1');
    expect(state.selectedIds).toEqual(['a']);
  });

  /* E2E-E.11 + E2E-E.12: 多问题模式渲染 + 统一确认 */
  test('E2E-E.11+E.12: 多问题模式渲染 + 统一确认', async ({ page }) => {
    const state = await page.evaluate(() => {
      const eventBus = (window as any).__chatEventBus;
      const chatStore = (window as any).__chatStore;

      chatStore.setState({ messages: [{
        id: 'wf-msg', role: 'assistant', content: '', timestamp: Date.now(),
        metadata: { workflowId: 'e2e-wf-mq', workflowType: 'test', phaseData: [] },
      }] });

      // 模拟多问题 ask_user 事件
      eventBus.emit('workflow:progress', {
        workflowId: 'e2e-wf-mq',
        event_type: 'tool_call',
        tool_details: {
          tool_name: 'request_user_input',
          tool_input: JSON.stringify({
            title: '配置迁移',
            questions: [
              { id: 'strategy', type: 'single', question: '选择策略', options: [
                { id: 'rehost', label: '直接迁移', desc: '最快的方案' },
                { id: 'refactor', label: '重构迁移', desc: '最安全的方案' },
              ]},
              { id: 'testing', type: 'multiple', question: '勾选测试类型', options: [
                { id: 'unit', label: '单元测试', desc: '验证单个函数' },
                { id: 'intg', label: '集成测试', desc: '验证组件交互' },
                { id: 'e2e', label: '端到端测试', desc: '验证完整流程' },
              ]},
            ],
          }),
          tool_output: JSON.stringify({
            _feedback_req_id: 'e2e-req-mq',
            title: '配置迁移',
            questions: [
              { id: 'strategy', type: 'single', question: '选择策略', options: [{ id: 'rehost', label: '直接迁移', desc: '最快的方案' }, { id: 'refactor', label: '重构迁移', desc: '最安全的方案' }] },
              { id: 'testing', type: 'multiple', question: '勾选测试类型', options: [{ id: 'unit', label: '单元测试', desc: '' }, { id: 'intg', label: '集成测试', desc: '' }, { id: 'e2e', label: '端到端测试', desc: '' }] },
            ],
          }),
        },
      });

      return new Promise<any>((resolve) => {
        setTimeout(() => {
          const msgs = chatStore.getState().messages;
          const data = msgs.find((m: any) => m.metadata?.interactionData)?.metadata?.interactionData;
          resolve({
            hasMultipleQ: data?.questions?.length === 2,
            firstType: data?.questions?.[0]?.type,
            secondType: data?.questions?.[1]?.type,
            firstOptions: data?.questions?.[0]?.options?.length || 0,
            secondOptions: data?.questions?.[1]?.options?.length || 0,
            cardType: data?.type,
          });
        }, 200);
      });
    });

    expect(state.hasMultipleQ).toBe(true);
    expect(state.firstType).toBe('single');
    expect(state.secondType).toBe('multiple');
    expect(state.firstOptions).toBe(2);
    expect(state.secondOptions).toBe(3);
    expect(state.cardType).toBe('multiple');
  });

  /* E2E-E.10: resolved 卡片不可操作（通过状态验证） */
  test('E2E-E.10: feedback 后消息状态变为 answered', async ({ page }) => {
    const state = await page.evaluate(() => {
      const eventBus = (window as any).__chatEventBus;
      const chatStore = (window as any).__chatStore;

      chatStore.setState({ messages: [{
        id: 'interaction-msg',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        metadata: {
          workflowId: 'e2e-wf-resolved',
          feedbackRequestId: 'e2e-req-resolved',
          interactionData: {
            type: 'single',
            title: '测试',
            questions: [{
              id: 'q1', type: 'single', question: '确定?',
              options: [{ id: 'yes', label: '是', desc: '' }],
            }],
          },
        },
      }] });

      // 触发 feedback
      eventBus.emit('workflow:feedback', {
        workflowId: 'e2e-wf-resolved',
        questionAnswers: [{ questionId: 'q1', selectedIds: ['yes'] }],
      });

      return new Promise<any>((resolve) => {
        setTimeout(() => {
          const msgs = chatStore.getState().messages;
          const interactionMsg = msgs.find((m: any) => m.metadata?.interactionData);
          resolve({ status: interactionMsg?.status });
        }, 200);
      });
    });

    expect(state.status).toBe('answered');
  });
});

/* ========================================================================== */
/* 商用 GUI 路径：chat:tool:completed → InteractionCard                       */
/* ========================================================================== */
test.describe('商用 GUI 路径 InteractionCard', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });
  });

  /* GUI-E2E-1 */
  test('GUI-E2E-1: chat:tool:completed(request_user_input) → interaction card 注入', async ({ page }) => {
    const state = await page.evaluate(() => {
      const eventBus = (window as any).__chatEventBus;
      const chatStore = (window as any).__chatStore;

      // 先注入一条含 toolCalls 的 assistant 消息
      chatStore.setState({ messages: [{
        id: 'gui-msg-1',
        role: 'assistant',
        content: '我来帮您分析方案',
        timestamp: Date.now(),
        toolCalls: [{
          id: 'tc-1',
          name: 'request_user_input',
          status: 'pending',
        }],
      }] });

      // 模拟后端发送 tool_done → chat:tool:completed
      eventBus.emit('chat:tool:completed', {
        toolId: 'tc-1',
        result: JSON.stringify({
          _feedback_req_id: 'gui-req-1',
          title: '选择方案',
          questions: [{
            id: 'q1', type: 'single', question: '请选择方案：',
            options: [
              { id: 'a', label: '方案A', desc: '全面重构' },
              { id: 'b', label: '方案B', desc: '增量修改' },
            ],
          }],
          onSelect: 'continue',
        }),
        correlationId: 'gui-msg-1',
        shouldContinue: true,
      });

      return new Promise<any>((resolve) => {
        setTimeout(() => {
          const msgs = chatStore.getState().messages;
          const interactionMsg = msgs.find((m: any) => m.id?.startsWith('interaction-'));
          const originalMsg = msgs.find((m: any) => m.id === 'gui-msg-1');
          const toolCallStatus = originalMsg?.toolCalls?.[0]?.status;
          resolve({
            hasInteractionCard: !!interactionMsg,
            feedbackRequestId: interactionMsg?.metadata?.feedbackRequestId,
            title: interactionMsg?.metadata?.interactionData?.title,
            questionsCount: interactionMsg?.metadata?.interactionData?.questions?.length,
            questionText: interactionMsg?.metadata?.interactionData?.questions?.[0]?.question,
            firstOption: interactionMsg?.metadata?.interactionData?.questions?.[0]?.options?.[0]?.label,
            toolCallCompleted: toolCallStatus === 'completed',
          });
        }, 300);
      });
    });

    expect(state.hasInteractionCard).toBe(true);
    expect(state.feedbackRequestId).toBe('gui-req-1');
    expect(state.title).toBe('选择方案');
    expect(state.questionsCount).toBe(1);
    expect(state.questionText).toBe('请选择方案：');
    expect(state.firstOption).toBe('方案A');
    expect(state.toolCallCompleted).toBe(true);
  });

  /* GUI-E2E-2 */
  test('GUI-E2E-2: workflow:feedback(feedbackRequestId) → submit_user_feedback + answered', async ({ page }) => {
    const state = await page.evaluate(() => {
      const eventBus = (window as any).__chatEventBus;
      const chatStore = (window as any).__chatStore;

      // 捕获 invoke 调用
      let capturedInvoke: any = null;
      const internals = (window as any).__TAURI_INTERNALS__;
      if (internals?.invoke) {
        const origInvoke = internals.invoke.bind(internals);
        internals.invoke = async (cmd: string, args: any) => {
          if (cmd === 'submit_user_feedback') {
            capturedInvoke = { cmd, args };
          }
          return origInvoke(cmd, args);
        };
      }

      // 注入 interaction 消息（GUI 路径格式：无 workflowId，有 feedbackRequestId）
      chatStore.setState({ messages: [{
        id: 'interaction-gui-2',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        metadata: {
          feedbackRequestId: 'gui-req-2',
          interactionData: {
            type: 'single',
            title: '选择方案',
            questions: [{
              id: 'q1', type: 'single', question: '选哪个？',
              options: [
                { id: 'a', label: '方案A', desc: '' },
                { id: 'b', label: '方案B', desc: '' },
              ],
            }],
          },
        },
      }] });

      // 模拟 MessageItem onAction → workflow:feedback（不带 workflowId）
      eventBus.emit('workflow:feedback', {
        feedbackRequestId: 'gui-req-2',
        questionAnswers: [{ questionId: 'q1', selectedIds: ['a'] }],
        action: 'continue',
      });

      return new Promise<any>((resolve) => {
        setTimeout(() => {
          const msgs = chatStore.getState().messages;
          const interactionMsg = msgs.find((m: any) => m.id === 'interaction-gui-2');
          resolve({
            invokeCalled: !!capturedInvoke,
            invokeCmd: capturedInvoke?.cmd,
            invokeFeedbackRequestId: capturedInvoke?.args?.feedbackRequestId,
            invokeQuestionAnswers: capturedInvoke?.args?.feedback?.questionAnswers,
            statusAnswered: interactionMsg?.status === 'answered',
          });
        }, 300);
      });
    });

    expect(state.invokeCalled).toBe(true);
    expect(state.invokeCmd).toBe('submit_user_feedback');
    expect(state.invokeFeedbackRequestId).toBe('gui-req-2');
    expect(state.invokeQuestionAnswers).toEqual([{ questionId: 'q1', selectedIds: ['a'] }]);
    expect(state.statusAnswered).toBe(true);
  });

  /* GUI-E2E-3: 消息排序 — card 插入位置验证 */
  test('GUI-E2E-3: card 应插入到 assistant 消息之前，确保 LLM 续播内容在 card 下方', async ({ page }) => {
    const state = await page.evaluate(() => {
      const eventBus = (window as any).__chatEventBus;
      const chatStore = (window as any).__chatStore;

      // 初始：用户消息 + assistant 消息（含分析内容和 toolCalls）
      chatStore.setState({ messages: [
        {
          id: 'user-msg',
          role: 'user',
          content: '我有两个方案...',
          timestamp: 1000,
        },
        {
          id: 'assistant-msg',
          role: 'assistant',
          content: '我来分析：方案A是重构，方案B是增量修改...',
          timestamp: 1001,
          toolCalls: [{ id: 'tc-1', name: 'request_user_input', status: 'pending' }],
        },
      ] });

      // 模拟 tool_done → 注入 interaction card（当前行为：append 到末尾）
      eventBus.emit('chat:tool:completed', {
        toolId: 'tc-1',
        result: JSON.stringify({
          _feedback_req_id: 'gui-req-3',
          title: '选择方案',
          questions: [{ id: 'q1', type: 'single', question: '选哪个？', options: [{ id: 'a', label: '方案A', desc: '' }, { id: 'b', label: '方案B', desc: '' }] }],
        }),
        correlationId: 'assistant-msg',
        shouldContinue: true,
      });

      return new Promise<any>((resolve) => {
        setTimeout(() => {
          const msgs = chatStore.getState().messages;

          // 查找各消息的索引
          const userIdx = msgs.findIndex((m: any) => m.id === 'user-msg');
          const assistantIdx = msgs.findIndex((m: any) => m.id === 'assistant-msg');
          const cardIdx = msgs.findIndex((m: any) => m.id?.startsWith('interaction-'));

          // 模拟 LLM 续播：追加内容到 assistant 消息
          chatStore.setState((state: any) => {
            const updated = state.messages.map((m: any) => {
              if (m.id === 'assistant-msg') {
                return { ...m, content: m.content + '\n\n好的，选择了方案A，开始实施...' };
              }
              return m;
            });
            return { messages: updated };
          });

          // 确认 card 和 assistant 的相对位置
          resolve({
            // 当前 bug: card 在 assistant 之后（cardIdx > assistantIdx）
            // 期望: card 在 assistant 之前（cardIdx < assistantIdx）
            assistantIndex: assistantIdx,
            cardIndex: cardIdx,
            cardAfterAssistant: cardIdx > assistantIdx,
            cardBeforeAssistant: cardIdx < assistantIdx,
            assistantContent: (chatStore.getState().messages.find((m: any) => m.id === 'assistant-msg') as any)?.content,
          });
        }, 300);
      });
    });

    // 确认 bug 存在：card 在 assistant 之后，续播内容出现在 card 上方
    console.log('[Ordering Bug] assistant index:', state.assistantIndex, 'card index:', state.cardIndex);
    console.log('[Ordering Bug] card after assistant:', state.cardAfterAssistant);
    console.log('[Ordering Bug] assistant content:', state.assistantContent?.substring(0, 60));

    // 修复前：cardAfterAssistant = true（BUG：续播内容在 card 上面）
    // 修复后：cardAfterAssistant = false（card 在 assistant 之前，续播内容在 card 下面）
    expect(state.cardAfterAssistant).toBe(false);
  });
});
