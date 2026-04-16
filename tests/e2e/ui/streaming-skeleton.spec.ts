/**
 * E2E Test: Streaming Message Skeleton
 *
 * 验证流式加载时单消息气泡骨架屏的显示行为
 *
 * 测试场景：
 * 1. 发送消息后，在 LLM 响应前显示骨架屏
 * 2. LLM 开始流式输出时，骨架屏消失，显示实际内容
 * 3. 骨架屏位置正确（在消息列表内，不是输入框下面）
 *
 * 参考金用例：console-display-verification.spec.ts
 * 模式：使用 page.evaluate 直接操作 chatStore，避免 UI 交互的 flaky 性
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('Streaming Message Skeleton', () => {
  test.beforeEach(async ({ page }) => {
    // 监听 browser console，方便调试
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      if (type === 'error') {
        console.log('[Browser Error]', text);
      } else if (text.includes('[StreamingSkeleton]') || text.includes('[E2E]')) {
        console.log('[Browser]', text);
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(2000);
  });

  test('应该显示流式骨架屏：发送消息后、LLM 响应前', async ({ page }) => {
    console.log('[E2E] ========== 测试：流式骨架屏显示 ==========');

    // 步骤 1: 添加用户消息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      if (!chatStore) {
        throw new Error('chatStore not found');
      }

      // 添加用户消息
      chatStore.addMessage({
        id: 'msg-user-test',
        role: 'user',
        content: '请用一句话介绍你自己'
      });
    });

    await page.waitForTimeout(200);

    // 步骤 2: 设置 isLoading = true，模拟等待 LLM 响应
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const currentState = chatStore.getState();
      chatStore.setState({ isLoading: true });
    });

    await page.waitForTimeout(200);

    // 步骤 3: 🔥 关键验证：检查骨架屏是否出现
    const skeletonExists = await page.evaluate(() => {
      const skeleton = document.querySelector('[data-testid="streaming-message-skeleton"]');
      return {
        exists: !!skeleton,
        isVisible: skeleton ? window.getComputedStyle(skeleton).display !== 'none' : false,
        parentElement: skeleton?.parentElement?.tagName,
        grandParentElement: skeleton?.parentElement?.parentElement?.className
      };
    });

    console.log('[E2E] 骨架屏状态:', skeletonExists);

    // 验证骨架屏存在且可见
    expect(skeletonExists.exists, '骨架屏元素应该存在').toBe(true);

    // 步骤 4: 验证骨架屏在消息容器内
    const skeletonLocation = await page.evaluate(() => {
      const skeleton = document.querySelector('[data-testid="streaming-message-skeleton"]');
      if (!skeleton) return { inScrollContainer: false, inInputContainer: false };

      const scrollContainer = document.querySelector('[data-testid="chat-scroll-container"]');
      const inputContainer = document.querySelector('[data-testid="chat-input-container"]');

      return {
        inScrollContainer: scrollContainer?.contains(skeleton) ?? false,
        inInputContainer: inputContainer?.contains(skeleton) ?? false
      };
    });

    console.log('[E2E] 骨架屏位置:', skeletonLocation);

    expect(skeletonLocation.inScrollContainer, '骨架屏应该在消息容器内').toBe(true);
    expect(skeletonLocation.inInputContainer, '骨架屏不应该在输入框内').toBe(false);

    console.log('[E2E] ✅ 测试通过：流式骨架屏正确显示');
  });

  test('应该隐藏流式骨架屏：LLM 开始输出后', async ({ page }) => {
    console.log('[E2E] ========== 测试：流式内容出现后骨架屏消失 ==========');

    // 步骤 1: 添加用户消息和 assistant 消息（有内容）
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();

      // 添加用户消息
      chatStore.addMessage({
        id: 'msg-user-hello',
        role: 'user',
        content: 'Hello'
      });

      // 添加 assistant 消息，带有内容（模拟流式输出已开始）
      chatStore.addMessage({
        id: 'msg-ai-response',
        role: 'assistant',
        content: '你好！我是', // 有内容
        isStreaming: true
      });

      // 设置 isLoading = true（仍在流式输出中）
      const currentState = (window as any).__chatStore.getState();
      (window as any).__chatStore.setState({ isLoading: true });
    });

    await page.waitForTimeout(300);

    // 步骤 2: 🔥 关键验证：骨架屏不应该显示（因为有实际内容了）
    const skeletonState = await page.evaluate(() => {
      const skeleton = document.querySelector('[data-testid="streaming-message-skeleton"]');
      return {
        exists: !!skeleton,
        isVisible: skeleton ? window.getComputedStyle(skeleton).display !== 'none' : false
      };
    });

    console.log('[E2E] 有流式内容时的骨架屏状态:', skeletonState);

    // 骨架屏不应该可见（即使元素存在，也应该被隐藏）
    expect(skeletonState.isVisible, '有流式内容时骨架屏不应该可见').toBe(false);

    // 步骤 3: 验证有实际的 assistant 消息
    const assistantMessageCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-testid^="message-"][data-role="assistant"]').length;
    });

    console.log('[E2E] Assistant 消息数量:', assistantMessageCount);

    expect(assistantMessageCount, '应该有 assistant 消息').toBeGreaterThan(0);

    console.log('[E2E] ✅ 测试通过：流式内容出现后骨架屏正确消失');
  });

  test('初始空状态：不应该显示流式骨架屏', async ({ page }) => {
    console.log('[E2E] ========== 测试：初始空状态 ==========');

    // 确保是空对话
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      chatStore.setState({
        messages: [],
        isLoading: false
      });
    });

    await page.waitForTimeout(200);

    // 验证不应该有流式骨架屏
    const skeletonExists = await page.evaluate(() => {
      const skeleton = document.querySelector('[data-testid="streaming-message-skeleton"]');
      return !!skeleton;
    });

    console.log('[E2E] 初始空状态骨架屏存在:', skeletonExists);

    expect(skeletonExists, '初始空状态不应该有流式骨架屏').toBe(false);

    console.log('[E2E] ✅ 测试通过：初始空状态不显示骨架屏');
  });

  test('调试信息输出：打印骨架屏相关的所有状态', async ({ page }) => {
    console.log('[E2E] ========== 调试信息收集 ==========');

    // 模拟发送消息场景
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();

      // 添加用户消息
      chatStore.addMessage({
        id: 'msg-user-debug',
        role: 'user',
        content: 'Debug test'
      });

      // 设置加载状态
      const currentState = (window as any).__chatStore.getState();
      (window as any).__chatStore.setState({ isLoading: true });
    });

    await page.waitForTimeout(300);

    // 收集调试信息
    const debugInfo = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore?.getState();
      const skeleton = document.querySelector('[data-testid="streaming-message-skeleton"]');
      const messages = document.querySelectorAll('[data-testid^="message-"]');
      const lastMessage = messages[messages.length - 1];

      return {
        chatStore: {
          isLoading: chatStore?.isLoading,
          messageCount: chatStore?.messages?.length || 0
        },
        skeleton: {
          exists: !!skeleton,
          visible: skeleton ? window.getComputedStyle(skeleton).display !== 'none' : false,
          className: skeleton?.className
        },
        messages: {
          count: messages.length,
          lastMessageTestId: lastMessage?.getAttribute('data-testid'),
          lastMessageRole: lastMessage?.getAttribute('data-role')
        }
      };
    });

    console.log('[E2E] 调试信息:', JSON.stringify(debugInfo, null, 2));

    // 断言基本信息
    expect(debugInfo.chatStore.isLoading).toBe(true);
    expect(debugInfo.messages.count).toBeGreaterThan(0);

    console.log('[E2E] ✅ 调试信息收集完成');
  });

  test('编辑器骨架屏：文件加载时应该显示', async ({ page }) => {
    console.log('[E2E] ========== 测试：编辑器骨架屏 ==========');

    // 步骤 1: 创建一个没有内容的文件对象（模拟加载状态）
    await page.evaluate(() => {
      const fileStore = (window as any).__fileStore;
      const layoutStore = (window as any).__layoutStore;

      // 获取当前 pane
      const panes = layoutStore.getState().panes;
      const firstPaneId = panes[0]?.id;

      if (!firstPaneId) {
        throw new Error('No pane found');
      }

      // 打开一个文件，但 content 为空（模拟加载中）
      const fileId = fileStore.getState().openFile({
        id: 'test-loading-file',
        name: 'loading-test.ts',
        path: '/tmp/loading-test.ts',
        content: '', // 空内容，模拟加载中
        isDirty: false,
        language: 'typescript'
      });

      // 激活这个文件
      fileStore.getState().setActiveFile(fileId);

      // 将文件关联到 pane
      layoutStore.getState().panes[0].fileId = fileId;
    });

    await page.waitForTimeout(500);

    // 步骤 2: 🔥 关键验证：检查编辑器骨架屏是否出现
    const editorSkeletonState = await page.evaluate(() => {
      const skeleton = document.querySelector('[data-testid="editor-skeleton"]');
      const monacoContainer = document.querySelector('[data-testid="monaco-editor-container"]');

      return {
        editorSkeleton: {
          exists: !!skeleton,
          visible: skeleton ? window.getComputedStyle(skeleton).display !== 'none' : false,
        },
        monacoEditor: {
          exists: !!monacoContainer,
          visible: monacoContainer ? window.getComputedStyle(monacoContainer).display !== 'none' : false,
        },
        fileStore: {
          openedFiles: (window as any).__fileStore?.getState()?.openedFiles || [],
          activeFileId: (window as any).__fileStore?.getState()?.activeFileId,
        }
      };
    });

    console.log('[E2E] 编辑器骨架屏状态:', JSON.stringify(editorSkeletonState, null, 2));

    // 🔥 验证：应该显示编辑器骨架屏
    expect(editorSkeletonState.editorSkeleton.exists, '编辑器骨架屏元素应该存在').toBe(true);

    // 🔥 验证：Monaco 编辑器不应该可见
    expect(editorSkeletonState.monacoEditor.visible, 'Monaco 编辑器在加载时不应该可见').toBe(false);

    console.log('[E2E] ✅ 测试通过：编辑器骨架屏正确显示');
  });

  test('编辑器骨架屏调试：收集完整状态信息', async ({ page }) => {
    console.log('[E2E] ========== 编辑器骨架屏调试信息 ==========');

    const debugInfo = await page.evaluate(() => {
      const fileStore = (window as any).__fileStore?.getState();
      const layoutStore = (window as any).__layoutStore?.getState();

      const skeleton = document.querySelector('[data-testid="editor-skeleton"]');
      const monacoContainer = document.querySelector('[data-testid="monaco-editor-container"]');
      const welcomeScreen = document.querySelector('[data-testid="welcome-screen"]');

      // 获取第一个 pane 的文件
      const panes = layoutStore?.panes || [];
      const firstPane = panes[0];
      const associatedFileId = firstPane?.fileId;
      const associatedFile = associatedFileId
        ? fileStore?.openedFiles.find((f: any) => f.id === associatedFileId)
        : null;

      return {
        layout: {
          panesCount: panes.length,
          firstPaneId: firstPane?.id,
          associatedFileId,
          associatedFile: associatedFile ? {
            id: associatedFile.id,
            name: associatedFile.name,
            hasContent: !!associatedFile.content,
            contentLength: associatedFile.content?.length || 0,
            isDirty: associatedFile.isDirty,
          } : null,
        },
        fileStore: {
          openedFilesCount: fileStore?.openedFiles?.length || 0,
          activeFileId: fileStore?.activeFileId,
        },
        dom: {
          editorSkeleton: {
            exists: !!skeleton,
            className: skeleton?.className,
          },
          monacoContainer: {
            exists: !!monacoContainer,
          },
          welcomeScreen: {
            exists: !!welcomeScreen,
          }
        }
      };
    });

    console.log('[E2E] 编辑器状态:', JSON.stringify(debugInfo, null, 2));

    // 基本断言
    expect(debugInfo.layout.panesCount).toBeGreaterThan(0);
    expect(debugInfo.dom).toBeDefined();

    console.log('[E2E] ✅ 调试信息收集完成');
  });
});
