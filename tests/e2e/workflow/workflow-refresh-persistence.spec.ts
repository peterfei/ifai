/**
 * 🎯 高保真测试 - 工作流消息刷新后持久化
 *
 * 这个测试验证：
 * 1. workflow:response 的内容应该被正确保存到 localStorage
 * 2. 刷新页面后，workflow:response 的内容应该恢复
 * 3. 刷新后，消息的 metadata（workflowId, workflowType）应该保留
 * 4. 刷新后，不应该显示默认的"节点执行概览"模板
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('工作流消息刷新后持久化', () => {

  test('✅ 验证 workflow:response 内容在刷新后保留', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 设置必要的 store
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;

      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.setState({
          providers: [{
            id: 'test-provider',
            name: 'Test Provider',
            apiKey: 'test-key',
            enabled: true,
            base: 'https://api.test.com',
            models: ['test-model']
          }],
          currentProviderId: 'test-provider',
          currentModel: 'test-model'
        });
      }
    });

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(2000);

    // 🔥 测试场景：模拟 /explore 工作流的完整生命周期
    const workflowId = 'workflow-refresh-test-' + Date.now();
    const userMessageId = 'user-refresh-' + Date.now();
    const assistantMessageId = 'assistant-refresh-' + Date.now();

    console.log('📝 [Test] 步骤 1: 创建用户和助手消息');

    // 1. 创建用户消息
    await page.evaluate(({ uid }) => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) {
        console.error('[Test] ❌ chatStore not found');
        return;
      }

      chatStore.getState().addMessage({
        id: uid,
        role: 'user' as const,
        content: '/explore',
        timestamp: Date.now()
      });

      console.log('[Test] ✅ 用户消息已创建');
    }, { uid: userMessageId });

    await page.waitForTimeout(300);

    // 2. 创建助手消息
    await page.evaluate(({ aid, wid }) => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) {
        console.error('[Test] ❌ chatStore not found');
        return;
      }

      chatStore.getState().addMessage({
        id: aid,
        role: 'assistant' as const,
        content: '🚀 正在启动 **代码探索** 工作流',
        timestamp: Date.now(),
        status: 'streaming' as const,
        metadata: {
          workflowId: wid,
          workflowType: 'explore'
        }
      });

      console.log('[Test] ✅ 助手消息已创建');
    }, { aid: assistantMessageId, wid: workflowId });

    await page.waitForTimeout(300);

    console.log('📝 [Test] 步骤 2: 发送 workflow:response 事件');

    // 3. 发送 workflow:response 事件（LLM 返回的最终总结）
    const llmFinalSummary = `## 📊 代码探索总结

我已完成对项目的探索分析，以下是关键发现：

### 🏗️ 项目结构
- **主入口**: src/main.js
- **核心模块**: src/modules/
- **配置文件**: package.json, vite.config.js

### 🔍 主要功能
1. **用户认证系统** - 基于 JWT 的完整认证流程
2. **数据可视化** - 集成 Chart.js 实现实时数据展示
3. **API 管理** - RESTful API 设计，支持分页和过滤

### 💡 技术栈
- **前端框架**: React + TypeScript
- **构建工具**: Vite
- **UI 库**: Tailwind CSS
- **状态管理**: Zustand

### 📈 代码质量
- ✅ TypeScript 类型覆盖率高
- ✅ 模块化设计清晰
- ✅ 良好的错误处理机制

### 🎯 建议
项目整体架构合理，代码组织良好。建议优化：
1. 添加单元测试覆盖
2. 优化大组件拆分
3. 补充 API 文档`;

    await page.evaluate(({ aid, wid, summary }) => {
      const chatEventBus = (window as any).__chatEventBus;
      if (chatEventBus) {
        chatEventBus.emit('workflow:response', {
          correlationId: aid,
          workflowId: wid,
          workflowType: 'explore',
          response: summary,
          timestamp: Date.now()
        });
        console.log('[Test] ✅ workflow:response 事件已发送');
      }
    }, { aid: assistantMessageId, wid: workflowId, summary: llmFinalSummary });

    await page.waitForTimeout(500);

    // 4. 验证刷新前的内容
    console.log('📝 [Test] 步骤 3: 验证刷新前的内容');

    const contentBeforeRefresh = await page.evaluate(({ aid }) => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      const assistantMessage = messages.find((m: any) => m.id === aid);

      return {
        hasMessage: !!assistantMessage,
        content: assistantMessage?.content || '',
        contentLength: assistantMessage?.content?.length || 0,
        hasLLMSummary: assistantMessage?.content?.includes('代码探索总结'),
        hasProjectStructure: assistantMessage?.content?.includes('项目结构'),
        hasTechStack: assistantMessage?.content?.includes('技术栈'),
        hasSuggestions: assistantMessage?.content?.includes('建议'),
        metadata: assistantMessage?.metadata || {}
      };
    }, { aid: assistantMessageId });

    console.log('📊 [Test] 刷新前内容分析:', contentBeforeRefresh);

    // ✅ 断言：验证刷新前的内容
    expect(contentBeforeRefresh.hasMessage).toBe(true);
    expect(contentBeforeRefresh.hasLLMSummary).toBe(true);
    expect(contentBeforeRefresh.hasProjectStructure).toBe(true);
    expect(contentBeforeRefresh.hasTechStack).toBe(true);
    expect(contentBeforeRefresh.hasSuggestions).toBe(true);
    expect(contentBeforeRefresh.metadata.workflowId).toBe(workflowId);
    expect(contentBeforeRefresh.metadata.workflowType).toBe('explore');

    console.log('📝 [Test] 步骤 4: 刷新页面');

    // 5. 刷新页面
    await page.reload();
    await page.waitForTimeout(3000);

    // 重新打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(2000);

    // 6. 验证刷新后的内容
    console.log('📝 [Test] 步骤 5: 验证刷新后的内容');

    const contentAfterRefresh = await page.evaluate(({ aid }) => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      const assistantMessage = messages.find((m: any) => m.id === aid);

      return {
        hasMessage: !!assistantMessage,
        content: assistantMessage?.content || '',
        contentLength: assistantMessage?.content?.length || 0,
        hasLLMSummary: assistantMessage?.content?.includes('代码探索总结'),
        hasProjectStructure: assistantMessage?.content?.includes('项目结构'),
        hasTechStack: assistantMessage?.content?.includes('技术栈'),
        hasSuggestions: assistantMessage?.content?.includes('建议'),
        hasDefaultTemplate: assistantMessage?.content?.includes('节点执行概览'),
        hasWorkflowCompleted: assistantMessage?.content?.includes('工作流执行完成'),
        metadata: assistantMessage?.metadata || {}
      };
    }, { aid: assistantMessageId });

    console.log('📊 [Test] 刷新后内容分析:', contentAfterRefresh);

    // ✅ 断言：验证刷新后的内容
    expect(contentAfterRefresh.hasMessage).toBe(true, '消息应该存在');
    expect(contentAfterRefresh.hasLLMSummary).toBe(true, '应该包含 "代码探索总结"');
    expect(contentAfterRefresh.hasProjectStructure).toBe(true, '应该包含 "项目结构"');
    expect(contentAfterRefresh.hasTechStack).toBe(true, '应该包含 "技术栈"');
    expect(contentAfterRefresh.hasSuggestions).toBe(true, '应该包含 "建议"');
    expect(contentAfterRefresh.hasDefaultTemplate).toBe(false, '不应该包含默认模板');
    expect(contentAfterRefresh.hasWorkflowCompleted).toBe(false, '不应该包含 "工作流执行完成"');
    expect(contentAfterRefresh.metadata.workflowId).toBe(workflowId, 'workflowId 应该保留');
    expect(contentAfterRefresh.metadata.workflowType).toBe('explore', 'workflowType 应该保留');

    // ✅ 断言：验证刷新前后内容一致
    expect(contentAfterRefresh.content).toBe(contentBeforeRefresh.content, '刷新前后内容应该一致');

    console.log('✅ [Test] 工作流消息刷新后持久化测试通过！');
  });

  test('✅ 验证多次 workflow 事件后刷新仍然保留正确内容', async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 设置必要的 store
    await page.evaluate(() => {
      localStorage.setItem('tour_completed', 'true');
      localStorage.setItem('onboarding_done', 'true');
      (window as any).__E2E__ = true;
    });

    // 打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(2000);

    // 🔥 测试场景：发送多个 /explore，验证刷新后各自保留正确内容
    const exploreCount = 3;
    const workflows = [];

    for (let i = 1; i <= exploreCount; i++) {
      const workflowId = `workflow-refresh-${i}-${Date.now()}`;
      const userMessageId = `user-refresh-${i}-${Date.now()}`;
      const assistantMessageId = `assistant-refresh-${i}-${Date.now()}`;

      console.log(`📝 [Test] 创建第 ${i} 个工作流`);

      // 创建用户和助手消息
      await page.evaluate(({ i, uid, aid, wid }) => {
        const chatStore = (window as any).__chatStore;
        if (!chatStore) {
          console.error('[Test] ❌ chatStore not found');
          return;
        }

        // 用户消息
        chatStore.getState().addMessage({
          id: uid,
          role: 'user' as const,
          content: '/explore',
          timestamp: Date.now()
        });

        // 助手消息
        chatStore.getState().addMessage({
          id: aid,
          role: 'assistant' as const,
          content: `🚀 正在启动 **代码探索** 工作流 (第 ${i} 次)`,
          timestamp: Date.now(),
          status: 'streaming' as const,
          metadata: {
            workflowId: wid,
            workflowType: 'explore'
          }
        });

        console.log(`[Test] ✅ 第 ${i} 个消息已创建`);
      }, { i, uid: userMessageId, aid: assistantMessageId, wid: workflowId });

      await page.waitForTimeout(200);

      // 发送 workflow:response 事件（每次返回不同的总结）
      const summary = `## 📊 代码探索总结 - 第 ${i} 次

### 🔍 发现 ${i} 个关键模块
- 模块 A: 功能描述 ${i}
- 模块 B: 功能描述 ${i}
- 模块 C: 功能描述 ${i}

### 💡 第 ${i} 次探索的建议
${i === 1 ? '建议优化模块 A' : i === 2 ? '建议重构模块 B' : '建议添加测试覆盖'}`;

      await page.evaluate(({ aid, wid, summary }) => {
        const chatEventBus = (window as any).__chatEventBus;
        if (chatEventBus) {
          chatEventBus.emit('workflow:response', {
            correlationId: aid,
            workflowId: wid,
            workflowType: 'explore',
            response: summary,
            timestamp: Date.now()
          });
          console.log('[Test] ✅ workflow:response 事件已发送');
        }
      }, { aid: assistantMessageId, wid: workflowId, summary });

      await page.waitForTimeout(200);

      workflows.push({
        index: i,
        workflowId,
        assistantMessageId,
        expectedSummary: `第 ${i} 次探索的建议`
      });
    }

    // 刷新页面
    console.log('📝 [Test] 刷新页面');
    await page.reload();
    await page.waitForTimeout(3000);

    // 重新打开聊天面板
    await page.evaluate(() => {
      const layoutStore = (window as any).__layoutStore;
      if (layoutStore) {
        layoutStore.setState({ isChatOpen: true });
      }
    });

    await page.waitForTimeout(2000);

    // 验证刷新后每个工作流的内容
    console.log('📝 [Test] 验证刷新后每个工作流的内容');

    const verification = await page.evaluate(({ workflows }) => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];

      return workflows.map(wf => {
        const assistantMessage = messages.find((m: any) => m.id === wf.assistantMessageId);

        return {
          index: wf.index,
          hasMessage: !!assistantMessage,
          contentLength: assistantMessage?.content?.length || 0,
          hasExpectedSummary: assistantMessage?.content?.includes(wf.expectedSummary),
          hasDefaultTemplate: assistantMessage?.content?.includes('节点执行概览'),
          hasWorkflowCompleted: assistantMessage?.content?.includes('工作流执行完成'),
          contentPreview: assistantMessage?.content?.substring(0, 150) || ''
        };
      });
    }, { workflows });

    console.log('📊 [Test] 刷新后验证结果:', verification);

    // ✅ 断言：验证每个工作流的内容都正确保留
    verification.forEach(v => {
      expect(v.hasMessage).toBe(true, `第 ${v.index} 个消息应该存在`);
      expect(v.hasExpectedSummary).toBe(true, `第 ${v.index} 个应该包含 "${v.expectedSummary}"`);
      expect(v.hasDefaultTemplate).toBe(false, `第 ${v.index} 个不应该包含默认模板`);
      expect(v.hasWorkflowCompleted).toBe(false, `第 ${v.index} 个不应该包含 "工作流执行完成"`);
    });

    console.log('✅ [Test] 多个工作流刷新后内容保留测试通过！');
  });
});
