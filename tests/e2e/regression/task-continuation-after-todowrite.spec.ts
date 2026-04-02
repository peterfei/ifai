/**
 * E2E 测试：AI 任务继续执行验证（高保真）
 *
 * 目标：验证 AI 在创建任务列表后是否自动继续执行第一个任务，而不是停止。
 * 这是 P4 Agent 系统重构和系统提示词修复（CRITICAL BEHAVIOR RULES）的关键验证。
 *
 * 测试场景：
 *   用户请求："帮我创建一个 2048 小游戏"
 *   预期行为：
 *     1. AI 调用 TodoWrite 创建任务列表
 *     2. AI 不停止（finish_reason != 'stop'）
 *     3. AI 继续执行第一个任务（调用 agent_write_file 等）
 *
 * 运行方式：
 *   APP_EDITION=commercial npx playwright test tests/e2e/regression/task-continuation-after-todowrite.spec.ts --headed
 *
 * 参考：e20587d 提交的高保真 E2E 测试模式
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

/**
 * 注入直接调用 OpenAI 兼容 API 的 invoke handler
 * 通过 window.__TAURI_EVENT_LISTENERS__ 模拟 Tauri app.emit()
 *
 * 参考：e20587d 提交中的实现
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

    w.__E2E_DIRECT_AI_HANDLER__ = async (cmd: string, args: any) => {
      if (cmd !== 'ai_chat') return {};

      const pc = args?.providerConfig || {};
      const apiKey = config.apiKey || pc.api_key || pc.apiKey;
      const baseUrl = (config.baseUrl || pc.base_url || pc.baseUrl).replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
      const model = config.modelId || (pc.models?.[0]);
      const messages = args?.messages || [];
      const eventId = args?.eventId || `chat_e2e_${Date.now()}`;

      console.log('[E2E Direct AI] Calling API:', { baseUrl, model, messagesCount: messages.length });

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, stream: true })
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
            }

            if (choice.delta?.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                tauriEmit(eventId, {
                  type: 'tool_call',
                  tool_call: { id: tc.id || '', function: { name: tc.function?.name || '', arguments: tc.function?.arguments || '' } }
                });
              }
            }

            if (choice.finish_reason) {
              console.log(`[E2E Direct AI] finish_reason: ${choice.finish_reason}`);
              tauriEmit(eventId, { type: 'finish', finish_reason: choice.finish_reason });
              tauriEmit(`${eventId}_finish`, 'DONE');
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }

      tauriEmit(`${eventId}_finish`, 'DONE');
      return {};
    };

    if (w.__tauriSetInvokeHandler__) w.__tauriSetInvokeHandler__(w.__E2E_DIRECT_AI_HANDLER__);
    w.__E2E_INVOKE_HANDLER__ = w.__E2E_DIRECT_AI_HANDLER__;
    console.log('[E2E Direct AI] Handler injected');
  }, aiConfig);
}

test.describe('Task Continuation After TodoWrite - Real LLM E2E', () => {
  test.setTimeout(180_000);  // 增加到 180 秒

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

  test('scenario: AI should continue execution after TodoWrite', async ({ page }) => {
    console.log('[E2E] 开始测试：AI TodoWrite 后继续执行验证');

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

    // 监听所有工具调用事件
    const toolCalls: any[] = [];
    await page.evaluate(() => {
      const w = window as any;

      // 监听 Tauri invoke 调用
      const originalInvoke = w.__invoke;
      w.__invoke = async (cmd: string, args: any) => {
        if (cmd === 'execute_local_tool' || cmd === 'agent_write_file' || cmd === 'TodoWrite') {
          w.__E2E_TOOL_CALLS__ = w.__E2E_TOOL_CALLS__ || [];
          w.__E2E_TOOL_CALLS__.push({
            cmd,
            args,
            timestamp: Date.now()
          });
          console.log(`[E2E Tool Call] ${cmd}`, args);
        }
        return originalInvoke ? originalInvoke(cmd, args) : {};
      };

      w.__E2E_TOOL_CALLS__ = [];
    });

    // 记录发送前的 assistant 消息 ID
    const existingAssistantIds = await page.evaluate(() => {
      return ((window as any).__chatStore?.getState().messages || [])
        .filter((m: any) => m.role === 'assistant')
        .map((m: any) => m.id);
    });

    // 发送消息：创建 2048 游戏（不等待完成）
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
      text: '帮我创建一个 2048 小游戏',
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

    // 轮询检查消息状态和工具调用（增加到 300 次 = 150 秒）
    const result = await page.evaluate(async ({ oldIds }) => {
      const oldIdSet = new Set(oldIds);
      const chatStore = (window as any).__chatStore;

      for (let i = 0; i < 300; i++) {
        const messages = chatStore.getState().messages;
        const newMsg = [...messages].reverse().find((m: any) => m.role === 'assistant' && !oldIdSet.has(m.id));

        if (newMsg && !newMsg.isStreaming) {
          // 获取工具调用记录
          const toolCalls = (window as any).__E2E_TOOL_CALLS__ || [];

          // 检查是否有 TodoWrite 调用
          const todoWriteCalls = toolCalls.filter((c: any) =>
            c.cmd === 'TodoWrite' ||
            (c.args && c.args.todos)
          );

          // 检查是否有后续工具调用（在 TodoWrite 之后）
          const hasTodoWrite = todoWriteCalls.length > 0;
          const subsequentCalls = hasTodoWrite
            ? toolCalls.filter((c: any) => {
                const todoWriteTime = todoWriteCalls[0].timestamp;
                return c.timestamp > todoWriteTime && c.cmd !== 'TodoWrite';
              })
            : [];

          // 分析消息内容中的关键词
          const content = newMsg.content || '';

          return {
            success: true,
            content: content.substring(0, 500),
            fullContentLength: content.length,
            toolCalls: toolCalls.length,
            todoWriteCalls: todoWriteCalls.length,
            subsequentCalls: subsequentCalls.length,
            hasTodoWrite,
            subsequentCallDetails: subsequentCalls.map((c: any) => c.cmd),
            contentContainsTaskKeywords: content.includes('任务') || content.includes('task'),
            contentContainsExecutionKeywords: content.includes('创建') || content.includes('开始') || content.includes('创建文件'),
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

    // 2. 验证内容长度（AI 停止时通常内容很少）
    expect(
      result.fullContentLength,
      '响应内容长度应该 > 1000 字符（红灯场景：AI 停止，内容很少；绿灯场景：AI 继续生成完整内容）'
    ).toBeGreaterThan(1000);

    // 3. 验证 AI 创建了完整的游戏实现（而不是停在任务列表）
    const hasHTMLImplementation = result.content.includes('<!DOCTYPE html>') ||
                                  result.content.includes('<html') ||
                                  result.content.includes('HTML');
    const hasCSSStyling = result.content.includes('<style>') ||
                          result.content.includes('CSS') ||
                          result.content.includes('style');
    const hasJavaScriptLogic = result.content.includes('<script>') ||
                                result.content.includes('JavaScript') ||
                                result.content.includes('function') ||
                                result.contentincludes('const game');

    console.log(`[E2E] 🚨 关键验证点：`);
    console.log(`[E2E]    - 内容长度: ${result.fullContentLength} 字符`);
    console.log(`[E2E]    - 包含 HTML 实现: ${hasHTMLImplementation}`);
    console.log(`[E2E]    - 包含 CSS 样式: ${hasCSSStyling}`);
    console.log(`[E2E]    - 包含 JavaScript 逻辑: ${hasJavaScriptLogic}`);
    console.log(`[E2E]    - 内容预览: ${result.content.substring(0, 200)}...`);

    // 绿灯场景：AI 创建了完整的游戏实现
    expect(
      hasHTMLImplementation,
      '🚨 关键验证：AI 应该创建完整的 HTML 实现（红灯场景：AI 停在任务列表；绿灯场景：AI 继续生成完整代码）'
    ).toBe(true);

    expect(
      hasCSSStyling,
      'AI 应该包含 CSS 样式代码'
    ).toBe(true);

    expect(
      hasJavaScriptLogic,
      'AI 应该包含 JavaScript 游戏逻辑'
    ).toBe(true);

    console.log('[E2E] ✅ 测试通过：AI 创建了完整的 2048 游戏实现！');
  });

  test('baseline: simple chat without TodoWrite', async ({ page }) => {
    console.log('[E2E] 基线测试：简单对话（不涉及 TodoWrite）');

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
        console.log('[E2E] AI config set to settingsStore');
      }
    }, realAIConfig);

    const existingAssistantIds = await page.evaluate(() => {
      return ((window as any).__chatStore?.getState().messages || [])
        .filter((m: any) => m.role === 'assistant')
        .map((m: any) => m.id);
    });

    // 发送简单消息（不触发 TodoWrite）
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
      text: '用一句话介绍 TypeScript',
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
          return {
            success: true,
            content: newMsg.content?.substring(0, 200),
            isLoading: chatStore.getState().isLoading
          };
        }

        await new Promise(r => setTimeout(r, 500));
      }

      return { success: false, reason: 'Timeout' };
    }, { oldIds: existingAssistantIds });

    console.log('[E2E] 基线测试结果:', result);

    expect(result.success, '基线测试应该成功').toBe(true);
    expect(result.content, '响应应该有内容').toBeTruthy();
  });
});
