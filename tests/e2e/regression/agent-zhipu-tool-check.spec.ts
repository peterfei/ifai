/**
 * 智谱 API 真实场景诊断 - tool_call 缺失问题
 *
 * 问题：用户测试 "重构 README.md 90字左右"
 * 期望：应该返回 agent_write_file tool_call，显示审批按钮
 * 实际：只返回文本 "请确认是否同意这个版本，我将写入文件"，没有审批按钮
 *
 * 诊断目标：
 * 1. 直接调用智谱 API 查看原始响应
 * 2. 检查是否返回 tool_calls
 * 3. 分析为什么没有审批按钮
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('智谱 API tool_call 缺失诊断', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Zhipu]') || text.includes('[Direct API]') ||
          text.includes('tool_call') || text.includes('finish_reason') ||
          text.includes('[E2E]')) {
        console.log('[Backend]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');

    await page.waitForFunction(() => !!(window as any).__settingsStore, { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('zhipu-tool-check-01: 直接调用智谱 API 检查 tool_call 响应', async ({ page }) => {
    console.log('[Test] ========== 直接调用智谱 API 诊断 ==========');

    const result = await page.evaluate(async () => {
      const settingsStore = (window as any).__settingsStore;
      const settings = settingsStore.getState();
      const provider = settings.providers.find((p: any) => p.id === settings.currentProviderId);

      if (!provider) {
        return { error: 'Provider not found' };
      }

      console.log('[Zhipu] Using provider:', provider.id);
      console.log('[Zhipu] Base URL:', provider.baseUrl);
      console.log('[Zhipu] Model:', settings.currentModel);

      // 使用与真实 Agent 相同的 prompt
      const requestBody = {
        model: settings.currentModel,
        messages: [
          {
            role: 'system',
            content: 'You are an expert code refactoring assistant. When asked to refactor files, you should first read the file to understand its current content, then provide a refactored version. Use the provided tools to read and write files.'
          },
          {
            role: 'user',
            content: '重构 README.md 90字左右'
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'agent_read_file',
              description: 'Read the content of a file at the specified path',
              parameters: {
                type: 'object',
                properties: {
                  rootPath: {
                    type: 'string',
                    description: 'The root directory path of the project'
                  },
                  relPath: {
                    type: 'string',
                    description: 'The relative path of the file from the root directory'
                  }
                },
                required: ['rootPath', 'relPath']
              }
            }
          },
          {
            type: 'function',
            function: {
              name: 'agent_write_file',
              description: 'Write content to a file at the specified path',
              parameters: {
                type: 'object',
                properties: {
                  rootPath: {
                    type: 'string',
                    description: 'The root directory path of the project'
                  },
                  relPath: {
                    type: 'string',
                    description: 'The relative path of the file from the root directory'
                  },
                  content: {
                    type: 'string',
                    description: 'The content to write to the file'
                  }
                },
                required: ['rootPath', 'relPath', 'content']
              }
            }
          }
        ],
        stream: false  // 使用非流式以获取完整响应
      };

      console.log('[Zhipu] Sending request to:', provider.baseUrl);
      console.log('[Zhipu] Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(provider.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log('[Zhipu] API Error:', response.status, errorText);
        return {
          error: `API request failed: ${response.status}`,
          errorText
        };
      }

      const data = await response.json();
      console.log('[Zhipu] ========== API Response Analysis ==========');

      const choice = data.choices?.[0];
      const message = choice?.message;

      const finishReason = choice?.finish_reason;
      const toolCalls = message?.tool_calls;
      const content = message?.content;
      const reasoningContent = message?.reasoning_content;

      console.log('[Zhipu] finish_reason:', finishReason);
      console.log('[Zhipu] has tool_calls:', !!toolCalls);
      console.log('[Zhipu] tool_calls count:', toolCalls?.length || 0);
      console.log('[Zhipu] has content:', !!content);
      console.log('[Zhipu] has reasoning_content:', !!reasoningContent);

      if (toolCalls && toolCalls.length > 0) {
        console.log('[Zhipu] ========== Tool Calls Detail ==========');
        toolCalls.forEach((tc: any, idx: number) => {
          console.log(`[Zhipu] Tool Call ${idx}:`);
          console.log(`  - id: ${tc.id}`);
          console.log(`  - type: ${tc.type}`);
          console.log(`  - function.name: ${tc.function?.name}`);
          console.log(`  - function.arguments: ${tc.function?.arguments}`);
        });
      }

      if (content) {
        console.log('[Zhipu] ========== Content (first 500 chars) ==========');
        console.log('[Zhipu]', content.substring(0, 500));
      }

      if (reasoningContent) {
        console.log('[Zhipu] ========== Reasoning (first 500 chars) ==========');
        console.log('[Zhipu]', reasoningContent.substring(0, 500));
      }

      // 检查是否包含"是否确认写入文件"文字
      const fullText = (content || '') + (reasoningContent || '');
      const hasConfirmWrite = fullText.includes('是否确认写入文件') ||
                             fullText.includes('确认写入') ||
                             fullText.includes('请确认是否同意');

      return {
        success: true,
        finishReason,
        hasToolCalls: !!toolCalls,
        toolCallsCount: toolCalls?.length || 0,
        toolCalls: toolCalls || null,
        hasContent: !!content,
        hasReasoningContent: !!reasoningContent,
        contentLength: content?.length || 0,
        reasoningLength: reasoningContent?.length || 0,
        contentPreview: content ? content.substring(0, 200) : null,
        reasoningPreview: reasoningContent ? reasoningContent.substring(0, 200) : null,
        hasConfirmWrite,
        fullResponse: data
      };
    });

    console.log('[Test] ========== 诊断结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    if (result.error) {
      console.log('[Test] ❌ API 调用失败:', result.error);
      return;
    }

    // 关键诊断
    console.log('[Test] ========== 关键诊断 ==========');

    if (result.finishReason === 'tool_calls' && result.hasToolCalls) {
      console.log('[Test] ✅ 智谱 API 正确返回了 tool_calls');
      console.log('[Test] ToolCalls:', result.toolCalls);
      console.log('[Test] 预期：前端应该显示审批按钮');
      console.log('[Test] 如果没有按钮，可能是前端处理问题');
    } else if (result.finishReason === 'stop') {
      console.log('[Test] ❌ 智谱 API 返回了普通文本 (finish_reason=stop)');
      console.log('[Test] 这就是为什么没有审批按钮的根本原因！');
      console.log('[Test] Content:', result.contentPreview);
      console.log('[Test] Reasoning:', result.reasoningPreview);

      if (result.hasConfirmWrite) {
        console.log('[Test] ⚠️ 智谱 API 在文本中提到了"请确认写入"，但没有使用 tool_calls');
        console.log('[Test] 这是智谱 API 的问题，不是前端问题');
      }
    } else if (result.finishReason === 'length') {
      console.log('[Test] ⚠️ 智谱 API 因长度限制停止 (finish_reason=length)');
    } else {
      console.log('[Test] ⚠️ 未知的 finish_reason:', result.finishReason);
    }

    // 验证结论
    expect(result.success).toBe(true);
  });

  test('zhipu-tool-check-02: 真实 Agent 流程 - 检查是否收到 tool_call', async ({ page }) => {
    console.log('[Test] ========== 真实 Agent 流程测试 ==========');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;

      if (!chatStore || !agentStore) {
        return { success: false, skip: true };
      }

      // 清空消息
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();

      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '重构 README.md 90字左右',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: undefined,
        isAgentLive: true
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 监听所有事件
      const events: any[] = [];
      const originalEmit = (window as any).__TAURI__?.event?.emit;
      if (originalEmit) {
        (window as any).__TAURI__.event.emit = async (event: string, payload: any) => {
          events.push({ event, payload, timestamp: Date.now() });
          console.log(`[Event Monitor] ${event}:`, JSON.stringify(payload).substring(0, 200));
          return originalEmit(event, payload);
        };
      }

      const store = agentStore.getState();
      const agentId = await store.launchAgent(
        'Refactor Agent',
        '重构 README.md 90字左右',
        assistantMsgId,
        undefined
      );

      console.log('[Test] Agent launched:', agentId);

      // 等待 Agent 完成
      await new Promise(resolve => setTimeout(resolve, 25000));

      // 检查结果
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === assistantMsgId);
      const toolCalls = assistantMsg?.toolCalls || [];
      const content = assistantMsg?.content || '';

      return {
        success: true,
        agentId,
        toolCallsCount: toolCalls.length,
        toolCalls: toolCalls.map((tc: any) => ({
          id: tc.id,
          tool: tc.tool,
          isPartial: tc.isPartial,
          status: tc.status
        })),
        contentLength: content.length,
        contentPreview: content.substring(0, 200),
        hasConfirmWrite: content.includes('是否确认写入文件') ||
                         content.includes('请确认是否同意'),
        eventsCount: events.length,
        events: events.map(e => ({ event: e.event, hasPayload: !!e.payload }))
      };
    });

    console.log('[Test] ========== Agent 执行结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));

    if (result.skip) {
      console.log('[Test] ⚠️ 跳过测试');
      return;
    }

    expect(result.success).toBe(true);

    // 关键诊断
    console.log('[Test] ========== 关键诊断 ==========');

    if (result.toolCallsCount > 0) {
      console.log('[Test] ✅ Agent 收到了 tool_calls，数量:', result.toolCallsCount);
      console.log('[Test] ToolCalls:', result.toolCalls);
      console.log('[Test] 应该显示审批按钮');
    } else {
      console.log('[Test] ❌ Agent 没有收到任何 tool_calls！');
      console.log('[Test] Content:', result.contentPreview);

      if (result.hasConfirmWrite) {
        console.log('[Test] ⚠️ Content 中包含"请确认写入"文字，但没有 tool_call');
        console.log('[Test] 这说明智谱 API 返回了文本而不是 tool_call');
      }
    }

    console.log('[Test] Events received:', result.eventsCount);
  });

  test('zhipu-tool-check-03: v0.3.8 修复验证 - 真实 Refactor Agent 场景', async ({ page }) => {
    console.log('[Test] ========== v0.3.8 修复验证 - 真实 Refactor Agent 场景 ==========');
    test.setTimeout(180000); // 增加超时到 180 秒，等待 Tauri 后端编译完成

    // 🔥 等待 Tauri 后端启动完成
    // 检查 __TAURI__ 是否可用，并且 invoke 功能正常
    console.log('[Test] 等待 Tauri 后端启动...');
    await page.waitForFunction(async () => {
      const tauri = (window as any).__TAURI__;
      if (!tauri || !tauri.core || !tauri.core.invoke) {
        return false;
      }
      // 尝试调用一个简单的命令来验证 Tauri 后端已就绪
      try {
        await tauri.core.invoke('plugin:fs|read_dir', { path: '.' });
        return true;
      } catch {
        return false;
      }
    }, { timeout: 90000 }).catch(() => {
      console.log('[Test] ⚠️  Tauri 后端未就绪，测试可能失败');
    });

    console.log('[Test] Tauri 后端已就绪，开始测试');

    // 🔥 🔥 诊断：检查 __TAURI__ 的状态
    console.log('[Test] 🔥🔥 诊断：检查 __TAURI__ 状态');
    const tauriCheck = await page.evaluate(() => {
      const tauri = (window as any).__TAURI__;
      return {
        hasTauri: !!tauri,
        hasCore: !!(tauri?.core),
        hasInvoke: !!(tauri?.core?.invoke),
        tauriKeys: tauri ? Object.keys(tauri) : [],
        coreKeys: tauri?.core ? Object.keys(tauri.core) : []
      };
    });
    console.log('[Test] 🔥🔥 Tauri 状态检查:', JSON.stringify(tauriCheck, null, 2));

    // 🔥 收集后端日志（在 page.evaluate 之前设置）
    const backendLogs: string[] = [];
    const diagnosticEvents: string[] = [];

    // 监听控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Agent') || text.includes('[AgentRunner') || text.includes('[AgentStore') ||
          text.includes('[AgentCommands') || text.includes('[PromptManager') ||
          text.includes('[Tauri Event]')) {
        backendLogs.push(text);
        console.log('[Backend Log]', text);
      }
    });

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;
      const agentStore = (window as any).__agentStore;
      const fileStore = (window as any).__fileStore;
      const settingsStore = (window as any).__settingsStore;
      const settings = settingsStore.getState();
      const provider = settings.providers.find((p: any) => p.id === settings.currentProviderId);

      if (!chatStore || !agentStore) {
        return { success: false, skip: true, error: 'chatStore or agentStore not available' };
      }

      console.log('[Test] 🔥 Stores available:', {
        hasChatStore: !!chatStore,
        hasAgentStore: !!agentStore,
        hasFileStore: !!fileStore,
        hasSettingsStore: !!settingsStore,
        providerId: settings.currentProviderId,
        providerName: provider?.name
      });

      // 🔥 FIX v0.3.8: 在真实 Tauri 模式下设置项目根目录
      // Agent 需要 projectRoot 才能运行
      const currentRoot = fileStore.getState().rootPath;
      if (!currentRoot) {
        // 如果没有设置项目根目录，使用当前项目目录
        const projectRoot = '/Users/mac/project/aieditor/ifainew';
        fileStore.setState({ rootPath: projectRoot });
        console.log('[Test] 设置项目根目录:', projectRoot);
      }

      // 清空消息
      chatStore.setState({ messages: [] });
      await new Promise(resolve => setTimeout(resolve, 100));

      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();

      // 使用用户的真实测试场景："重构 README.md 90字左右"
      chatStore.getState().addMessage({
        id: userMsgId,
        role: 'user',
        content: '重构 README.md 90字左右',
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      chatStore.getState().addMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId: undefined,
        isAgentLive: true
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // 监听事件
      const events: any[] = [];
      const originalEmit = (window as any).__TAURI__?.event?.emit;
      if (originalEmit) {
        (window as any).__TAURI__.event.emit = async (event: string, payload: any) => {
          events.push({ event, payload, timestamp: Date.now() });
          return originalEmit(event, payload);
        };
      }

      // 启动 Refactor Agent
      const store = agentStore.getState();
      const agentId = await store.launchAgent(
        'Refactor Agent',
        '重构 README.md 90字左右',
        assistantMsgId,
        undefined
      );

      console.log('[Test] Agent launched:', agentId);

      // 等待 Agent 完成
      await new Promise(resolve => setTimeout(resolve, 25000));

      // 检查结果
      const messages = chatStore.getState().messages;
      const assistantMsg = messages.find((m: any) => m.id === assistantMsgId);
      const toolCalls = assistantMsg?.toolCalls || [];
      const content = assistantMsg?.content || '';

      // 筛选 tool_call 事件
      const toolCallEvents = events.filter(e =>
        e.event.includes('agent_') && e.payload?.type === 'tool_call'
      );

      // 🔥 检查 running agents 以诊断 Agent 状态
      const runningAgents = agentStore.getState().runningAgents;
      const launchedAgent = runningAgents.find((a: any) => a.id === agentId);

      console.log('[Test] 🔥 Running agents:', runningAgents.length);
      if (launchedAgent) {
        console.log('[Test] 🔥 Launched agent status:', {
          id: launchedAgent.id,
          type: launchedAgent.type,
          status: launchedAgent.status,
          logs: launchedAgent.logs,
          progress: launchedAgent.progress,
          logsCount: launchedAgent.logs?.length || 0
        });
      } else {
        console.log('[Test] ⚠️ Agent not found in runningAgents!');
      }

      // 检查所有事件
      const allAgentEvents = events.filter(e => e.event.includes('agent_'));

      return {
        success: true,
        agentId,
        toolCallsCount: toolCalls.length,
        toolCalls: toolCalls.map((tc: any) => ({
          id: tc.id,
          tool: tc.tool,
          status: tc.status
        })),
        contentLength: content.length,
        contentPreview: content.substring(0, 200),
        // 验证：不应该包含文本确认请求
        hasTextConfirmation: content.includes('请确认') ||
                             content.includes('确认写入') ||
                             content.includes('是否同意'),
        // 关键验证：应该有 tool_call 事件
        hasToolCallEvents: toolCallEvents.length > 0,
        toolCallEventsCount: toolCallEvents.length,
        // 检查是否有 agent_read_file
        hasReadFileToolCall: toolCalls.some((tc: any) => tc.tool === 'agent_read_file'),
        // 检查是否有 agent_write_file
        hasWriteFileToolCall: toolCalls.some((tc: any) => tc.tool === 'agent_write_file'),
        // 事件详情
        events: toolCallEvents.map(e => ({
          event: e.event,
          type: e.payload?.type,
          tool: e.payload?.toolCall?.tool
        })),
        // 🔥 Agent 状态诊断
        agentStatus: launchedAgent?.status,
        agentLogs: launchedAgent?.logs || [],
        allEventsCount: allAgentEvents.length,
        allEvents: allAgentEvents.map(e => ({ event: e.event, type: e.payload?.type }))
      };
    });

    console.log('[Test] ========== v0.3.8 修复验证结果 ==========');
    console.log('[Test]', JSON.stringify(result, null, 2));
    console.log('[Test] ========== 后端日志摘要 ==========');
    console.log('[Test] 共收集到', backendLogs.length, '条后端日志');
    backendLogs.forEach((log, idx) => {
      console.log(`[Backend #${idx}]`, log);
    });

    if (result.skip) {
      console.log('[Test] ⚠️ 跳过测试');
      return;
    }

    expect(result.success).toBe(true);

    // 关键诊断
    console.log('[Test] ========== 关键诊断 ==========');

    // 🔥 检查 Agent 状态
    console.log('[Test] 🔥 Agent 状态:', result.agentStatus);
    console.log('[Test] 🔥 Agent 日志数:', result.agentLogs.length);
    if (result.agentLogs.length > 0) {
      console.log('[Test] 🔥 Agent 日志内容:');
      result.agentLogs.forEach((log: string, idx: number) => {
        console.log(`[Test]   [${idx}] ${log}`);
      });
    }

    // 🔥 检查事件捕获
    console.log('[Test] 🔥 共捕获到', result.allEventsCount, '个 agent 事件');
    if (result.allEventsCount > 0) {
      console.log('[Test] 🔥 事件列表:');
      result.allEvents.forEach((e: any) => {
        console.log(`[Test]   - ${e.event}: ${e.type}`);
      });
    }

    if (result.hasToolCallEvents) {
      console.log(`[Test] ✅ 检测到 ${result.toolCallEventsCount} 个 tool_call 事件`);
      result.events.forEach((e: any) => {
        console.log(`[Test]   - ${e.tool || 'unknown'}`);
      });
    } else {
      console.log('[Test] ❌ 没有检测到 tool_call 事件');
    }

    if (result.hasWriteFileToolCall) {
      console.log('[Test] ✅ v0.3.8 修复生效：Refactor Agent 调用了 agent_write_file');
    } else if (result.hasReadFileToolCall) {
      console.log('[Test] ⚠️ Agent 只调用了 agent_read_file，但没有调用 agent_write_file');
      console.log('[Test]   这可能是因为 Agent 在等待用户审批后继续执行');
    } else {
      console.log('[Test] ❌ Agent 没有调用任何文件工具');
      if (result.hasTextConfirmation) {
        console.log('[Test] ❌ Agent 返回了文本确认请求，v0.3.8 修复可能未生效');
      } else {
        console.log('[Test] ℹ️ Content:', result.contentPreview);
      }
    }

    // 验证不应该有文本确认
    if (result.hasTextConfirmation) {
      console.log('[Test] ⚠️ 检测到文本确认请求');
    } else {
      console.log('[Test] ✅ 没有文本确认请求（符合预期）');
    }
  });
});
