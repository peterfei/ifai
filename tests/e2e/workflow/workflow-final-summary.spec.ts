/**
 * 🎯 高保真测试 - 工作流结束后显示 LLM 总结
 *
 * 这个测试验证：
 * 1. 工作流结束后应该显示 LLM 返回的最终总结
 * 2. 而不是过程中的工具调用描述
 * 3. workflow:response 的内容应该被保留，不被 workflow:completed 覆盖
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

test.describe('工作流最终总结显示', () => {

  test('✅ 验证工作流结束后显示 LLM 总结而非过程描述', async ({ page }) => {
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
    const workflowId = 'workflow-explore-final-' + Date.now();
    const userMessageId = 'user-explore-' + Date.now();
    const assistantMessageId = 'assistant-explore-' + Date.now();

    console.log('📝 [Test] 步骤 1: 用户发送 /explore 命令');

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

    // 2. 创建初始助手消息
    await page.evaluate(({ aid, wid }) => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) {
        console.error('[Test] ❌ chatStore not found');
        return;
      }

      chatStore.getState().addMessage({
        id: aid,
        role: 'assistant' as const,
        content: '🚀 正在启动 **代码探索** 工作流\n\n快速探索和分析项目结构',
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

    // 3. 发送工作流开始事件
    await page.evaluate(({ wid }) => {
      const chatEventBus = (window as any).__chatEventBus;
      if (chatEventBus) {
        chatEventBus.emit('workflow:started', {
          workflowId: wid,
          workflowType: 'explore',
          targetPath: '.',
          timestamp: Date.now()
        });
        console.log('[Test] ✅ workflow:started 事件已发送');
      }
    }, { wid: workflowId });

    await page.waitForTimeout(300);

    // 4. 模拟工具调用进度事件（这是过程中的描述）
    console.log('📝 [Test] 步骤 2: 模拟工具调用进度');

    await page.evaluate(({ wid }) => {
      const chatEventBus = (window as any).__chatEventBus;
      if (chatEventBus) {
        // 模拟 node_started 事件
        chatEventBus.emit('workflow:progress', {
          workflowId: wid,
          event_type: 'node_started',
          node_id: 'explore-agent',
          message: '开始执行节点: Explore 项目结构',
          timestamp: Date.now()
        });

        // 模拟 tool_call 事件（过程中的工具调用）
        chatEventBus.emit('workflow:progress', {
          workflowId: wid,
          event_type: 'tool_call',
          node_id: 'explore-agent',
          message: '工具调用: agent_scan_project',
          timestamp: Date.now(),
          tool_details: {
            tool_name: 'agent_scan_project',
            tool_input: JSON.stringify({ pattern: '**/*', path: '.' }),
            tool_output: JSON.stringify({ files: ['src/main.js', 'src/modules/'] }),
            output_length: 150,
            execution_time_ms: 300,
            is_error: false
          }
        });

        console.log('[Test] ✅ 工具调用进度事件已发送');
      }
    }, { wid: workflowId });

    await page.waitForTimeout(500);

    // 5. 模拟 workflow:response 事件（LLM 返回的最终总结）
    console.log('📝 [Test] 步骤 3: 模拟 LLM 返回最终总结');

    await page.evaluate(({ aid, wid }) => {
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

      const chatEventBus = (window as any).__chatEventBus;
      if (chatEventBus) {
        chatEventBus.emit('workflow:response', {
          correlationId: aid,  // 🔥 关键：使用 assistantMessageId 作为 correlationId
          workflowId: wid,
          workflowType: 'explore',
          response: llmFinalSummary,  // 🔥 LLM 返回的最终总结
          timestamp: Date.now()
        });
        console.log('[Test] ✅ workflow:response 事件已发送（LLM 最终总结）');
      }
    }, { aid: assistantMessageId, wid: workflowId });

    await page.waitForTimeout(500);

    // 6. 模拟 workflow:completed 事件（工作流完成）
    console.log('📝 [Test] 步骤 4: 模拟工作流完成');

    await page.evaluate(({ wid }) => {
      const chatEventBus = (window as any).__chatEventBus;
      if (chatEventBus) {
        chatEventBus.emit('workflow:completed', {
          workflow_id: wid,
          status: 'completed',
          node_results: {
            'explore-agent': {
              node_id: 'explore-agent',
              status: 'completed',
              output: '探索完成'  // 🔥 注意：这里不应该覆盖 workflow:response 的内容
            }
          },
          started_at: Date.now() - 5000,
          completed_at: Date.now()
        });
        console.log('[Test] ✅ workflow:completed 事件已发送');
      }
    }, { wid: workflowId });

    await page.waitForTimeout(500);

    // 🔥 验证：检查最终显示的内容
    console.log('📝 [Test] 步骤 5: 验证最终显示的内容');

    const finalContent = await page.evaluate(({ aid }) => {
      const chatStore = (window as any).__chatStore;
      const messages = chatStore?.getState()?.messages || [];
      const assistantMessage = messages.find((m: any) => m.id === aid);

      return {
        hasMessage: !!assistantMessage,
        content: assistantMessage?.content || '',
        contentLength: assistantMessage?.content?.length || 0,
        // 🔥 检查是否包含 LLM 总结的关键特征
        hasLLMSummary: assistantMessage?.content?.includes('代码探索总结'),
        hasProjectStructure: assistantMessage?.content?.includes('项目结构'),
        hasTechStack: assistantMessage?.content?.includes('技术栈'),
        hasSuggestions: assistantMessage?.content?.includes('建议'),
        // 🔥 检查是否包含过程中的描述（不应该出现）
        hasProcessDescription: assistantMessage?.content?.includes('现在读取'),
        hasToolCallMention: assistantMessage?.content?.includes('tool_call:agent_read_file'),
        // 🔥 检查是否包含默认的 workflow:completed 模板
        hasDefaultTemplate: assistantMessage?.content?.includes('节点执行概览'),
        contentPreview: assistantMessage?.content?.substring(0, 200) || ''
      };
    }, { aid: assistantMessageId });

    console.log('📊 [Test] 最终内容分析:', finalContent);

    // ✅ 断言：验证最终显示的是 LLM 总结
    expect(finalContent.hasMessage).toBe(true);
    expect(finalContent.hasLLMSummary).toBe(true, '应该包含 "代码探索总结"');
    expect(finalContent.hasProjectStructure).toBe(true, '应该包含 "项目结构"');
    expect(finalContent.hasTechStack).toBe(true, '应该包含 "技术栈"');
    expect(finalContent.hasSuggestions).toBe(true, '应该包含 "建议"');

    // ✅ 断言：验证不应该包含过程描述
    expect(finalContent.hasProcessDescription).toBe(false, '不应该包含 "现在读取" 等过程描述');
    expect(finalContent.hasToolCallMention).toBe(false, '不应该包含 "tool_call:agent_read_file" 等工具调用描述');
    expect(finalContent.hasDefaultTemplate).toBe(false, '不应该包含默认的 "节点执行概览" 模板');

    console.log('✅ [Test] 工作流结束后显示 LLM 总结测试通过！');
  });

  test('✅ 验证多次 /explore 后显示各自的内容而非默认模板', async ({ page }) => {
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

    // 🔥 测试场景：连续发送 3 次 /explore，每次返回不同的总结
    const exploreCount = 3;
    const workflows = [];

    for (let i = 1; i <= exploreCount; i++) {
      const workflowId = `workflow-explore-${i}-${Date.now()}`;
      const userMessageId = `user-explore-${i}-${Date.now()}`;
      const assistantMessageId = `assistant-explore-${i}-${Date.now()}`;

      console.log(`📝 [Test] 发送第 ${i} 次 /explore`);

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

        console.log(`[Test] ✅ 第 ${i} 次消息已创建`);
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

      // 发送 workflow:completed 事件
      await page.evaluate(({ wid }) => {
        const chatEventBus = (window as any).__chatEventBus;
        if (chatEventBus) {
          chatEventBus.emit('workflow:completed', {
            workflow_id: wid,
            status: 'completed',
            node_results: {},
            started_at: Date.now() - 5000,
            completed_at: Date.now()
          });
          console.log('[Test] ✅ workflow:completed 事件已发送');
        }
      }, { wid: workflowId });

      await page.waitForTimeout(200);

      workflows.push({
        index: i,
        workflowId,
        assistantMessageId,
        expectedSummary: `第 ${i} 次探索的建议`
      });
    }

    // 🔥 验证：检查每次 /explore 都显示了各自的内容
    console.log('📝 [Test] 验证每次 /explore 的内容');

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

    console.log('📊 [Test] 验证结果:', verification);

    // ✅ 断言：验证每次 /explore 都显示了各自的内容
    verification.forEach(v => {
      expect(v.hasMessage).toBe(true);
      expect(v.hasExpectedSummary).toBe(true, `第 ${v.index} 次应该包含 "第 ${v.index} 次探索的建议"`);
      expect(v.hasDefaultTemplate).toBe(false, `第 ${v.index} 次不应该包含默认模板`);
      expect(v.hasWorkflowCompleted).toBe(false, `第 ${v.index} 次不应该包含 "工作流执行完成"`);
    });

    console.log('✅ [Test] 多次 /explore 显示各自内容测试通过！');
  });
});
