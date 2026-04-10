/**
 * 工作流 DAG 视图 E2E 测试
 *
 * 测试方法：
 * - 验证源代码文件存在并包含关键功能
 * - 验证工作流消息创建流程正常
 * - 验证组件导入和集成
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';
import { readFileSync } from 'fs';
import { join } from 'path';

test.describe('工作流 DAG 视图 - 代码验证测试', () => {

  test('✅ 验证 WorkflowDAGMonitor 源代码文件存在', async ({ page }) => {
    // 🔥 验证源代码文件包含关键功能
    const projectRoot = process.cwd();
    const dagMonitorPath = join(projectRoot, 'src/components/workflow/WorkflowDAGMonitor.tsx');

    try {
      const dagMonitorCode = readFileSync(dagMonitorPath, 'utf-8');

      // ✅ 验证节点类型图标映射
      const hasNodeTypeIcons = dagMonitorCode.includes('NODE_TYPE_ICONS');
      const hasParseNodeType = dagMonitorCode.includes('parseNodeType');
      const hasGetNodeTypeIcon = dagMonitorCode.includes('getNodeTypeIcon');

      console.log('🔍 WorkflowDAGMonitor.tsx 检查:', {
        hasNodeTypeIcons,
        hasParseNodeType,
        hasGetNodeTypeIcon
      });

      expect(hasNodeTypeIcons, '应该有节点类型图标映射').toBeTruthy();
      expect(hasParseNodeType, '应该有节点类型解析函数').toBeTruthy();
      expect(hasGetNodeTypeIcon, '应该有获取节点类型图标函数').toBeTruthy();

      // ✅ 验证节点点击交互
      const hasHandleNodeClick = dagMonitorCode.includes('handleNodeClick');
      const hasSelectedNode = dagMonitorCode.includes('selectedNode');

      console.log('🔍 节点点击交互检查:', {
        hasHandleNodeClick,
        hasSelectedNode
      });

      expect(hasHandleNodeClick, '应该有节点点击处理函数').toBeTruthy();
      expect(hasSelectedNode, '应该有选中节点状态').toBeTruthy();

      console.log('✅ WorkflowDAGMonitor.tsx 包含所有必需功能');
    } catch (e) {
      console.error('❌ 无法读取 WorkflowDAGMonitor.tsx:', e);
      throw new Error('WorkflowDAGMonitor.tsx 文件不存在');
    }
  });

  test('✅ 验证 WorkflowInlineMonitor 包含 DAG 视图集成', async ({ page }) => {
    const projectRoot = process.cwd();
    const inlineMonitorPath = join(projectRoot, 'src/components/workflow/WorkflowInlineMonitor.tsx');

    try {
      const inlineMonitorCode = readFileSync(inlineMonitorPath, 'utf-8');

      // ✅ 验证 DAG 视图切换功能
      const hasViewModeState = inlineMonitorCode.includes('viewMode');
      const hasDAGViewButton = inlineMonitorCode.includes('DAG视图');
      const hasListViewButton = inlineMonitorCode.includes('列表视图');
      const hasWorkflowDAGImport = inlineMonitorCode.includes('WorkflowDAGMonitor');

      console.log('🔍 WorkflowInlineMonitor.tsx 检查:', {
        hasViewModeState,
        hasDAGViewButton,
        hasListViewButton,
        hasWorkflowDAGImport
      });

      expect(hasViewModeState, '应该有视图模式状态').toBeTruthy();
      expect(hasDAGViewButton, '应该有 DAG 视图按钮').toBeTruthy();
      expect(hasListViewButton, '应该有列表视图按钮').toBeTruthy();
      expect(hasWorkflowDAGImport, '应该导入 WorkflowDAGMonitor').toBeTruthy();

      console.log('✅ WorkflowInlineMonitor.tsx 包含 DAG 视图集成功能');
    } catch (e) {
      console.error('❌ 无法读取 WorkflowInlineMonitor.tsx:', e);
      throw new Error('WorkflowInlineMonitor.tsx 文件不存在');
    }
  });

  test('✅ 验证工作流消息创建流程正常', async ({ page }) => {
    // 设置 E2E 环境
    await setupE2ETestEnvironment(page, {
      skipWelcome: true,
      useRealAI: false
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 设置 localStorage 和 provider
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
            apiKey: 'test-key-1234567890',
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

    // 发送工作流命令
    const chatInput = page.locator('[data-testid="chat-input"]').first();
    await chatInput.fill('/explore');
    await chatInput.press('Enter');
    await page.waitForTimeout(100);
    await chatInput.press('Enter');
    await page.waitForTimeout(5000);

    // ✅ 验证 store 中的消息
    const storeInfo = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      const state = chatStore ? chatStore.getState() : null;
      return {
        hasStore: !!chatStore,
        messageCount: state ? state.messages.length : 0,
        messages: state ? state.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content?.substring(0, 100)
        })) : [],
      };
    });

    console.log('📊 Store 状态:', storeInfo);

    // ✅ 断言: 用户消息被创建
    const userMessage = storeInfo.messages.find((msg: any) => msg.role === 'user' && msg.content.includes('/explore'));
    expect(userMessage, '用户消息应该存在于 store 中').toBeDefined();
    expect(userMessage?.content).toContain('/explore');

    console.log('✅ 工作流消息创建流程正常');
  });
});
