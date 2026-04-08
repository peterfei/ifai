/**
 * 工作流 UI 渲染调试测试
 *
 * 用于诊断工作流响应在 UI 中的显示问题
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('工作流 UI 渲染调试', () => {
  test.beforeEach(async ({ page }) => {
    // 监听所有控制台日志
    page.on('console', msg => {
      const text = msg.text();
      console.log('[Browser Console]', text);
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 🔥 FIX: 配置 Mock API Key 以确保 isProviderConfigured 返回 true
    // 这是因为 AIChat.tsx 在没有配置 API Key 时不会渲染消息容器
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        // 配置一个 mock 的智谱 AI provider
        settingsStore.getState().updateProviderConfig('zhipu', {
          apiKey: 'e2e-mock-api-key',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          enabled: true
        });
        // 设置为当前 provider
        settingsStore.getState().setCurrentProviderAndModel('zhipu', 'glm-4');
        console.log('[E2E] ✅ Mock API Key configured');
      }
    });
    await page.waitForTimeout(500);

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore && !layoutStore.getState().isChatOpen) {
        layoutStore.getState().toggleChat();
      }
    });
    await page.waitForTimeout(2000);

    // 清空聊天历史
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().clearMessages();
      }
    });
    await page.waitForTimeout(1000);
  });

  test('调试：检查工作流响应是否正确显示在 UI 上', async ({ page }) => {
    // Given: 用户输入触发工作流
    const userInput = '请对我当前代码运行代码审查';

    console.log('📤 发送用户消息:', userInput);

    // When: 直接使用 sendMessage API（与通过的其他测试一致）
    await page.evaluate((input) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage(input);
      }
    }, userInput);

    // Then: 等待工作流处理完成和 UI 渲染
    await page.waitForTimeout(3000);

    // 🔍 调试步骤 0: 检查 UI 状态（聊天面板是否打开，视图模式等）
    const uiState = await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      const state = layoutStore?.getState();
      return {
        isChatOpen: state?.isChatOpen,
        chatWidth: state?.chatWidth, // 🔥 FIX: 正确的字段名
        sidebarWidth: state?.sidebarWidth,
        layoutMode: state?.layoutMode,
        chatPanelVisible: !!document.querySelector('[data-testid="chat-panel"]'),
        viewMode: (window as any).__VIEW_MODE__,
        panes: state?.panes,
        activePaneId: state?.activePaneId,
      };
    });

    // 🔍 调试步骤 0.5: 检查 DOM 结构
    const domStructure = await page.evaluate(() => {
      const body = document.body;

      // 🔥 检查 body 的子元素
      const bodyChildren = Array.from(body.children).map(child => ({
        tagName: child.tagName,
        id: child.id,
        className: child.className,
        dataTestId: child.getAttribute('data-testid'),
        innerHTML: child.innerHTML.substring(0, 1000), // 🔥 增加 limit 到 1000 字符
        textContent: child.textContent?.substring(0, 200), // 🔥 添加文本内容
      }));

      // 查找所有可能的聊天相关元素
      const chatRelatedElements = Array.from(body.querySelectorAll('[data-testid*="chat"]'))
        .map(el => el.getAttribute('data-testid'));

      // 查找所有 AI 相关元素
      const aiElements = Array.from(body.querySelectorAll('[data-testid*="ai"]'))
        .map(el => el.getAttribute('data-testid'));

      // 检查应用的整体结构
      const appStructure = {
        hasAppContainer: !!body.querySelector('.flex.flex-col.h-screen'),
        hasMainContent: !!body.querySelector('.flex.flex-1.overflow-hidden'),
        childrenCount: body.children.length,
      };

      return {
        bodyChildren,
        chatRelatedElements,
        aiElements,
        appStructure,
      };
    });

    console.log('🔍 DOM 结构:', JSON.stringify(domStructure, null, 2));

    // 如果聊天面板未打开，打开它
    if (!uiState.isChatOpen) {
      console.log('⚠️ 聊天面板未打开，正在打开...');
      await page.evaluate(() => {
        const layoutStore = (window as any).__layoutStore;
        if (layoutStore && !layoutStore.getState().isChatOpen) {
          layoutStore.getState().toggleChat();
        }
      });
      await page.waitForTimeout(2000);
    }

    // 🔍 调试步骤 1: 检查消息存储状态
    const storeState = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore.getState();
      return {
        messagesCount: state.messages.length,
        isLoading: state.isLoading,
        messages: state.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content?.substring(0, 100),
          status: m.status,
          hasToolCalls: !!m.toolCalls,
          metadata: m.metadata,
        }))
      };
    });

    console.log('📊 Store 状态:', JSON.stringify(storeState, null, 2));

    // 验证消息数量
    expect(storeState.messagesCount).toBeGreaterThanOrEqual(2);

    // 验证最后一条消息
    const lastMessage = storeState.messages[storeState.messages.length - 1];
    console.log('📝 最后一条消息:', lastMessage);

    expect(lastMessage.role).toBe('assistant');
    expect(lastMessage.content).toContain('代码审查');
    expect(lastMessage.status).not.toBe('streaming');

    // 🔍 调试步骤 2: 检查 DOM 中的消息元素
    const messageElements = await page.evaluate(() => {
      const messages: any[] = [];
      // 使用正确的选择器
      const messageItems = document.querySelectorAll('[data-testid^="message-"]');
      messageItems.forEach((item, index) => {
        const testId = item.getAttribute('data-testid');
        // 提取消息 ID
        const msgId = testId?.replace('message-', '');

        // 🔥 FIX: 从 DOM 元素的 data 属性获取 role，而不是从 Store 查找
        // 这避免了当用户消息和助手消息有相同 ID 时的查找问题
        const roleAttr = item.getAttribute('data-role');
        const role = roleAttr || null;

        // 从 store 中获取对应的消息数据
        const chatStore = (window as any).__chatStore;
        // 🔥 FIX: 如果 DOM 没有角色信息，从 Store 查找（处理有相同 ID 的情况）
        let msgData;
        if (role) {
          // 如果 DOM 有角色信息，使用它来过滤
          msgData = chatStore.getState().messages.find((m: any) => m.id === msgId && m.role === role);
        } else {
          // 否则使用第一个匹配的消息
          msgData = chatStore.getState().messages.find((m: any) => m.id === msgId);
        }

        messages.push({
          index,
          msgId,
          testId,
          role: msgData?.role || role,
          contentPreview: msgData?.content?.substring(0, 100),
          hasContent: !!msgData?.content,
          status: msgData?.status,
        });
      });
      return messages;
    });

    console.log('🎨 DOM 中的消息元素:', JSON.stringify(messageElements, null, 2));

    // 🔍 调试步骤 2.5: 检查聊天面板的 DOM 结构
    const domDebug = await page.evaluate(() => {
      const chatPanel = document.querySelector('[data-testid="chat-panel"]');
      if (!chatPanel) {
        return { error: 'chat-panel not found' };
      }

      return {
        chatPanelExists: true,
        childCount: chatPanel.children.length,
        innerHTML: chatPanel.innerHTML.substring(0, 1000),
        allDataTestIds: Array.from(chatPanel.querySelectorAll('[data-testid]')).map(el => el.getAttribute('data-testid')),
      };
    });

    console.log('🔍 聊天面板 DOM 调试:', domDebug);

    // 验证 DOM 中有工作流响应消息
    const assistantMessages = messageElements.filter(m => m.role === 'assistant');
    expect(assistantMessages.length).toBeGreaterThan(0);

    // 验证最后一条助手消息包含工作流内容
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
    expect(lastAssistantMessage.contentPreview).toContain('代码审查');

    // 🔍 调试步骤 3: 检查是否有隐藏或被遮挡的元素
    const visibilityCheck = await page.evaluate(() => {
      const lastMessage = document.querySelector('[data-testid="message-item"]:last-of-type');
      if (!lastMessage) return { error: 'No last message found' };

      const rect = lastMessage.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(lastMessage);

      return {
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
        style: {
          display: computedStyle.display,
          visibility: computedStyle.visibility,
          opacity: computedStyle.opacity,
          zIndex: computedStyle.zIndex,
        },
        isInViewport: rect.top >= 0 && rect.left >= 0 &&
                       rect.bottom <= window.innerHeight &&
                       rect.right <= window.innerWidth,
      };
    });

    console.log('👁️ 消息可见性检查:', JSON.stringify(visibilityCheck, null, 2));

    // 🔍 调试步骤 4: 截图保存
    await page.screenshot({
      path: 'test-results/workflow-ui-debug.png',
      fullPage: false
    });
    console.log('📸 截图已保存到: test-results/workflow-ui-debug.png');

    console.log('✅ UI 渲染调试测试完成');
  });

  test('调试：检查工作流元数据是否正确传递', async ({ page }) => {
    // Given: 用户输入触发工作流
    const userInput = '请对我当前代码运行代码审查';

    // When: 发送消息
    await page.evaluate((input) => {
      const chatStore = (window as any).__chatStore;
      if (chatStore) {
        chatStore.getState().sendMessage(input);
      }
    }, userInput);

    // Then: 等待工作流处理完成
    await page.waitForTimeout(3000);

    // 检查元数据
    const metadataCheck = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore.getState().messages;
      const lastMessage = messages[messages.length - 1];

      return {
        hasMetadata: !!lastMessage.metadata,
        workflowId: lastMessage.metadata?.workflowId,
        workflowType: lastMessage.metadata?.workflowType,
      };
    });

    console.log('🏷️ 元数据检查:', metadataCheck);

    expect(metadataCheck.hasMetadata).toBe(true);
    expect(metadataCheck.workflowType).toBe('code_review');
    expect(metadataCheck.workflowId).toMatch(/^workflow-/);

    console.log('✅ 元数据检查通过');
  });
});
