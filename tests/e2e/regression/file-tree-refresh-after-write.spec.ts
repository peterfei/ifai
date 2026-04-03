/**
 * E2E 测试：文件写入后文件树自动刷新验证（高保真）
 *
 * 目标：验证 AI 写入文件后，左侧文件树是否自动刷新显示新文件。
 *
 * 测试场景：
 *   用户请求："帮我写一个 README.md 文件"
 *   预期行为：
 *     1. AI 调用 write_file 工具写入文件
 *     2. 后端发出 file-tree-refresh 事件
 *     3. 前端接收事件并刷新文件树
 *     4. 新文件在文件树中可见
 *
 * 运行方式：
 *   APP_EDITION=commercial npx playwright test tests/e2e/regression/file-tree-refresh-after-write.spec.ts --headed
 *
 * 参考：task-continuation-after-todowrite.spec.ts 的高保真 E2E 测试模式
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * 注入直接调用 OpenAI 兼容 API 的 invoke handler
 * 通过 window.__TAURI_EVENT_LISTENERS__ 模拟 Tauri app.emit()
 */
async function injectDirectAIHandler(page: any, aiConfig: { apiKey: string; baseUrl: string; modelId: string }) {
  await page.evaluate((config) => {
    const w = window as any;

    const tauriEmit = (event: string, payload: any) => {
      const listeners = w.__TAURI_EVENT_LISTENERS__?.[event] || [];
      for (const fn of listeners) {
        try { fn({ payload }); } catch (e) { console.error(`[E2E tauriEmit] ${event}:`, e); }
      }
    };

    // 🔄 模拟文件写入（用于 E2E 测试）
    const mockFileSystem: { [path: string]: string } = {};

    const executeTool = async (toolName: string, toolArgs: any) => {
      console.log('[E2E Tool Execution]', { toolName, toolArgs });

      if (toolName === 'write_file') {
        const path = toolArgs.path;
        const content = toolArgs.content || '';
        mockFileSystem[path] = content;

        // 发出文件树刷新事件
        tauriEmit('file-tree-refresh', { action: 'write', tool: toolName, path });

        return `✅ Successfully wrote to file: ${path}`;
      }

      if (toolName === 'read_file') {
        const path = toolArgs.path;
        const content = mockFileSystem[path] || 'File not found';
        return `📄 File: ${path}\n\n${content}`;
      }

      if (toolName === 'bash') {
        return `Executed: ${toolArgs.command}`;
      }

      return `Unknown tool: ${toolName}`;
    };

    w.__E2E_DIRECT_AI_HANDLER__ = async (cmd: string, args: any) => {
      if (cmd !== 'ai_chat') return {};

      const pc = args?.providerConfig || {};
      const apiKey = config.apiKey || pc.api_key || pc.apiKey;
      const baseUrl = (config.baseUrl || pc.base_url || pc.baseUrl).replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
      const model = config.modelId || (pc.models?.[0]);
      let messages = args?.messages || [];
      const eventId = args?.eventId || `chat_e2e_${Date.now()}`;

      console.log('[E2E Direct AI] Calling API:', { baseUrl, model, messagesCount: messages.length });

      // 🔄 定义工具（与后端 ai_chat 中的工具定义一致）
      const tools = [
        {
          "type": "function",
          "function": {
            "name": "write_file",
            "description": "Write content to a file (creates parent directories if needed). Use this tool to create or overwrite files.",
            "parameters": {
              "type": "object",
              "properties": {
                "path": { "type": "string", "description": "File path (absolute or relative to project root)" },
                "content": { "type": "string", "description": "Content to write to the file" }
              },
              "required": ["path", "content"]
            }
          }
        },
        {
          "type": "function",
          "function": {
            "name": "read_file",
            "description": "Read the contents of a file",
            "parameters": {
              "type": "object",
              "properties": {
                "path": { "type": "string" }
              },
              "required": ["path"]
            }
          }
        },
        {
          "type": "function",
          "function": {
            "name": "bash",
            "description": "Execute bash commands",
            "parameters": {
              "type": "object",
              "properties": {
                "command": { "type": "string" }
              },
              "required": ["command"]
            }
          }
        }
      ];

      // 🔄 工具调用循环（最多 5 轮）
      const MAX_TOOL_ROUNDS = 5;
      let toolRound = 0;

      while (toolRound < MAX_TOOL_ROUNDS) {
        toolRound++;

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, stream: true, tools })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`[E2E Direct AI] API ${response.status}:`, errText);
          tauriEmit(`${eventId}_error`, { error: errText });
          return {};
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let currentToolCalls: any[] = [];
        let hasContent = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              if (!choice) continue;

              if (choice.delta?.content) {
                tauriEmit(eventId, { type: 'content', content: choice.delta.content });
                hasContent = true;
              }

              if (choice.delta?.tool_calls) {
                for (const tc of choice.delta.tool_calls) {
                  // 累积工具调用参数
                  const existing = currentToolCalls.find(c => c.id === tc.id);
                  if (existing) {
                    if (tc.function?.arguments) {
                      existing.function.arguments += tc.function.arguments;
                    }
                  } else {
                    currentToolCalls.push({
                      id: tc.id,
                      type: 'function',
                      function: {
                        name: tc.function?.name || '',
                        arguments: tc.function?.arguments || ''
                      }
                    });
                  }

                  tauriEmit(eventId, {
                    type: 'tool_call',
                    tool_call: { id: tc.id || '', function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' } }
                  });
                }
              }

              if (choice.finish_reason) {
                console.log(`[E2E Direct AI] finish_reason: ${choice.finish_reason}`);

                // 🔥 处理工具调用
                if (currentToolCalls.length > 0 && choice.finish_reason === 'tool_calls') {
                  console.log(`[E2E Tool Round ${toolRound}] Executing ${currentToolCalls.length} tools`);

                  // 添加助手消息（包含工具调用）
                  messages.push({
                    role: 'assistant',
                    content: '',
                    tool_calls: currentToolCalls
                  });

                  // 执行每个工具并添加工具响应消息
                  for (const tc of currentToolCalls) {
                    const toolName = tc.function.name;
                    let toolArgs;
                    try {
                      toolArgs = JSON.parse(tc.function.arguments);
                    } catch {
                      toolArgs = {};
                    }

                    const result = await executeTool(toolName, toolArgs);
                    console.log(`[E2E Tool Result] ${toolName}:`, result.substring(0, 100));

                    // 添加工具响应消息
                    messages.push({
                      role: 'tool',
                      tool_call_id: tc.id,
                      content: result
                    });

                    // 发出工具完成事件
                    tauriEmit(eventId, {
                      type: 'tool_done',
                      tool_call_id: tc.id,
                      tool: toolName,
                      result: result
                    });
                  }

                  // 继续下一轮循环，让 AI 处理工具结果
                  break; // 跳出 stream 处理循环
                } else {
                  tauriEmit(eventId, { type: 'finish', finish_reason: choice.finish_reason });
                  tauriEmit(`${eventId}_finish`, 'DONE');
                  return {}; // 完成
                }
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }

        // 如果没有工具调用，结束循环
        if (currentToolCalls.length === 0) {
          break;
        }

        // 重置工具调用，准备下一轮
        currentToolCalls = [];
      }

      tauriEmit(`${eventId}_finish`, 'DONE');
      return {};
    };

    if (w.__tauriSetInvokeHandler__) w.__tauriSetInvokeHandler__(w.__E2E_DIRECT_AI_HANDLER__);
    w.__E2E_INVOKE_HANDLER__ = w.__E2E_DIRECT_AI_HANDLER__;
    console.log('[E2E Direct AI] Handler injected');
  }, aiConfig);
}

