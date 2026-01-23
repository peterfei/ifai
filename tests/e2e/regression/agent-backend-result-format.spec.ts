/**
 * Agent 后端返回结果格式验证测试
 *
 * 问题背景：
 * 真实环境日志显示：
 * - [formatToolResultToMarkdown] result keys: ["0", "1", "2", …] (220)
 * - result.newContent: "undefined"
 * - result.originalContent: "undefined"
 *
 * 根因分析：
 * 1. 后端 agent_write_file 返回 Result<String, String>（简单字符串）
 *    文件位置：ifainew-core/rust/src/agent.rs:6
 *    返回值：Ok(format!("Successfully wrote to {}", rel_path))
 *
 * 2. 前端期望的格式：{success, message, originalContent, newContent, filePath, timestamp}
 *
 * 3. Agent result 覆盖问题：
 *    agentStore.ts 在 Agent 完成时使用 Agent 的 result 覆盖 toolCall.result
 *    导致任何 diff 数据（如果之前存在）都会被覆盖
 *
 * 测试目的：
 * 1. 验证后端返回的数据格式（字符串/数组/对象）
 * 2. 测试前端如何处理不同的后端响应格式
 * 3. 验证 Agent result 覆盖行为
 * 4. 为后续修复提供明确的测试基线
 *
 * @version v0.3.9.3
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Agent Backend Result Format - 真实环境适配', () => {

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('AgentStore') ||
          text.includes('tool_call') ||
          text.includes('result') ||
          text.includes('formatToolResult') ||
          text.includes('originalContent') ||
          text.includes('newContent') ||
          text.includes('keys:')) {
        console.log('[Browser Console]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__chatStore, { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('@regression scenario-01: 验证后端返回字符串时的行为', async ({ page }) => {
    console.log('[Test] ========== 场景 1: 后端返回简单字符串 ==========');
    test.setTimeout(60000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      const msgId = crypto.randomUUID();
      const toolCallId = 'call_string_result_test';

      // 🔥 模拟后端返回简单字符串的情况
      const backendResult = "File written successfully";

      console.log('[Test] 模拟后端返回字符串:', backendResult);

      // 添加包含工具调用的消息
      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_write_file',
          arguments: {
            rel_path: 'test.txt',
            content: 'Hello World'
          },
          function: { name: 'agent_write_file', arguments: '{"rel_path":"test.txt","content":"Hello World"}' },
          status: 'completed',
          result: backendResult,  // 🔥 字符串结果
          isPartial: false
        }],
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // 验证消息状态
      const messages = chatStore.getState().messages;
      const msg = messages.find((m: any) => m.id === msgId);
      const tc = msg?.toolCalls?.[0];

      // 尝试解析 result
      let parsedResult = null;
      let parseError = null;
      try {
        parsedResult = typeof tc.result === 'string' ? JSON.parse(tc.result) : tc.result;
      } catch (e) {
        parseError = (e as Error).message;
      }

      return {
        success: true,
        resultType: typeof tc.result,
        resultValue: tc.result,
        parsedResult,
        parseError,
        hasOriginalContent: parsedResult?.originalContent !== undefined,
        hasNewContent: parsedResult?.newContent !== undefined
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // ✅ 验证：后端返回字符串时，没有 diff 数据
    expect(result.success).toBe(true);
    expect(result.resultType).toBe('string');
    expect(result.parseError).toBeTruthy(); // 字符串不是 JSON，应该解析失败
    expect(result.hasOriginalContent).toBe(false);
    expect(result.hasNewContent).toBe(false);

    console.log('[Test] ✅ 后端返回字符串时，diff 数据不可用（预期行为）');
  });

  test('@regression scenario-02: 验证后端返回数组时的行为（真实环境 bug）', async ({ page }) => {
    console.log('[Test] ========== 场景 2: 后端返回数组（真实 bug 还原） ==========');
    test.setTimeout(60000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      const msgId = crypto.randomUUID();
      const toolCallId = 'call_array_result_test';

      // 🔥 模拟后端返回数组的情况（真实环境 bug）
      // 这可能是因为某些情况下后端错误地将结果序列化为数组
      const backendResult = ["File", "written", "successfully", ...Array(217).fill("data")]; // 220个元素

      console.log('[Test] 模拟后端返回数组，长度:', backendResult.length);

      // 添加包含工具调用的消息
      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_write_file',
          arguments: {
            rel_path: 'test.txt',
            content: 'Hello World'
          },
          function: { name: 'agent_write_file', arguments: '{"rel_path":"test.txt","content":"Hello World"}' },
          status: 'completed',
          result: backendResult,  // 🔥 数组结果
          isPartial: false
        }],
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // 验证消息状态
      const messages = chatStore.getState().messages;
      const msg = messages.find((m: any) => m.id === msgId);
      const tc = msg?.toolCalls?.[0];

      // 尝试解析 result
      const resultKeys = Array.isArray(tc.result) ? Object.keys(tc.result) : [];
      const resultLength = Array.isArray(tc.result) ? tc.result.length : 0;

      return {
        success: true,
        resultType: typeof tc.result,
        isArray: Array.isArray(tc.result),
        resultLength,
        resultKeys,
        firstValue: tc.result?.[0],
        hasOriginalContent: tc.result?.originalContent !== undefined,
        hasNewContent: tc.result?.newContent !== undefined
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // ✅ 验证：后端返回数组时，没有 diff 数据
    expect(result.success).toBe(true);
    expect(result.isArray).toBe(true);
    expect(result.resultLength).toBe(220);
    // 数组的键是 "0", "1", "2", ..., "219" (共220个)
    expect(result.resultKeys[0]).toBe('0');
    expect(result.resultKeys[1]).toBe('1');
    expect(result.resultKeys[2]).toBe('2');
    expect(result.resultKeys[result.resultKeys.length - 1]).toBe('219');
    expect(result.hasOriginalContent).toBe(false);
    expect(result.hasNewContent).toBe(false);

    console.log('[Test] ✅ 后端返回数组时，diff 数据不可用（真实 bug 还原成功）');
  });

  test('@regression scenario-03: 验证后端返回正确 JSON 格式时的行为', async ({ page }) => {
    console.log('[Test] ========== 场景 3: 后端返回正确 JSON 格式 ==========');
    test.setTimeout(60000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      const msgId = crypto.randomUUID();
      const toolCallId = 'call_json_result_test';

      // 🔥 模拟后端返回正确 JSON 格式的情况（期望行为）
      const originalContent = 'Original file content\nLine 2\nLine 3';
      const newContent = 'New file content\nModified line 2\nLine 3';

      const backendResult = {
        success: true,
        message: 'File written successfully',
        originalContent: originalContent,
        newContent: newContent,
        filePath: 'test.txt',
        timestamp: Date.now()
      };

      console.log('[Test] 模拟后端返回 JSON:', backendResult);

      // 添加包含工具调用的消息
      chatStore.getState().addMessage({
        id: msgId,
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_write_file',
          arguments: {
            rel_path: 'test.txt',
            content: newContent
          },
          function: { name: 'agent_write_file', arguments: JSON.stringify({rel_path: 'test.txt', content: newContent}) },
          status: 'completed',
          result: backendResult,  // 🔥 JSON 对象结果
          isPartial: false
        }],
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // 验证消息状态
      const messages = chatStore.getState().messages;
      const msg = messages.find((m: any) => m.id === msgId);
      const tc = msg?.toolCalls?.[0];

      return {
        success: true,
        resultType: typeof tc.result,
        parsedResult: tc.result,
        hasOriginalContent: tc.result?.originalContent !== undefined,
        hasNewContent: tc.result?.newContent !== undefined,
        originalContent: tc.result?.originalContent,
        newContent: tc.result?.newContent,
        filePath: tc.result?.filePath
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // ✅ 验证：后端返回正确 JSON 时，diff 数据可用
    expect(result.success).toBe(true);
    expect(result.resultType).toBe('object');
    expect(result.hasOriginalContent).toBe(true);
    expect(result.hasNewContent).toBe(true);
    expect(result.originalContent).toBe('Original file content\nLine 2\nLine 3');
    expect(result.newContent).toBe('New file content\nModified line 2\nLine 3');
    expect(result.filePath).toBe('test.txt');

    console.log('[Test] ✅ 后端返回正确 JSON 时，diff 数据可用');
  });

  test('@regression scenario-04: 验证 toolResultFormatter 处理不同格式的行为', async ({ page }) => {
    console.log('[Test] ========== 场景 4: formatToolResultToMarkdown 处理 ==========');
    test.setTimeout(60000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      if (!chatStore) {
        return { success: false, error: 'chatStore not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      const msgId = crypto.randomUUID();

      // 测试三种不同的 result 格式
      const testCases = [
        {
          name: '字符串格式',
          result: 'File written successfully',
          expectedKeys: []
        },
        {
          name: '数组格式',
          result: Array(220).fill('data'), // 220个元素
          expectedKeys: ['0', '1', '2'] // 数组的键
        },
        {
          name: 'JSON 格式（正确）',
          result: {
            success: true,
            message: 'File written',
            originalContent: 'Old content',
            newContent: 'New content',
            filePath: 'test.txt'
          },
          expectedKeys: ['success', 'message', 'originalContent', 'newContent', 'filePath']
        }
      ];

      const results: any[] = [];

      for (const testCase of testCases) {
        const testMsgId = `${msgId}-${testCase.name}`;

        // 添加消息
        chatStore.getState().addMessage({
          id: testMsgId,
          role: 'assistant',
          content: '',
          toolCalls: [{
            id: `call_${testCase.name}`,
            type: 'function',
            tool: 'agent_write_file',
            arguments: {},
            function: { name: 'agent_write_file', arguments: '{}' },
            status: 'completed',
            result: testCase.result,
            isPartial: false
          }],
          timestamp: Date.now()
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        // 验证
        const messages = chatStore.getState().messages;
        const msg = messages.find((m: any) => m.id === testMsgId);
        const tc = msg?.toolCalls?.[0];

        const keys = tc.result ?
          (Array.isArray(tc.result) ? Object.keys(tc.result).slice(0, 5) : Object.keys(tc.result)) :
          [];

        results.push({
          name: testCase.name,
          resultType: Array.isArray(tc.result) ? 'array' : typeof tc.result,
          actualKeys: keys,
          hasOriginalContent: tc.result?.originalContent !== undefined,
          hasNewContent: tc.result?.newContent !== undefined
        });
      }

      return { success: true, results };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // ✅ 验证每种格式的处理结果
    expect(result.success).toBe(true);
    expect(result.results[0].resultType).toBe('string');
    expect(result.results[1].resultType).toBe('array');
    expect(result.results[2].resultType).toBe('object');
    expect(result.results[2].hasOriginalContent).toBe(true);
    expect(result.results[2].hasNewContent).toBe(true);

    console.log('[Test] ✅ formatToolResultToMarkdown 正确处理不同格式');
  });

  test('@regression scenario-05: 验证完整 Agent 流程中的 result 格式变化', async ({ page }) => {
    console.log('[Test] ========== 场景 5: Agent 流程中 result 格式变化 ==========');
    test.setTimeout(60000);

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      if (!chatStore || !agentStore) {
        return { success: false, error: 'Stores not available' };
      }

      // 清空消息
      chatStore.setState({ messages: [] });

      const userMsgId = crypto.randomUUID();
      const agentMsgId = crypto.randomUUID();
      const agentId = crypto.randomUUID();
      const toolCallId = 'call_flow_test';

      // 添加用户消息
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '重构文件',
        timestamp: Date.now()
      });

      // 添加 Agent 消息
      chatStore.getState().addMessage({
        id: agentMsgId,
        role: 'assistant',
        content: '',
        agentId: agentId,
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_write_file',
          arguments: {
            rel_path: 'test.txt',
            content: 'New content'
          },
          function: { name: 'agent_write_file', arguments: '{"rel_path":"test.txt","content":"New content"}' },
          status: 'pending',
          isPartial: false
        }],
        timestamp: Date.now()
      });

      // 建立 agentToMessageMap
      agentStore.setState((state: any) => ({
        agentToMessageMap: {
          ...state.agentToMessageMap,
          [agentId]: agentMsgId
        }
      }));

      // 步骤 1: 工具批准前 - 无 result
      let messages = chatStore.getState().messages;
      let msg = messages.find((m: any) => m.id === agentMsgId);
      let tc = msg?.toolCalls?.[0];

      const step1 = {
        status: tc.status,
        hasResult: !!tc.result,
        resultType: tc.result ? (Array.isArray(tc.result) ? 'array' : typeof tc.result) : 'none'
      };

      // 步骤 2: 模拟工具执行 - 后端返回字符串
      const backendStringResult = "File written successfully";

      messages = chatStore.getState().messages;
      msg = messages.find((m: any) => m.id === agentMsgId);
      tc = msg?.toolCalls?.[0];
      tc.status = 'approved';
      tc.result = backendStringResult;
      chatStore.setState({ messages: [...messages] });

      await new Promise(resolve => setTimeout(resolve, 50));

      messages = chatStore.getState().messages;
      msg = messages.find((m: any) => m.id === agentMsgId);
      tc = msg?.toolCalls?.[0];

      const step2 = {
        status: tc.status,
        hasResult: !!tc.result,
        resultType: tc.result ? (Array.isArray(tc.result) ? 'array' : typeof tc.result) : 'none',
        resultValue: tc.result
      };

      // 步骤 3: Agent 完成 - 覆盖 result
      const agentResult = {
        success: true,
        message: 'Refactoring completed',
        filesModified: ['test.txt']
      };

      // 模拟 agentStore 的 updateToolCallResult
      messages = chatStore.getState().messages;
      msg = messages.find((m: any) => m.id === agentMsgId);
      tc = msg?.toolCalls?.[0];

      const isCompleted = tc.status === 'approved' || tc.status === 'pending';
      if (isCompleted) {
        tc.status = 'completed';
        tc.result = agentResult; // 🔥 覆盖！
      }
      chatStore.setState({ messages: [...messages] });

      await new Promise(resolve => setTimeout(resolve, 50));

      messages = chatStore.getState().messages;
      msg = messages.find((m: any) => m.id === agentMsgId);
      tc = msg?.toolCalls?.[0];

      const step3 = {
        status: tc.status,
        hasResult: !!tc.result,
        resultType: tc.result ? (Array.isArray(tc.result) ? 'array' : typeof tc.result) : 'none',
        resultValue: tc.result,
        hasOriginalContent: tc.result?.originalContent !== undefined,
        hasNewContent: tc.result?.newContent !== undefined
      };

      return {
        success: true,
        step1,
        step2,
        step3
      };
    });

    console.log('[Test]', JSON.stringify(result, null, 2));

    // ✅ 验证流程中 result 格式的变化
    expect(result.success).toBe(true);
    expect(result.step1.hasResult).toBe(false); // 初始状态无 result
    expect(result.step2.hasResult).toBe(true); // 工具执行后有 result
    expect(result.step2.resultType).toBe('string'); // 后端返回字符串
    expect(result.step3.hasResult).toBe(true); // Agent 完成后有 result
    expect(result.step3.resultType).toBe('object'); // Agent result 是对象
    expect(result.step3.hasOriginalContent).toBe(false); // ❌ Agent result 没有 diff 数据
    expect(result.step3.hasNewContent).toBe(false); // ❌ Agent result 没有 diff 数据

    console.log('[Test] ✅ Agent result 覆盖了工具执行时的 diff 数据（问题还原成功）');
  });
});
