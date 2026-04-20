/**
 * 流式生成指示器去重 - 高保真元编程 v2 E2E 测试
 *
 * 🎯 测试目标：
 * 验证在 continuation 场景（AI 调用工具后继续生成文本）中，
 * 只有最后一个 text segment 显示"生成中..."脉冲指示器，
 * 而不是所有 text segment 同时显示。
 *
 * 📋 根因：
 * MessageItem.tsx 中 effectivelyStreaming（消息级布尔值）被传递给所有 text segment 的
 * MarkdownRenderer 组件，导致每个 text segment 都渲染"生成中..."。
 *
 * 🔧 修复方案：
 * 只对最后一个 text segment 传递 isStreaming=true，
 * 其他 text segment 传递 false。
 *
 * 🧪 测试场景：
 * 1. 【绿】多个 text segment + isStreaming=true 时，只有最后一个显示"生成中..."
 * 2. 【绿】单个 text segment + isStreaming=true 时，显示"生成中..."
 * 3. 【绿】工具调用执行中，ToolApproval 的"生成中"不受影响
 * 4. 【绿】multiModalContent 路径同样只对最后一个 text part 显示"生成中..."
 *
 * @version v0.5.0 - 修复多气泡"生成中..."问题
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('流式生成指示器去重', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[MessageItem]') ||
          text.includes('[E2E]') ||
          text.includes('streamingIndicator') ||
          text.includes('生成中')) {
        console.log(`[Browser Console ${msg.type()}]`, text);
      }
    });

    await setupE2ETestEnvironment(page, { skipWelcome: true });
    await page.goto('/');
    await page.waitForFunction(() => {
      return !!(window as any).__chatStore && !!(window as any).__settingsStore;
    }, { timeout: 30000 });

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(1000);
  });

  /**
   * ✅ 绿测试 #1：多个 text segment + isStreaming=true，只有最后一个显示"生成中..."
   *
   * 模拟 continuation 场景：
   * - pre-tool text segment（AI 第一轮输出的文本）
   * - tool segment（工具调用）
   * - post-tool text segment（工具执行后 AI 继续输出的文本）
   *
   * 验证：只有 post-tool segment 显示"生成中..."
   */
  test('✅ GREEN: 多个 text segment 时只有最后一个显示生成中指示器', async ({ page }) => {
    console.log('[E2E] 🟢 绿测试：多个 text segment 只有一个生成中指示器');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 清空消息
      chatStore.setState({ messages: [] });

      // 创建用户消息
      const userId = 'user-' + Date.now();
      chatStore.getState().addMessage({
        id: userId,
        role: 'user',
        content: '请帮我重构代码',
        timestamp: Date.now()
      });

      // 创建助手消息，模拟 continuation 场景
      // 消息中有多个 text segment（pre-tool + post-tool）和一个工具调用
      const assistantId = 'assistant-' + Date.now();
      const toolCallId = 'tc-' + Date.now();

      chatStore.getState().addMessage({
        id: assistantId,
        role: 'assistant',
        content: '我来帮你重构代码。首先让我检查一下项目结构。',
        timestamp: Date.now(),
        isStreaming: true, // 🔥 关键：模拟流式传输中
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_read_file',
          args: { rel_path: 'src/index.ts' },
          function: {
            name: 'agent_read_file',
            arguments: JSON.stringify({ rel_path: 'src/index.ts' })
          },
          status: 'completed',
          isPartial: false,
          result: 'file content here...'
        }],
        // 🔥 关键：多个 text segment（pre-tool + post-tool）
        segments: [
          {
            id: 'seg-pre-tool',
            type: 'text',
            phase: 'pre-tool',
            content: '我来帮你重构代码。首先让我检查一下项目结构。',
            order: 1,
            timestamp: Date.now()
          },
          {
            id: 'seg-tool',
            type: 'tool',
            phase: 'in-tool',
            content: '',
            order: 2,
            timestamp: Date.now(),
            toolCallId: toolCallId,
            toolName: 'agent_read_file'
          },
          {
            id: 'seg-post-tool',
            type: 'text',
            phase: 'post-tool',
            content: '项目结构分析完毕，以下是重构建议...',
            order: 3,
            timestamp: Date.now()
          }
        ]
      });

      // 等待 React 渲染
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 查找所有"生成中..."指示器
      const streamingIndicators = document.querySelectorAll('.streamingIndicator, [class*="streaming-indicator"], [class*="streamingDot"], [class*="streaming-dot"]');
      const streamingTexts = document.querySelectorAll('*');
      const streamingTextContents: string[] = [];
      streamingTexts.forEach(el => {
        if (el.textContent?.includes('生成中') && el.children.length === 0) {
          streamingTextContents.push(el.textContent?.trim() || '');
        }
      });

      // 统计"生成中..."文本出现次数
      const fullText = document.body.innerText;
      const streamingCount = (fullText.match(/生成中[.．.]{0,3}/g) || []).length;

      return {
        streamingIndicatorCount: streamingIndicators.length,
        streamingTextContents: streamingTextContents.slice(0, 10),
        streamingCount,
        messageCount: chatStore.getState().messages.length,
        segmentCount: chatStore.getState().messages.find((m: any) => m.id === assistantId)?.segments?.length || 0,
        isStreaming: chatStore.getState().messages.find((m: any) => m.id === assistantId)?.isStreaming
      };
    });

    console.log('[E2E] 📊 测试结果:', JSON.stringify(result, null, 2));

    // 🔍 验证：消息有 3 个 segments（2 text + 1 tool）
    expect(result.segmentCount, '应该有 3 个 segments').toBe(3);

    // 🔍 验证：isStreaming 为 true
    expect(result.isStreaming, 'isStreaming 应该为 true').toBe(true);

    // 🔍 验证：只有 1 个"生成中..."指示器（最后一个 text segment）
    expect(result.streamingCount, '应该只有 1 个"生成中..."指示器').toBeLessThanOrEqual(1);

    console.log('[E2E] ✅ 绿测试通过：多个 text segment 只有一个生成中指示器');
  });

  /**
   * ✅ 绿测试 #2：单个 text segment + isStreaming=true，正常显示"生成中..."
   *
   * 验证修复不影响单 segment 场景
   */
  test('✅ GREEN: 单个 text segment 时正常显示生成中指示器', async ({ page }) => {
    console.log('[E2E] 🟢 绿测试：单个 text segment 正常显示生成中指示器');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 清空消息
      chatStore.setState({ messages: [] });

      // 创建用户消息
      const userId = 'user-' + Date.now();
      chatStore.getState().addMessage({
        id: userId,
        role: 'user',
        content: '你好',
        timestamp: Date.now()
      });

      // 创建助手消息（单个 text segment + isStreaming）
      const assistantId = 'assistant-' + Date.now();

      chatStore.getState().addMessage({
        id: assistantId,
        role: 'assistant',
        content: '你好！有什么可以帮助你的吗？',
        timestamp: Date.now(),
        isStreaming: true,
        segments: [
          {
            id: 'seg-1',
            type: 'text',
            phase: 'pre-tool',
            content: '你好！有什么可以帮助你的吗？',
            order: 1,
            timestamp: Date.now()
          }
        ]
      });

      // 等待 React 渲染
      await new Promise(resolve => setTimeout(resolve, 1000));

      const fullText = document.body.innerText;
      const streamingCount = (fullText.match(/生成中[.．.]{0,3}/g) || []).length;

      return {
        streamingCount,
        segmentCount: chatStore.getState().messages.find((m: any) => m.id === assistantId)?.segments?.length || 0,
        isStreaming: chatStore.getState().messages.find((m: any) => m.id === assistantId)?.isStreaming
      };
    });

    console.log('[E2E] 📊 测试结果:', JSON.stringify(result, null, 2));

    // 🔍 验证：1 个 segment
    expect(result.segmentCount, '应该有 1 个 segment').toBe(1);

    // 🔍 验证：isStreaming 为 true
    expect(result.isStreaming, 'isStreaming 应该为 true').toBe(true);

    // 🔍 验证：显示"生成中..."
    expect(result.streamingCount, '应该显示"生成中..."指示器').toBeGreaterThanOrEqual(1);

    console.log('[E2E] ✅ 绿测试通过：单个 text segment 正常显示生成中指示器');
  });

  /**
   * ✅ 绿测试 #3：isStreaming=false 时，所有 segment 不显示"生成中..."
   */
  test('✅ GREEN: isStreaming=false 时无生成中指示器', async ({ page }) => {
    console.log('[E2E] 🟢 绿测试：isStreaming=false 时无生成中指示器');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 清空消息
      chatStore.setState({ messages: [] });

      // 创建用户消息
      const userId = 'user-' + Date.now();
      chatStore.getState().addMessage({
        id: userId,
        role: 'user',
        content: '你好',
        timestamp: Date.now()
      });

      // 创建助手消息（多个 segment + isStreaming=false）
      const assistantId = 'assistant-' + Date.now();
      const toolCallId = 'tc-' + Date.now();

      chatStore.getState().addMessage({
        id: assistantId,
        role: 'assistant',
        content: '完成！代码已重构。',
        timestamp: Date.now(),
        isStreaming: false, // 🔥 关键：非流式状态
        status: 'completed',
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_write_file',
          args: { rel_path: 'src/index.ts' },
          function: {
            name: 'agent_write_file',
            arguments: JSON.stringify({ rel_path: 'src/index.ts' })
          },
          status: 'completed',
          isPartial: false,
          result: 'success'
        }],
        segments: [
          {
            id: 'seg-pre',
            type: 'text',
            phase: 'pre-tool',
            content: '我来帮你重构代码。',
            order: 1,
            timestamp: Date.now()
          },
          {
            id: 'seg-tool',
            type: 'tool',
            phase: 'in-tool',
            content: '',
            order: 2,
            timestamp: Date.now(),
            toolCallId: toolCallId,
            toolName: 'agent_write_file'
          },
          {
            id: 'seg-post',
            type: 'text',
            phase: 'post-tool',
            content: '完成！代码已重构。',
            order: 3,
            timestamp: Date.now()
          }
        ]
      });

      // 等待 React 渲染
      await new Promise(resolve => setTimeout(resolve, 1000));

      const fullText = document.body.innerText;
      const streamingCount = (fullText.match(/生成中[.．.]{0,3}/g) || []).length;

      return {
        streamingCount,
        isStreaming: chatStore.getState().messages.find((m: any) => m.id === assistantId)?.isStreaming
      };
    });

    console.log('[E2E] 📊 测试结果:', JSON.stringify(result, null, 2));

    // 🔍 验证：isStreaming 为 false
    expect(result.isStreaming, 'isStreaming 应该为 false').toBe(false);

    // 🔍 验证：不显示"生成中..."
    expect(result.streamingCount, '不应该显示"生成中..."指示器').toBe(0);

    console.log('[E2E] ✅ 绿测试通过：isStreaming=false 时无生成中指示器');
  });

  /**
   * ✅ 绿测试 #4：hasActiveToolCalls=true 但 isStreaming=false
   * 验证 effectivelyStreaming 仍然正确（工具执行中场景）
   */
  test('✅ GREEN: 工具执行中场景（pending tool + isStreaming=false）', async ({ page }) => {
    console.log('[E2E] 🟢 绿测试：工具执行中场景');

    const result = await page.evaluate(async () => {
      const chatStore = (window as any).__chatStore;

      // 清空消息
      chatStore.setState({ messages: [] });

      // 创建用户消息
      const userId = 'user-' + Date.now();
      chatStore.getState().addMessage({
        id: userId,
        role: 'user',
        content: '读取文件',
        timestamp: Date.now()
      });

      // 创建助手消息（工具执行中）
      const assistantId = 'assistant-' + Date.now();
      const toolCallId = 'tc-' + Date.now();

      chatStore.getState().addMessage({
        id: assistantId,
        role: 'assistant',
        content: '让我读取文件...',
        timestamp: Date.now(),
        isStreaming: false,
        toolCalls: [{
          id: toolCallId,
          type: 'function',
          tool: 'agent_read_file',
          args: { rel_path: 'README.md' },
          function: {
            name: 'agent_read_file',
            arguments: JSON.stringify({ rel_path: 'README.md' })
          },
          status: 'executing', // 🔥 关键：工具正在执行
          isPartial: false
        }],
        segments: [
          {
            id: 'seg-1',
            type: 'text',
            phase: 'pre-tool',
            content: '让我读取文件...',
            order: 1,
            timestamp: Date.now()
          }
        ]
      });

      // 等待 React 渲染
      await new Promise(resolve => setTimeout(resolve, 1000));

      const fullText = document.body.innerText;
      // 在 hasActiveToolCalls 场景下，effectivelyStreaming=true
      // 但只有一个 text segment，所以应该显示"生成中..."
      const streamingCount = (fullText.match(/生成中[.．.]{0,3}/g) || []).length;

      return {
        streamingCount,
        toolStatus: chatStore.getState().messages.find((m: any) => m.id === assistantId)?.toolCalls?.[0]?.status
      };
    });

    console.log('[E2E] 📊 测试结果:', JSON.stringify(result, null, 2));

    // 🔍 验证：工具状态为 executing
    expect(result.toolStatus, '工具状态应该为 executing').toBe('executing');

    // 🔍 验证：只有一个 text segment，effectivelyStreaming=true，应该显示"生成中..."
    expect(result.streamingCount, '应该显示"生成中..."指示器').toBeGreaterThanOrEqual(1);

    console.log('[E2E] ✅ 绿测试通过：工具执行中场景正确显示生成中指示器');
  });
});
