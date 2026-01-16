/**
 * v0.3.1 时间线视图 E2E 测试
 *
 * 🚨 强制性规范: 遵守 tests/e2e/CODING_STANDARDS.md
 *
 * 测试目标: 验证 AI 对话历史时间线功能的渐进式加载和用户体验
 *
 * 核心功能:
 * 1. 气泡样式展示对话（用户左对齐，AI右对齐）
 * 2. 按时间轴展示对话流程（分钟级精度）
 * 3. 分步加载避免网络超时（初始10条，滚动加载更多）
 * 4. 点击气泡跳转到对应消息
 * 5. 长消息折叠显示
 * 6. 按天分组（今天、昨天、更早）
 *
 * 关键设计决策:
 * - 用户反馈: "还是气泡 不要用户和AI放在一起"
 * - 用户反馈: "UI上最好有个直观的时间轴 内容太多 分步写入 不要因为网络原因超时"
 * - 解决方案: 气泡样式 + 渐进式渲染 + 超时保护 + 骨架屏 + 重试机制
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('v0.3.1 Timeline View', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('[Browser Error]', msg.text());
      }
    });

    await setupE2ETestEnvironment(page);
    await page.goto('/');
    await page.waitForTimeout(3000);

    // 关闭新手引导（Joyride）
    try {
      await page.waitForTimeout(1000);
      const skipButton = await page.$('[data-test-id="overlay"]') ||
                          await page.$('.react-joyride__tooltip') ||
                          await page.$('[data-action="skip"]');
      if (skipButton) {
        await page.evaluate(() => {
          // 移除 joyride 遮罩层
          const overlay = document.querySelector('.react-joyride__overlay');
          const tooltip = document.querySelector('.react-joyride__tooltip');
          const portal = document.getElementById('react-joyride-portal');
          if (portal) portal.remove();
          if (overlay) overlay.remove();
          if (tooltip) tooltip.remove();
        });
        console.log('[Test] ✅ 已关闭新手引导');
      }
    } catch (e) {
      // 忽略错误，可能没有新手引导
    }

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        const store = layoutStore.useLayoutStore || layoutStore;
        if (store && store.getState && !store.getState().isChatOpen) {
          store.getState().toggleChat();
        }
      }
    });
    await page.waitForTimeout(2000);
  });

  test('TIMELINE-01: 时间线基础显示', async ({ page }) => {
    // Given: 注入模拟的对话历史数据（50条消息）
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      const now = new Date();
      const messages = [];

      // 生成今天的消息（30条）
      for (let i = 0; i < 30; i++) {
        const timestamp = new Date(now.getTime() - (30 - i) * 2 * 60 * 1000); // 每2分钟一条
        messages.push({
          id: `msg-today-${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `消息 ${i + 1}: ${i % 2 === 0 ? '用户提问' : 'AI 回复'}`,
          timestamp: timestamp.getTime() // 使用数字时间戳
        });
      }

      // 生成昨天的消息（20条）
      for (let i = 0; i < 20; i++) {
        const timestamp = new Date(now.getTime() - 24 * 60 * 60 * 1000 - (20 - i) * 5 * 60 * 1000);
        messages.push({
          id: `msg-yesterday-${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `昨天消息 ${i + 1}`,
          timestamp: timestamp.getTime() // 使用数字时间戳
        });
      }

      // 设置消息
      if (chatStore && chatStore.setState) {
        chatStore.setState({ messages: messages.reverse() });
        console.log('[Test] ✅ 已设置消息数量:', messages.length);
      } else {
        console.log('[Test] ❌ chatStore 或 setState 不可用');
      }
    });

    // 验证消息是否真正被设置
    const afterSet = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const msgs = chatStore ? chatStore.getState().messages : [];
      return {
        storeExists: !!chatStore,
        messageCount: msgs.length,
        firstMessage: msgs[0] ? { id: msgs[0].id, content: msgs[0].content, timestamp: msgs[0].timestamp } : null
      };
    });
    console.log('[Test] 设置后状态:', JSON.stringify(afterSet, null, 2));

    await page.waitForTimeout(2000);

    // When: 切换到时间线视图
    const timelineButton = await page.$('[data-testid="timeline-view-toggle"]');
    if (timelineButton) {
      await timelineButton.click();
      // 等待时间线组件渲染
      await page.waitForTimeout(2000);
    } else {
      console.log('[Test] ⚠️  未找到时间线视图切换按钮');
    }

    // Then: 验证时间线基础显示和气泡样式
    const timelineState = await page.evaluate(() => {
      const timelineContainer = document.querySelector('[data-testid="timeline-view"]');
      if (!timelineContainer) return { exists: false };

      const userBubbles = document.querySelectorAll('[data-testid^="timeline-user-bubble-"]');
      const aiBubbles = document.querySelectorAll('[data-testid^="timeline-ai-bubble-"]');

      // 验证用户气泡在左侧
      const userBubblePositions = Array.from(userBubbles).map(bubble => {
        const styles = window.getComputedStyle(bubble);
        return {
          alignSelf: styles.alignSelf,
          backgroundColor: styles.backgroundColor
        };
      });

      // 验证AI气泡在右侧
      const aiBubblePositions = Array.from(aiBubbles).map(bubble => {
        const styles = window.getComputedStyle(bubble);
        return {
          alignSelf: styles.alignSelf,
          backgroundColor: styles.backgroundColor
        };
      });

      return {
        exists: true,
        userBubbleCount: userBubbles.length,
        aiBubbleCount: aiBubbles.length,
        userBubblesLeftAligned: userBubblePositions.every(p => p.alignSelf === 'flex-start'),
        aiBubblesRightAligned: aiBubblePositions.every(p => p.alignSelf === 'flex-end'),
        userBubbleColor: userBubblePositions[0]?.backgroundColor || '',
        aiBubbleColor: aiBubblePositions[0]?.backgroundColor || '',
        hasTodayGroup: document.querySelector('[data-testid="timeline-group-today"]') !== null,
        hasYesterdayGroup: document.querySelector('[data-testid="timeline-group-yesterday"]') !== null
      };
    });

    console.log('[Test] 时间线气泡状态:', JSON.stringify(timelineState, null, 2));

    // 验证时间线基础显示和气泡样式
    expect(timelineState.exists).toBe(true);
    expect(timelineState.userBubbleCount).toBeGreaterThan(0);
    expect(timelineState.aiBubbleCount).toBeGreaterThan(0);
    expect(timelineState.userBubblesLeftAligned).toBe(true);
    expect(timelineState.aiBubblesRightAligned).toBe(true);
  });

  test('TIMELINE-02: 点击气泡跳转', async ({ page }) => {
    // Given: 准备测试数据
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      const now = new Date();
      const targetMessage = {
        id: 'target-message-123',
        role: 'assistant' as const,
        content: '这是一条测试消息，用于验证点击气泡跳转功能',
        timestamp: now.getTime()
      };

      if (chatStore && chatStore.setState) {
        chatStore.setState({ messages: [targetMessage] });
        console.log('[Test] ✅ 已设置目标消息');
      } else {
        console.log('[Test] ❌ chatStore 或 setState 不可用');
      }
    });

    await page.waitForTimeout(1000);

    // When: 切换到时间线并点击气泡
    const timelineButton = await page.$('[data-testid="timeline-view-toggle"]');
    if (timelineButton) {
      await timelineButton.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('[Test] ⚠️  未找到时间线视图切换按钮');
    }

    const clickResult = await page.evaluate(() => {
      const aiBubble = document.querySelector('[data-testid^="timeline-ai-bubble-"]');
      if (!aiBubble) return { clicked: false };

      (aiBubble as HTMLElement).click();
      return { clicked: true };
    });

    await page.waitForTimeout(500);

    // Then: 验证跳转行为
    const navigationState = await page.evaluate(() => {
      const highlightedMessage = document.querySelector('[data-testid="message-target-message-123"]');
      const chatPanel = document.querySelector('[class*="chat"][class*="panel"]');

      return {
        messageHighlighted: highlightedMessage !== null,
        scrolledToMessage: chatPanel ? chatPanel.scrollTop > 0 : false
      };
    });

    console.log('[Test] 跳转状态:', JSON.stringify(navigationState, null, 2));

    // 验证点击气泡跳转
    expect(navigationState.messageHighlighted).toBe(true);
  });

  test('TIMELINE-03: 长消息折叠', async ({ page }) => {
    // Given: 注入包含长代码块的消息
    const longCodeMessage = `这是一个包含长代码的消息：

\`\`\`typescript
${Array.from({ length: 50 }, (_, i) => `const line${i + 1} = "这是第 ${i + 1} 行代码";`).join('\n')}
\`\`\`

代码结束。`;

    await page.evaluate((content) => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      const now = new Date();
      const messages = [{
        id: 'msg-with-code',
        role: 'assistant',
        content: content, // 修复：使用纯字符串而不是 { Text: content }
        timestamp: now.getTime() // 修复：使用数字时间戳
      }];

      chatStore.setState({ messages });
    }, longCodeMessage);

    await page.waitForTimeout(1000);

    // When: 切换到时间线视图
    const timelineButton = await page.$('[data-testid="timeline-view-toggle"]');
    if (timelineButton) {
      await timelineButton.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('[Test] ⚠️  未找到时间线视图切换按钮');
    }

    // Then: 验证折叠功能
    const collapseState = await page.evaluate(() => {
      const codeBlock = document.querySelector('[data-testid="timeline-code-block"]');
      const collapseButton = document.querySelector('[data-testid="code-collapse-button"]');

      return {
        hasCodeBlock: codeBlock !== null,
        hasCollapseButton: collapseButton !== null,
        buttonText: collapseButton?.textContent || null
      };
    });

    console.log('[Test] 折叠状态:', JSON.stringify(collapseState, null, 2));

    // 验证长代码块折叠显示
    expect(collapseState.hasCodeBlock).toBe(true);
    expect(collapseState.hasCollapseButton).toBe(true);
  });

  test('TIMELINE-04: 时间分组', async ({ page }) => {
    // Given: 注入跨天消息
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      const now = new Date();
      const messages = [
        {
          id: 'msg-today-1',
          role: 'user',
          content: '今天的消息',
          timestamp: now.getTime()
        },
        {
          id: 'msg-today-2',
          role: 'assistant',
          content: '今天的回复',
          timestamp: now.getTime()
        },
        {
          id: 'msg-yesterday-1',
          role: 'user',
          content: '昨天的消息',
          timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000).getTime()
        }
      ];

      if (chatStore && chatStore.setState) {
        chatStore.setState({ messages });
      }
    });

    await page.waitForTimeout(1000);

    // When: 切换到时间线
    const timelineButton = await page.$('[data-testid="timeline-view-toggle"]');
    if (timelineButton) {
      await timelineButton.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('[Test] ⚠️  未找到时间线视图切换按钮');
    }

    // Then: 验证分组
    const groupState = await page.evaluate(() => {
      const todayGroup = document.querySelector('[data-testid="timeline-group-today"]');
      const yesterdayGroup = document.querySelector('[data-testid="timeline-group-yesterday"]');

      return {
        hasTodayGroup: todayGroup !== null,
        hasYesterdayGroup: yesterdayGroup !== null,
        todayLabel: todayGroup?.querySelector('[data-testid="group-label"]')?.textContent || '',
        yesterdayLabel: yesterdayGroup?.querySelector('[data-testid="group-label"]')?.textContent || ''
      };
    });

    console.log('[Test] 分组状态:', JSON.stringify(groupState, null, 2));

    // 验证应按"今天"、"昨天"分组
    expect(groupState.hasTodayGroup).toBe(true);
    expect(groupState.hasYesterdayGroup).toBe(true);
  });

  test('TIMELINE-05: 分步加载（渐进式渲染）', async ({ page }) => {
    // Given: 模拟50条消息的场景
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      const now = new Date();
      const messages = Array.from({ length: 50 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `消息 ${i + 1}`,
        timestamp: new Date(now.getTime() - (50 - i) * 60 * 1000).getTime()
      }));

      if (chatStore && chatStore.setState) {
        chatStore.setState({ messages });
      }
    });

    await page.waitForTimeout(1000);

    // When: 切换到时间线视图
    const timelineButton = await page.$('[data-testid="timeline-view-toggle"]');
    if (timelineButton) {
      await timelineButton.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('[Test] ⚠️  未找到时间线视图切换按钮');
    }

    // Then: 验证分步加载
    const loadingState = await page.evaluate(() => {
      const userBubbles = document.querySelectorAll('[data-testid^="timeline-user-bubble-"]');
      const aiBubbles = document.querySelectorAll('[data-testid^="timeline-ai-bubble-"]');
      const totalBubbles = userBubbles.length + aiBubbles.length;

      const progressIndicator = document.querySelector('[data-testid="timeline-progress"]');
      const skeletonPlaceholders = document.querySelectorAll('[data-testid^="timeline-skeleton-"]');

      return {
        initialLoadedCount: totalBubbles,
        userBubbleCount: userBubbles.length,
        aiBubbleCount: aiBubbles.length,
        hasProgressIndicator: progressIndicator !== null,
        progressText: progressIndicator?.textContent || '',
        skeletonCount: skeletonPlaceholders.length
      };
    });

    console.log('[Test] 分步加载状态:', JSON.stringify(loadingState, null, 2));

    // ⚠️ 关键测试：验证初始只加载10条
    // 验证初始应只加载10条消息，滚动后加载更多
    expect(loadingState.initialLoadedCount).toBeLessThanOrEqual(10);
    expect(loadingState.hasProgressIndicator).toBe(true);
    expect(loadingState.progressText).toContain('已加载');
  });

  test('TIMELINE-06: 网络超时保护', async ({ page }) => {
    // Given: 注入消息并设置很短的超时时间以触发超时
    await page.evaluate(() => {
      // 设置超时测试模式标志 - 使用更短的超时时间（1秒）
      (window as any).__TIMEOUT_TEST_MODE__ = true;
      (window as any).__TIMEOUT_TEST_MS__ = 1000; // 1秒超时

      console.log('[Test] __TIMEOUT_TEST_MODE__ set to:', (window as any).__TIMEOUT_TEST_MODE__);
      console.log('[Test] __TIMEOUT_TEST_MS__ set to:', (window as any).__TIMEOUT_TEST_MS__);

      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      const now = new Date();
      const messages = Array.from({ length: 20 }, (_, i) => ({
        id: `msg-timeout-${i}`,
        role: 'user',
        content: `消息 ${i + 1}`,
        timestamp: new Date(now.getTime() - (20 - i) * 60 * 1000).getTime()
      }));

      if (chatStore && chatStore.setState) {
        chatStore.setState({ messages });
      }
    });

    await page.waitForTimeout(1000);

    // When: 切换到时间线并尝试加载
    const timelineButton = await page.$('[data-testid="timeline-view-toggle"]');
    if (timelineButton) {
      await timelineButton.click();
      await page.waitForTimeout(6000); // 等待超时（5秒超时保护）
    } else {
      console.log('[Test] ⚠️  未找到时间线视图切换按钮');
    }

    // Then: 验证超时保护
    const timeoutState = await page.evaluate(() => {
      const retryButton = document.querySelector('[data-testid="timeline-retry-button"]');
      const userBubbles = document.querySelectorAll('[data-testid^="timeline-user-bubble-"]');
      const aiBubbles = document.querySelectorAll('[data-testid^="timeline-ai-bubble-"]');
      const errorMessage = document.querySelector('[data-testid="timeline-error-message"]');

      return {
        hasRetryButton: retryButton !== null,
        retryButtonText: retryButton?.textContent || '',
        errorMessage: errorMessage?.textContent || '',
        loadedBubblesCount: userBubbles.length + aiBubbles.length,
        hasLoadedBubbles: (userBubbles.length + aiBubbles.length) > 0
      };
    });

    console.log('[Test] 超时保护状态:', JSON.stringify(timeoutState, null, 2));

    // ⚠️ 关键测试：验证超时时不丢失已加载内容
    // 验证超时应显示重试按钮，保留已加载内容
    expect(timeoutState.hasRetryButton).toBe(true);
    expect(timeoutState.retryButtonText).toContain('重试');
    expect(timeoutState.hasLoadedBubbles).toBe(true);
  });

  test('TIMELINE-07: 乐观更新（新消息）', async ({ page }) => {
    // Given: 准备初始状态
    await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      const now = new Date();
      const messages = [{
        id: 'msg-initial-1',
        role: 'user',
        content: '初始消息',
        timestamp: now.getTime()
      }];

      // 直接使用 chatStore.setState (不是 getState().setState)
      chatStore.setState({ messages });
    });

    await page.waitForTimeout(1000);

    // When: 切换到时间线并发送新消息
    const timelineButton = await page.$('[data-testid="timeline-view-toggle"]');
    if (timelineButton) {
      await timelineButton.click();
      await page.waitForTimeout(1000);
    } else {
      console.log('[Test] ⚠️  未找到时间线视图切换按钮');
    }

    // 模拟发送新消息 - 使用 setState 确保消息正确添加
    const newMessageTimestamp = Date.now();

    // 调试：检查当前消息数量
    const beforeAdd = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      return {
        messageCount: chatStore ? chatStore.getState().messages.length : 0,
        messages: chatStore ? chatStore.getState().messages.map((m: any) => ({ id: m.id, content: m.content })) : []
      };
    });
    console.log('[Test] 添加新消息前的状态:', JSON.stringify(beforeAdd, null, 2));

    await page.evaluate((ts) => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return;

      // 获取当前消息并添加新消息
      const currentMessages = chatStore.getState().messages || [];
      const newMessage = {
        id: 'msg-new-' + ts,
        role: 'user',
        content: '新发送的消息',
        timestamp: ts
      };

      console.log('[Test] 当前消息数量:', currentMessages.length);
      console.log('[Test] 新消息:', newMessage);

      // 使用 setState 设置包含新旧消息的数组
      chatStore.setState({ messages: [...currentMessages, newMessage] });

      console.log('[Test] 设置后的消息数量:', chatStore.getState().messages.length);
    }, newMessageTimestamp);

    await page.waitForTimeout(1000); // 增加等待时间

    // Then: 验证乐观更新
    const optimisticState = await page.evaluate(() => {
      const userBubbles = document.querySelectorAll('[data-testid^="timeline-user-bubble-"]');
      const firstBubble = userBubbles[0];

      return {
        totalBubbles: userBubbles.length,
        firstBubbleText: firstBubble?.querySelector('[data-testid="bubble-content"]')?.textContent || '',
        firstBubbleTime: firstBubble?.querySelector('[data-testid="timeline-time"]')?.textContent || ''
      };
    });

    console.log('[Test] 乐观更新状态:', JSON.stringify(optimisticState, null, 2));

    // ⚠️ 关键测试：验证新消息立即显示
    // 验证新消息应立即显示在时间线，不等待网络响应
    expect(optimisticState.totalBubbles).toBeGreaterThan(1);
    expect(optimisticState.firstBubbleText).toContain('新发送的消息');
  });
});

/**
 * 📋 测试评审总结
 *
 * ✅ 测试覆盖的场景：
 * 1. 时间线基础显示 - 验证气泡样式（用户左对齐，AI右对齐）
 * 2. 点击气泡跳转 - 验证导航和高亮
 * 3. 长消息折叠 - 验证代码块折叠
 * 4. 时间分组 - 验证今天/昨天分组
 * 5. 分步加载（渐进式渲染）- 验证初始只加载10条
 * 6. 网络超时保护 - 验证超时重试机制
 * 7. 乐观更新（新消息）- 验证新消息立即显示
 *
 * 🎯 关键设计决策：
 * - 用户反馈: "还是气泡 不要用户和AI放在一起"
 * - 用户反馈: "UI上最好有个直观的时间轴 内容太多 分步写入 不要因为网络原因超时"
 * - 气泡样式: 用户左对齐（蓝色），AI右对齐（深色）
 * - 初始批次: 10条消息
 * - 增量加载: 滚动到底部加载更多10条
 * - 超时保护: 5秒超时 + 重试按钮
 * - 骨架屏: 先显示占位符，再填充内容
 * - 乐观更新: 新消息立即插入
 *
 * 📊 测试数据收集：
 * - 用户/AI气泡数量
 * - 气泡对齐方式验证
 * - 加载进度显示
 * - 骨架屏数量
 * - 超时错误信息
 * - 已加载内容保留
 *
 * 📸 生成的截图：
 * - 无（功能未实现，测试处于skip状态）
 *
 * 🔄 与现有功能集成：
 * - 对话历史面板: 添加时间线视图切换按钮
 * - 聊天消息: 与时间线联动跳转
 * - 搜索功能: 时间线与搜索结果联动
 */