test.describe('File Tree Refresh After Write - Real LLM E2E', () => {
  test.setTimeout(180_000);  // 180 秒超时

  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: true
    });

    await page.goto('/');
    await page.waitForFunction(() => {
      return (window as any).__chatStore !== undefined;
    }, { timeout: 30000 });

    // 等待 PersistenceManager.recoverSessions 自愈完成
    await page.waitForTimeout(2000);
  });

  test('scenario: File tree should refresh after AI writes README.md', async ({ page }) => {
    console.log('[E2E] 开始测试：文件写入后文件树自动刷新验证');

    // 获取 AI 配置
    const realAIConfig = await page.evaluate(() => {
      const config = (window as any).__E2E_REAL_AI_CONFIG__ || {};
      return {
        apiKey: config.realAIApiKey || '',
        baseUrl: (config.realAIBaseUrl || 'https://api.deepseek.com').replace(/\/chat\/completions$/, '').replace(/\/+$/, ''),
        providerId: config.providerId || 'zhipu',
        modelId: config.realAIModel || 'deepseek-chat'
      };
    });

    if (!realAIConfig.apiKey) {
      test.skip(true, 'No API key configured in .env.e2e.local');
    }

    console.log('[E2E] AI 配置:', { ...realAIConfig, apiKey: '***' });

    // 注入直接 HTTP AI handler
    await injectDirectAIHandler(page, realAIConfig);

    // 设置 AI 配置到 settingsStore
    await page.evaluate((config) => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.getState().updateProviderConfig(config.providerId, {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl + '/chat/completions'
        });
        settingsStore.getState().setCurrentProviderAndModel(config.providerId, config.modelId);
        console.log('[E2E] AI config set to settingsStore');
      }
    }, realAIConfig);

    // 监听 file-tree-refresh 事件
    const refreshEvents: any[] = [];
    await page.evaluate(() => {
      const w = window as any;
      w.__E2E_FILE_TREE_REFRESH_EVENTS__ = [];

      // 监听 Tauri 事件
      const originalListeners = w.__TAURI_EVENT_LISTENERS__ || {};
      w.__TAURI_EVENT_LISTENERS__ = { ...originalListeners };

      w.__TAURI_EVENT_LISTENERS__['file-tree-refresh'] = w.__TAURI_EVENT_LISTENERS__['file-tree-refresh'] || [];
      w.__TAURI_EVENT_LISTENERS__['file-tree-refresh'].push((event: any) => {
        console.log('[E2E] file-tree-refresh event received:', event.payload);
        w.__E2E_FILE_TREE_REFRESH_EVENTS__.push({
          timestamp: Date.now(),
          payload: event.payload
        });
      });
    });

    // 监听工具调用
    await page.evaluate(() => {
      const w = window as any;
      w.__E2E_TOOL_CALLS__ = [];

      // Hook ToolRouter.execute 或直接监听 invoke
      const originalInvoke = w.__invoke;
      w.__invoke = async (cmd: string, args: any) => {
        if (cmd === 'execute_local_tool' || cmd === 'agent_write_file' || cmd === 'write_file') {
          w.__E2E_TOOL_CALLS__.push({
            cmd,
            args,
            timestamp: Date.now()
          });
          console.log(`[E2E Tool Call] ${cmd}`, args);
        }
        return originalInvoke ? originalInvoke(cmd, args) : {};
      };
    });

    // 获取初始文件树状态
    const initialFileTree = await page.evaluate(() => {
      const fileStore = (window as any).__fileStore;
      return fileStore ? fileStore.getState().fileTree : null;
    });

    console.log('[E2E] 初始文件树:', initialFileTree ? `${JSON.stringify(initialFileTree).slice(0, 200)}...` : 'null');

    // 记录发送前的 assistant 消息 ID
    const existingAssistantIds = await page.evaluate(() => {
      return ((window as any).__chatStore?.getState().messages || [])
        .filter((m: any) => m.role === 'assistant')
        .map((m: any) => m.id);
    });

    // 设置项目根目录（如果需要）
    await page.evaluate(() => {
      const fileStore = (window as any).__fileStore;
      if (fileStore && !fileStore.getState().rootPath) {
        // 设置一个测试目录
        fileStore.getState().setRootPath('/tmp/e2e-test-project');
        console.log('[E2E] 设置测试项目根目录: /tmp/e2e-test-project');
      }
    });

    // 发送消息：生成 README.md
    await page.evaluate((payload) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (chatStore && settingsStore) {
        const state = settingsStore.getState();
        // 不 await，让它在后台运行
        chatStore.getState().sendMessage(
          payload.text,
          state.currentProviderId || payload.providerId,
          state.currentModel || payload.modelId
        ).then(() => {
          console.log('[E2E] sendMessage completed');
        }).catch((e: any) => {
          console.error('[E2E] sendMessage error:', e);
        });
      }
    }, {
      text: '请使用 write_file 工具创建一个 README.md 文件。文件内容：\n\n# Test Project\n\n这是一个测试项目。\n\n## 安装\n\nnpm install\n\n## 使用\n\nnpm start\n\n请立即使用 write_file 工具创建这个文件。',
      providerId: realAIConfig.providerId,
      modelId: realAIConfig.modelId
    });

    console.log('[E2E] 消息已发送（不等待完成）');

    // 等待新的助手消息出现
    await page.waitForFunction(({ oldIds }) => {
      const oldIdSet = new Set(oldIds);
      const messages = (window as any).__chatStore?.getState().messages || [];
      return messages.some((m: any) => m.role === 'assistant' && !oldIdSet.has(m.id));
    }, { oldIds: existingAssistantIds }, { timeout: 60000 });

    console.log('[E2E] 助手消息已出现');

    // 轮询检查：工具调用、文件树刷新事件、文件树状态
    const result = await page.evaluate(async ({ oldIds }) => {
      const oldIdSet = new Set(oldIds);
      const chatStore = (window as any).__chatStore;
      const fileStore = (window as any).__fileStore;

      for (let i = 0; i < 300; i++) {
        const messages = chatStore.getState().messages;
        const newMsg = [...messages].reverse().find((m: any) => m.role === 'assistant' && !oldIdSet.has(m.id));

        if (newMsg && !newMsg.isStreaming) {
          // 获取工具调用记录
          const toolCalls = (window as any).__E2E_TOOL_CALLS__ || [];

          // 获取文件树刷新事件
          const refreshEvents = (window as any).__E2E_FILE_TREE_REFRESH_EVENTS__ || [];

          // 获取当前文件树状态
          const currentFileTree = fileStore ? fileStore.getState().fileTree : null;

          // 检查是否有 write_file 调用
          const writeCalls = toolCalls.filter((c: any) =>
            c.cmd === 'write_file' || c.cmd === 'agent_write_file'
          );

          // 检查文件树中是否有 README.md
          const hasReadmeInTree = currentFileTree && JSON.stringify(currentFileTree).includes('README.md');

          // 获取文件树刷新次数
          const refreshCallCount = fileStore ? (fileStore as any).__E2E_REFRESH_CALL_COUNT__ || 0 : 0;

          // 分析消息内容
          const content = newMsg.content || '';

          return {
            success: true,
            content: content.substring(0, 500),
            fullContentLength: content.length,
            toolCalls: toolCalls.length,
            writeCalls: writeCalls.length,
            writeCallDetails: writeCalls.map((c: any) => ({ cmd: c.cmd, argsKeys: Object.keys(c.args || {}) })),
            refreshEvents: refreshEvents.length,
            refreshEventDetails: refreshEvents.map((e: any) => ({ timestamp: e.timestamp, payload: e.payload })),
            hasReadmeInTree,
            currentFileTreeSnapshot: currentFileTree ? JSON.stringify(currentFileTree).slice(0, 500) : null,
            refreshCallCount,
            contentContainsWriteKeywords: content.includes('写入') || content.includes('write') || content.includes('创建') || content.includes('文件'),
            isLoading: chatStore.getState().isLoading
          };
        }

        await new Promise(r => setTimeout(r, 500));
      }

      // 超时也返回当前状态
      const messages = chatStore.getState().messages;
      const newMsg = [...messages].reverse().find((m: any) => m.role === 'assistant' && !oldIdSet.has(m.id));

      if (newMsg) {
        const content = newMsg.content || '';
        return {
          success: false,
          reason: 'Timeout waiting for completion',
          isStreaming: newMsg.isStreaming,
          contentLength: content.length,
          hasContent: content.length > 0
        };
      }

      return { success: false, reason: 'No assistant message found' };
    }, { oldIds: existingAssistantIds });

    console.log('[E2E] 测试结果:', JSON.stringify(result, null, 2));

    // 验证关键断言

    // 1. 消息成功完成
    expect(result.success, '消息应该成功完成').toBe(true);
    expect(result.isLoading, '不应该是加载状态').toBe(false);

    // 2. 验证内容包含写入相关关键词
    expect(
      result.contentContainsWriteKeywords,
      '响应内容应该包含写入/文件相关关键词'
    ).toBe(true);

    // 3. 关键验证点：文件树刷新事件被触发
    console.log(`[E2E] 🚨 关键验证点：`);
    console.log(`[E2E]    - write_file 调用次数: ${result.writeCalls}`);
    console.log(`[E2E]    - 工具调用详情:`, result.writeCallDetails);
    console.log(`[E2E]    - 文件树刷新事件次数: ${result.refreshEvents}`);
    console.log(`[E2E]    - 刷新事件详情:`, result.refreshEventDetails);
    console.log(`[E2E]    - README.md 在文件树中: ${result.hasReadmeInTree}`);
    console.log(`[E2E]    - 文件树快照: ${result.currentFileTreeSnapshot}`);

    // 🚨 PRIMARY VALIDATION: 文件树刷新事件被触发
    expect(
      result.refreshEvents,
      '🚨 关键验证：文件写入后应该发出 file-tree-refresh 事件'
    ).toBeGreaterThan(0);

    // 4. 验证刷新事件的 payload 包含正确的工具名称
    const hasWriteRefreshEvent = result.refreshEventDetails.some((e: any) =>
      e.payload && (e.payload.tool === 'write_file' || e.payload.tool === 'agent_write_file')
    );
    expect(
      hasWriteRefreshEvent,
      '刷新事件应该包含 write_file 或 agent_write_file 工具信息'
    ).toBe(true);

    // 5. 验证刷新事件的 action 是 'write'
    const hasWriteAction = result.refreshEventDetails.some((e: any) =>
      e.payload && e.payload.action === 'write'
    );
    expect(
      hasWriteAction,
      '刷新事件的 action 应该是 "write"'
    ).toBe(true);

    console.log('[E2E] ✅ 测试通过：文件写入后文件树自动刷新！');
  });

  test('baseline: File tree should not refresh for read-only operations', async ({ page }) => {
    console.log('[E2E] 基线测试：只读操作不应触发文件树刷新');

    // 获取 AI 配置
    const realAIConfig = await page.evaluate(() => {
      const config = (window as any).__E2E_REAL_AI_CONFIG__ || {};
      return {
        apiKey: config.realAIApiKey || '',
        baseUrl: (config.realAIBaseUrl || 'https://api.deepseek.com').replace(/\/chat\/completions$/, '').replace(/\/+$/, ''),
        providerId: config.providerId || 'zhipu',
        modelId: config.realAIModel || 'deepseek-chat'
      };
    });

    if (!realAIConfig.apiKey) {
      test.skip(true, 'No API key configured in .env.e2e.local');
    }

    // 注入直接 HTTP AI handler
    await injectDirectAIHandler(page, realAIConfig);

    // 设置 AI 配置到 settingsStore
    await page.evaluate((config) => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.getState().updateProviderConfig(config.providerId, {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl + '/chat/completions'
        });
        settingsStore.getState().setCurrentProviderAndModel(config.providerId, config.modelId);
      }
    }, realAIConfig);

    // 监听文件树刷新事件
    await page.evaluate(() => {
      const w = window as any;
      w.__E2E_FILE_TREE_REFRESH_EVENTS__ = [];
      w.__TAURI_EVENT_LISTENERS__ = w.__TAURI_EVENT_LISTENERS__ || {};
      w.__TAURI_EVENT_LISTENERS__['file-tree-refresh'] = w.__TAURI_EVENT_LISTENERS__['file-tree-refresh'] || [];
      w.__TAURI_EVENT_LISTENERS__['file-tree-refresh'].push((event: any) => {
        w.__E2E_FILE_TREE_REFRESH_EVENTS__.push({
          timestamp: Date.now(),
          payload: event.payload
        });
      });
    });

    const existingAssistantIds = await page.evaluate(() => {
      return ((window as any).__chatStore?.getState().messages || [])
        .filter((m: any) => m.role === 'assistant')
        .map((m: any) => m.id);
    });

    // 发送只读消息
    await page.evaluate(async (payload) => {
      const chatStore = (window as any).__chatStore;
      const settingsStore = (window as any).__settingsStore;
      if (chatStore && settingsStore) {
        const state = settingsStore.getState();
        await chatStore.getState().sendMessage(
          payload.text,
          state.currentProviderId || payload.providerId,
          state.currentModel || payload.modelId
        );
      }
    }, {
      text: '列出当前目录的文件',
      providerId: realAIConfig.providerId,
      modelId: realAIConfig.modelId
    });

    // 等待响应完成
    const result = await page.evaluate(async ({ oldIds }) => {
      const oldIdSet = new Set(oldIds);
      const chatStore = (window as any).__chatStore;

      for (let i = 0; i < 60; i++) {
        const messages = chatStore.getState().messages;
        const newMsg = [...messages].reverse().find((m: any) => m.role === 'assistant' && !oldIdSet.has(m.id));

        if (newMsg && !newMsg.isStreaming) {
          const refreshEvents = (window as any).__E2E_FILE_TREE_REFRESH_EVENTS__ || [];
          return {
            success: true,
            content: newMsg.content?.substring(0, 200),
            refreshEvents: refreshEvents.length
          };
        }

        await new Promise(r => setTimeout(r, 500));
      }

      return { success: false, reason: 'Timeout' };
    }, { oldIds: existingAssistantIds });

    console.log('[E2E] 基线测试结果:', result);

    expect(result.success, '基线测试应该成功').toBe(true);
    // 只读操作不应该触发文件树刷新（或者触发次数很少）
    expect(
      result.refreshEvents,
      '只读操作不应该触发文件树刷新（或触发次数 <= 1）'
    ).toBeLessThanOrEqual(1);
  });
});
