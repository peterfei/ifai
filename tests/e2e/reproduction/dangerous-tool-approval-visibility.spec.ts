/**
 * E2E 测试：危险操作审批按钮全覆盖
 *
 * 覆盖所有 ToolCategory 分类下的工具，验证：
 *   1. isLoading=true 时不阻塞审批按钮显示
 *   2. 审批/拒绝按钮在 pending 状态下始终可见且可交互
 *   3. 不同风险等级的审批卡片视觉正确
 *
 * 工具分类（来自 approvalPolicy.ts）：
 *   - safe:       read_file, list_dir, scan_project, grep_search, glob, list_files, ls, TodoWrite
 *   - destructive: bash, execute_command, run_shell_command, delete_file, remove_file
 *   - dangerous:  write_file, edit_file, 以及所有未分类工具（默认）
 *
 * 风险等级（来自 RiskPolicy.ts）：
 *   - high:   agent_delete_file, agent_run_command, delete_file
 *   - medium: agent_write_file, write_file, agent_replace_text, TodoWrite
 *   - low:    所有只读工具
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup-utils';

// ──────────────────────────────────────────────────────────────
// 测试数据：所有需要审批的危险操作
// ──────────────────────────────────────────────────────────────

interface ToolTestCase {
  toolName: string;
  category: 'safe' | 'destructive' | 'dangerous';
  riskLevel: 'high' | 'medium' | 'low';
  args: Record<string, any>;
  userMessage: string;
  /** 是否预期出现审批按钮（safe 工具在 vibe 模式下自动审批，不弹按钮） */
  expectApprovalButton: boolean;
}

const DESTRUCTIVE_TOOLS: ToolTestCase[] = [
  {
    toolName: 'bash',
    category: 'destructive',
    riskLevel: 'high',
    args: { command: 'rm -rf node_modules', working_dir: '/tmp' },
    userMessage: '帮我删除 node_modules 目录',
    expectApprovalButton: true,
  },
  {
    toolName: 'agent_bash',
    category: 'destructive',
    riskLevel: 'high',
    args: { command: 'sudo apt install nginx', working_dir: '/home/user' },
    userMessage: '安装 nginx',
    expectApprovalButton: true,
  },
  {
    toolName: 'agent_execute_command',
    category: 'destructive',
    riskLevel: 'high',
    args: { command: 'npm run dev', working_dir: '~/project/demo/2048/' },
    userMessage: '启动 Vite 开发服务器',
    expectApprovalButton: true,
  },
  {
    toolName: 'execute_command',
    category: 'destructive',
    riskLevel: 'high',
    args: { command: 'chmod 777 /etc/passwd' },
    userMessage: '修改文件权限',
    expectApprovalButton: true,
  },
  {
    toolName: 'run_shell_command',
    category: 'destructive',
    riskLevel: 'high',
    args: { command: 'chown -R user:user /var/www' },
    userMessage: '修改目录所有者',
    expectApprovalButton: true,
  },
  {
    toolName: 'agent_delete_file',
    category: 'destructive',
    riskLevel: 'high',
    args: { rel_path: 'src/old-component.tsx' },
    userMessage: '删除这个旧组件文件',
    expectApprovalButton: true,
  },
  {
    toolName: 'delete_file',
    category: 'destructive',
    riskLevel: 'high',
    args: { path: '/home/user/project/temp.log' },
    userMessage: '删除临时日志文件',
    expectApprovalButton: true,
  },
  {
    toolName: 'remove_file',
    category: 'destructive',
    riskLevel: 'high',
    args: { path: '/home/user/project/.DS_Store' },
    userMessage: '清理 .DS_Store 文件',
    expectApprovalButton: true,
  },
];

const DANGEROUS_TOOLS: ToolTestCase[] = [
  {
    toolName: 'agent_write_file',
    category: 'dangerous',
    riskLevel: 'medium',
    args: { rel_path: 'src/utils/helper.ts', content: 'export const help = () => {};' },
    userMessage: '创建一个工具函数文件',
    expectApprovalButton: true,
  },
  {
    toolName: 'write_file',
    category: 'dangerous',
    riskLevel: 'medium',
    args: { path: '/tmp/test.ts', content: 'console.log("hello");' },
    userMessage: '写一个测试文件',
    expectApprovalButton: true,
  },
  {
    toolName: 'agent_edit_file',
    category: 'dangerous',
    riskLevel: 'medium',
    args: { rel_path: 'src/App.tsx', old_string: 'hello', new_string: 'world' },
    userMessage: '修改 App.tsx 中的一个字符串',
    expectApprovalButton: true,
  },
  {
    toolName: 'agent_replace_text',
    category: 'dangerous',
    riskLevel: 'medium',
    args: { rel_path: 'src/index.ts', pattern: 'oldName', replacement: 'newName' },
    userMessage: '全局替换变量名',
    expectApprovalButton: true,
  },
  {
    toolName: 'TodoWrite',
    category: 'dangerous',
    riskLevel: 'medium',
    args: { todos: [{ content: '修复登录 bug', status: 'pending' }] },
    userMessage: '创建一个待办事项列表',
    expectApprovalButton: true,
  },
];

// safe 工具在 vibe 模式 + agentAutoApprove=false 时，也会需要审批（因为 approvalMode=session-once）
const SAFE_TOOLS_NEEDING_APPROVAL: ToolTestCase[] = [
  {
    toolName: 'agent_read_file',
    category: 'safe',
    riskLevel: 'low',
    args: { rel_path: 'src/App.tsx' },
    userMessage: '读取 App.tsx 的内容',
    expectApprovalButton: false, // safe 工具在 vibe 模式自动审批
  },
  {
    toolName: 'agent_scan_project',
    category: 'safe',
    riskLevel: 'low',
    args: { path: '/home/user/project' },
    userMessage: '扫描项目结构',
    expectApprovalButton: false,
  },
  {
    toolName: 'grep_search',
    category: 'safe',
    riskLevel: 'low',
    args: { pattern: 'TODO', include: '*.ts' },
    userMessage: '搜索所有 TODO 注释',
    expectApprovalButton: false,
  },
];

// ──────────────────────────────────────────────────────────────
// 辅助函数
// ──────────────────────────────────────────────────────────────

/**
 * 在 chatStore 中直接注入一条带 pending 工具调用的 assistant 消息
 * 同时设置 isLoading=true 模拟流式进行中状态
 */
async function injectPendingToolCall(
  page: any,
  tool: ToolTestCase,
  isLoading = true
) {
  const testId = `${tool.toolName}-${Date.now()}`;
  const correlationId = `corr-${testId}`;
  const userMessageId = `user-${testId}`;

  await page.evaluate(({ toolName, args, userMessage, correlationId, userMessageId, testId, isLoading }) => {
    const chatStore = (window as any).__chatStore;
    const now = Date.now();
    const argsJson = JSON.stringify(args);

    const toolCallId = `tool-${testId}`;

    // 先清除 persist 数据，避免 rehydrate 覆盖
    localStorage.removeItem('ifai-chat-store');
    sessionStorage.clear();

    chatStore.setState({
      messages: [
        {
          id: userMessageId,
          role: 'user',
          content: userMessage,
          timestamp: now,
        },
        {
          id: correlationId,
          role: 'assistant',
          content: `我来帮你执行 ${toolName}。`,
          status: isLoading ? 'streaming' : 'completed',
          isStreaming: isLoading,
          timestamp: now + 1,
          toolCalls: [{
            id: toolCallId,
            type: 'function',
            tool: toolName,
            args: args,
            function: { name: toolName, arguments: argsJson },
            status: 'pending',
          }],
          // 关键：contentSegments 驱动 MessageItem 的 segment 渲染
          // 没有这个字段，ToolApproval 组件不会被渲染到 DOM
          contentSegments: [
            { type: 'text', content: `我来帮你执行 ${toolName}。`, order: 1 },
            { type: 'tool', toolCallId, order: 2 },
            { type: 'text', content: '', order: 3 },
          ],
        }
      ],
      isLoading,
    });

    console.log(`[E2E] Injected: tool=${toolName}, isLoading=${isLoading}, status=pending`);
  }, { toolName: tool.toolName, args: tool.args, userMessage: tool.userMessage, correlationId, userMessageId, testId, isLoading });

  // 等待 React 渲染和 persist rehydrate 完成
  await page.waitForTimeout(500);

  return { testId, correlationId, userMessageId };
}

/**
 * 检查审批卡片和按钮的 DOM 可见性
 */
async function checkApprovalVisibility(page: any) {
  return await page.evaluate(() => {
    // ToolApproval 单独渲染（destructive/dangerous 工具）
    const card = document.querySelector('[data-test-id="tool-approval-card"]');
    // ToolBatchApproval 聚合渲染（vibe 模式下 safe 工具如 read/list/search 被强制聚合）
    const batchCard = document.querySelector('[data-testid="tool-batch-card"]');
    const approveBtn = document.querySelector('[data-testid="approve-button"]');
    const rejectBtn = document.querySelector('[data-testid="reject-button"]');
    const statusBadge = document.querySelector('[data-testid="status-badge"]');
    const toolName = document.querySelector('[data-testid="tool-name"]');

    const isVisible = (el: Element | null) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 &&
             style.display !== 'none' &&
             style.visibility !== 'hidden' &&
             parseFloat(style.opacity) !== 0;
    };

    return {
      card: { exists: !!card, visible: isVisible(card) },
      batchCard: { exists: !!batchCard, visible: isVisible(batchCard) },
      anyCard: { exists: !!(card || batchCard), visible: isVisible(card) || isVisible(batchCard) },
      approveButton: { exists: !!approveBtn, visible: isVisible(approveBtn) },
      rejectButton: { exists: !!rejectBtn, visible: isVisible(rejectBtn) },
      statusBadge: { exists: !!statusBadge, text: statusBadge?.textContent?.trim() || '' },
      toolName: { exists: !!toolName, text: toolName?.textContent?.trim() || '' },
    };
  });
}

// ──────────────────────────────────────────────────────────────
// 测试套件
// ──────────────────────────────────────────────────────────────

test.describe('Dangerous Tool Approval Visibility', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (
        text.includes('[Approval]') ||
        text.includes('[ToolApproval]') ||
        text.includes('[StoreMapper]') ||
        text.includes('[E2E]')
      ) {
        console.log('[Browser]', text);
      }
    });

    await setupE2ETestEnvironment(page, { skipWelcome: true });

    await page.waitForFunction(() =>
      (window as any).__chatStore !== undefined &&
      (window as any).__chatEventBus !== undefined &&
      (window as any).__APP_READY__ === true,
      { timeout: 30000 }
    );

    // 关闭全局自动审批，确保所有危险操作都需要手动审批
    await page.evaluate(() => {
      const settingsStore = (window as any).__settingsStore;
      if (settingsStore) {
        settingsStore.getState().updateSettings({
          agentAutoApprove: false,
          agentApprovalMode: 'session-once'
        });
      }
    });

    await page.waitForTimeout(500);
  });

  // ──────────────────────────────────────────────
  // Destructive 工具（最高风险）
  // ──────────────────────────────────────────────
  test.describe('Destructive Tools (High Risk)', () => {
    for (const tool of DESTRUCTIVE_TOOLS) {
      test(`${tool.toolName}: 审批按钮在 isLoading=true 时可见`, async ({ page }) => {
        await injectPendingToolCall(page, tool, true);

        // 等待 React 渲染
        await page.waitForTimeout(200);

        const visibility = await checkApprovalVisibility(page);
        console.log(`[${tool.toolName}]`, JSON.stringify(visibility));

        // 审批卡片必须存在且可见
        expect(visibility.card.exists).toBe(true);
        expect(visibility.card.visible).toBe(true);

        // 工具名称必须正确
        expect(visibility.toolName.exists).toBe(true);

        // 审批和拒绝按钮必须可见
        expect(visibility.approveButton.exists).toBe(true);
        expect(visibility.approveButton.visible).toBe(true);
        expect(visibility.rejectButton.exists).toBe(true);
        expect(visibility.rejectButton.visible).toBe(true);

        // 状态徽章必须显示"待审批"
        expect(visibility.statusBadge.text).toContain('待审批');
      });

      test(`${tool.toolName}: 刷新后(isLoading=false)审批按钮仍然可见`, async ({ page }) => {
        await injectPendingToolCall(page, tool, false);

        await page.waitForTimeout(200);

        const visibility = await checkApprovalVisibility(page);
        console.log(`[${tool.toolName} refresh]`, JSON.stringify(visibility));

        expect(visibility.card.exists).toBe(true);
        expect(visibility.card.visible).toBe(true);
        expect(visibility.approveButton.exists).toBe(true);
        expect(visibility.approveButton.visible).toBe(true);
        expect(visibility.rejectButton.exists).toBe(true);
        expect(visibility.rejectButton.visible).toBe(true);
      });
    }
  });

  // ──────────────────────────────────────────────
  // Dangerous 工具（中等风险 - 写入操作）
  // ──────────────────────────────────────────────
  test.describe('Dangerous Tools (Medium Risk - Write Ops)', () => {
    for (const tool of DANGEROUS_TOOLS) {
      test(`${tool.toolName}: 审批按钮在 isLoading=true 时可见`, async ({ page }) => {
        await injectPendingToolCall(page, tool, true);

        await page.waitForTimeout(200);

        const visibility = await checkApprovalVisibility(page);
        console.log(`[${tool.toolName}]`, JSON.stringify(visibility));

        expect(visibility.card.exists).toBe(true);
        expect(visibility.card.visible).toBe(true);
        expect(visibility.approveButton.exists).toBe(true);
        expect(visibility.approveButton.visible).toBe(true);
        expect(visibility.rejectButton.exists).toBe(true);
        expect(visibility.rejectButton.visible).toBe(true);
        expect(visibility.statusBadge.text).toContain('待审批');
      });
    }
  });

  // ──────────────────────────────────────────────
  // Safe 工具（低风险 - 只读操作）
  // ──────────────────────────────────────────────
  test.describe.skip('Safe Tools (Low Risk - Read Ops)', () => {
    for (const tool of SAFE_TOOLS_NEEDING_APPROVAL) {
      test(`${tool.toolName}: safe 工具审批卡片仍然渲染`, async ({ page }) => {
        await injectPendingToolCall(page, tool, true);

        await page.waitForTimeout(200);

        const visibility = await checkApprovalVisibility(page);
        console.log(`[${tool.toolName}]`, JSON.stringify(visibility));

        // safe 工具也应该有审批卡片（因为 agentAutoApprove=false 且 approvalMode=session-once）
        // 但按钮可见性取决于 shouldAutoApprove 的返回值
        // 注意：vibe 模式下 read/list/search 工具被聚合为 ToolBatchApproval
        expect(visibility.anyCard.exists).toBe(true);
      });
    }
  });

  // ──────────────────────────────────────────────
  // 批量场景：多条危险操作同时 pending
  // ──────────────────────────────────────────────
  test.describe.skip('Multiple Pending Tools', () => {
    test('同一消息中多个危险工具同时 pending 时，每个都显示审批按钮', async ({ page }) => {
      const testId = `multi-${Date.now()}`;
      const correlationId = `corr-${testId}`;
      const userMessageId = `user-${testId}`;

      await page.evaluate(({ correlationId, userMessageId, testId }) => {
        const chatStore = (window as any).__chatStore;
        const now = Date.now();

        // 清除 persist 数据，避免 rehydrate 覆盖
        localStorage.removeItem('ifai-chat-store');

        chatStore.setState({
          messages: [
            {
              id: userMessageId,
              role: 'user',
              content: '重构项目结构',
              timestamp: now,
            },
            {
              id: correlationId,
              role: 'assistant',
              content: '好的，我需要执行以下操作。',
              status: 'streaming',
              isStreaming: true,
              timestamp: now + 1,
              toolCalls: [
                {
                  id: `tool-delete-${testId}`,
                  type: 'function',
                  tool: 'agent_delete_file',
                  args: { rel_path: 'src/legacy/utils.ts' },
                  function: { name: 'agent_delete_file', arguments: '{"rel_path":"src/legacy/utils.ts"}' },
                  status: 'pending',
                },
                {
                  id: `tool-write-${testId}`,
                  type: 'function',
                  tool: 'agent_write_file',
                  args: { rel_path: 'src/utils/new-helper.ts', content: 'export const helper = () => {};' },
                  function: { name: 'agent_write_file', arguments: '{"rel_path":"src/utils/new-helper.ts"}' },
                  status: 'pending',
                },
                {
                  id: `tool-bash-${testId}`,
                  type: 'function',
                  tool: 'bash',
                  args: { command: 'npm install lodash', working_dir: '/home/user/project' },
                  function: { name: 'bash', arguments: '{"command":"npm install lodash"}' },
                  status: 'pending',
                },
                {
                  id: `tool-edit-${testId}`,
                  type: 'function',
                  tool: 'agent_edit_file',
                  args: { rel_path: 'src/App.tsx', old_string: 'old', new_string: 'new' },
                  function: { name: 'agent_edit_file', arguments: '{"rel_path":"src/App.tsx"}' },
                  status: 'pending',
                },
              ],
              contentSegments: [
                { type: 'text', content: '好的，我需要执行以下操作。', order: 1 },
                { type: 'tool', toolCallId: `tool-delete-${testId}`, order: 2 },
                { type: 'tool', toolCallId: `tool-write-${testId}`, order: 3 },
                { type: 'tool', toolCallId: `tool-bash-${testId}`, order: 4 },
                { type: 'tool', toolCallId: `tool-edit-${testId}`, order: 5 },
              ],
            }
          ],
          isLoading: true,
        });
      }, { correlationId, userMessageId, testId });

      await page.waitForTimeout(300);

      // 验证 4 个审批卡片都存在
      const cards = await page.evaluate(() => {
        const approvalCards = document.querySelectorAll('[data-test-id="tool-approval-card"]');
        const approveButtons = document.querySelectorAll('[data-testid="approve-button"]');
        const rejectButtons = document.querySelectorAll('[data-testid="reject-button"]');

        return {
          cardCount: approvalCards.length,
          approveButtonCount: approveButtons.length,
          rejectButtonCount: rejectButtons.length,
          cardsVisible: Array.from(approvalCards).map(card => {
            const rect = card.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }),
        };
      });

      console.log('[Multi-tool] Cards:', JSON.stringify(cards, null, 2));

      // 4 个工具调用都应该有审批卡片
      expect(cards.cardCount).toBe(4);
      expect(cards.approveButtonCount).toBe(4);
      expect(cards.rejectButtonCount).toBe(4);

      // 所有卡片都应该可见
      expect(cards.cardsVisible.every(v => v)).toBe(true);
    });

    test('混合 pending + completed 工具时，仅 pending 显示审批按钮', async ({ page }) => {
      const testId = `mixed-${Date.now()}`;
      const correlationId = `corr-${testId}`;
      const userMessageId = `user-${testId}`;

      await page.evaluate(({ correlationId, userMessageId, testId }) => {
        const chatStore = (window as any).__chatStore;
        const now = Date.now();

        // 清除 persist 数据，避免 rehydrate 覆盖
        localStorage.removeItem('ifai-chat-store');

        chatStore.setState({
          messages: [
            {
              id: userMessageId,
              role: 'user',
              content: '读取并修改配置',
              timestamp: now,
            },
            {
              id: correlationId,
              role: 'assistant',
              content: '好的，我来处理。',
              status: 'streaming',
              isStreaming: true,
              timestamp: now + 1,
              toolCalls: [
                {
                  id: `tool-read-${testId}`,
                  type: 'function',
                  tool: 'agent_read_file',
                  args: { rel_path: 'package.json' },
                  function: { name: 'agent_read_file', arguments: '{"rel_path":"package.json"}' },
                  status: 'completed',
                  result: '{"content": "{\\"name\\": \\"demo\\"}"}',
                },
                {
                  id: `tool-write-${testId}`,
                  type: 'function',
                  tool: 'agent_write_file',
                  args: { rel_path: 'src/config.ts', content: 'export default {}' },
                  function: { name: 'agent_write_file', arguments: '{"rel_path":"src/config.ts"}' },
                  status: 'pending',
                },
                {
                  id: `tool-bash-${testId}`,
                  type: 'function',
                  tool: 'bash',
                  args: { command: 'npm run build' },
                  function: { name: 'bash', arguments: '{"command":"npm run build"}' },
                  status: 'pending',
                },
              ],
              contentSegments: [
                { type: 'text', content: '好的，我来处理。', order: 1 },
                { type: 'tool', toolCallId: `tool-read-${testId}`, order: 2 },
                { type: 'tool', toolCallId: `tool-write-${testId}`, order: 3 },
                { type: 'tool', toolCallId: `tool-bash-${testId}`, order: 4 },
              ],
            }
          ],
          isLoading: true,
        });
      }, { correlationId, userMessageId, testId });

      await page.waitForTimeout(300);

      const cards = await page.evaluate(() => {
        const approvalCards = document.querySelectorAll('[data-test-id="tool-approval-card"]');
        const batchCards = document.querySelectorAll('[data-testid="tool-batch-card"]');
        const approveButtons = document.querySelectorAll('[data-testid="approve-button"]');
        const statusBadges = document.querySelectorAll('[data-testid="status-badge"]');

        return {
          cardCount: approvalCards.length,
          batchCardCount: batchCards.length,
          totalCardCount: approvalCards.length + batchCards.length,
          approveButtonCount: approveButtons.length,
          statusTexts: Array.from(statusBadges).map(b => b.textContent?.trim()),
        };
      });

      console.log('[Mixed] Cards:', JSON.stringify(cards, null, 2));

      // 3 个工具卡片总计（1 ToolBatchApproval for completed agent_read_file + 2 ToolApproval for pending tools）
      expect(cards.totalCardCount).toBe(3);

      // 只有 2 个 pending 工具有审批按钮
      expect(cards.approveButtonCount).toBe(2);
    });
  });

  // ──────────────────────────────────────────────
  // 特殊场景
  // ──────────────────────────────────────────────
  test.describe('Edge Cases', () => {
    test('npm run dev (Vite 项目) 审批按钮可见 - 原始 bug 还原', async ({ page }) => {
      await injectPendingToolCall(page, {
        toolName: 'bash',
        category: 'destructive',
        riskLevel: 'high',
        args: { command: 'npm run dev', working_dir: '~/project/demo/2048/' },
        userMessage: '启动 Vite 开发服务器',
        expectApprovalButton: true,
      }, true);

      await page.waitForTimeout(200);

      const state = await page.evaluate(() => {
        const chatStore = (window as any).__chatStore.getState();
        const msg = chatStore.messages.find((m: any) => m.role === 'assistant');
        return {
          isLoading: chatStore.isLoading,
          toolCallStatus: msg?.toolCalls?.[0]?.status,
        };
      });

      console.log('[npm run dev]', JSON.stringify(state));

      // isLoading 为 true（模拟流式中）
      expect(state.isLoading).toBe(true);
      // 工具状态为 pending
      expect(state.toolCallStatus).toBe('pending');

      // 审批按钮必须可见
      const visibility = await checkApprovalVisibility(page);
      expect(visibility.approveButton.visible).toBe(true);
      expect(visibility.rejectButton.visible).toBe(true);
    });

    test('未知工具名（未分类）默认为 dangerous，需要审批', async ({ page }) => {
      await injectPendingToolCall(page, {
        toolName: 'custom_plugin_execute',
        category: 'dangerous',
        riskLevel: 'medium',
        args: { action: 'deploy', target: 'production' },
        userMessage: '执行部署操作',
        expectApprovalButton: true,
      }, true);

      await page.waitForTimeout(200);

      const visibility = await checkApprovalVisibility(page);
      console.log('[Unknown tool]', JSON.stringify(visibility));

      expect(visibility.card.exists).toBe(true);
      expect(visibility.approveButton.exists).toBe(true);
    });

    test('isPartial=true 时审批按钮不显示（参数传输中）', async ({ page }) => {
      const testId = `partial-${Date.now()}`;
      const correlationId = `corr-${testId}`;
      const userMessageId = `user-${testId}`;

      await page.evaluate(({ correlationId, userMessageId, testId }) => {
        const chatStore = (window as any).__chatStore;
        const now = Date.now();

        // 清除 persist 数据，避免 rehydrate 覆盖
        localStorage.removeItem('ifai-chat-store');

        chatStore.setState({
          messages: [
            {
              id: userMessageId,
              role: 'user',
              content: '删除文件',
              timestamp: now,
            },
            {
              id: correlationId,
              role: 'assistant',
              content: '好的，我来删除...',
              status: 'streaming',
              isStreaming: true,
              timestamp: now + 1,
              toolCalls: [{
                id: `tool-${testId}`,
                type: 'function',
                tool: 'agent_delete_file',
                args: { rel_path: 'src/old.ts' },  // 参数不完整
                function: { name: 'agent_delete_file', arguments: '{"rel_path":' },
                status: 'pending',
                isPartial: true,  // 参数仍在流式传输中
              }],
              contentSegments: [
                { type: 'text', content: '好的，我来删除...', order: 1 },
                { type: 'tool', toolCallId: `tool-${testId}`, order: 2 },
              ],
          }
          ],
          isLoading: true,
        });
      }, { correlationId, userMessageId, testId });

      await page.waitForTimeout(200);

      const visibility = await checkApprovalVisibility(page);
      console.log('[isPartial]', JSON.stringify(visibility));

      // 卡片存在但审批按钮不应显示
      expect(visibility.card.exists).toBe(true);
      expect(visibility.approveButton.exists).toBe(false);
      expect(visibility.rejectButton.exists).toBe(false);

      // 状态应显示"生成中..."
      expect(visibility.statusBadge.text).toContain('生成中');
    });

    test('工具状态流转：pending → approved → completed 各阶段 UI 正确', async ({ page }) => {
      const testId = `flow-${Date.now()}`;
      const correlationId = `corr-${testId}`;
      const userMessageId = `user-${testId}`;

      // 阶段 1: pending
      await page.evaluate(({ correlationId, userMessageId, testId }) => {
        const chatStore = (window as any).__chatStore;
        const now = Date.now();

        // 清除 persist 数据，避免 rehydrate 覆盖
        localStorage.removeItem('ifai-chat-store');

        chatStore.setState({
          messages: [
            { id: userMessageId, role: 'user', content: '安装依赖', timestamp: now },
            {
              id: correlationId, role: 'assistant', content: '好的。',
              status: 'streaming', isStreaming: true, timestamp: now + 1,
              toolCalls: [{
                id: `tool-${testId}`, type: 'function', tool: 'bash',
                args: { command: 'npm install axios', working_dir: '/tmp' },
                function: { name: 'bash', arguments: '{"command":"npm install axios"}' },
                status: 'pending',
              }],
              contentSegments: [
                { type: 'text', content: '好的。', order: 1 },
                { type: 'tool', toolCallId: `tool-${testId}`, order: 2 },
              ],
            }
          ],
          isLoading: true,
        });
      }, { correlationId, userMessageId, testId });

      await page.waitForTimeout(150);

      // 验证 pending 状态
      let visibility = await checkApprovalVisibility(page);
      expect(visibility.approveButton.visible).toBe(true);
      expect(visibility.statusBadge.text).toContain('待审批');

      // 阶段 2: approved（模拟用户点击批准）
      await page.evaluate(({ correlationId, testId }) => {
        const chatStore = (window as any).__chatStore;
        chatStore.setState((state: any) => ({
          messages: state.messages.map((m: any) =>
            m.id === correlationId
              ? {
                  ...m,
                  toolCalls: m.toolCalls.map((tc: any) =>
                    tc.id === `tool-${testId}` ? { ...tc, status: 'approved' } : tc
                  ),
                }
              : m
          ),
        }));
      }, { correlationId, testId });

      await page.waitForTimeout(150);

      visibility = await checkApprovalVisibility(page);
      // approved 后不再有审批按钮
      expect(visibility.approveButton.exists).toBe(false);
      expect(visibility.statusBadge.text).toContain('已批准');

      // 阶段 3: completed
      await page.evaluate(({ correlationId, testId }) => {
        const chatStore = (window as any).__chatStore;
        chatStore.setState((state: any) => ({
          messages: state.messages.map((m: any) =>
            m.id === correlationId
              ? {
                  ...m,
                  status: 'completed', isStreaming: false,
                  toolCalls: m.toolCalls.map((tc: any) =>
                    tc.id === `tool-${testId}`
                      ? { ...tc, status: 'completed', result: '{"stdout":"added 1 package"}' }
                      : tc
                  ),
                }
              : m
          ),
          isLoading: false,
        }));
      }, { correlationId, testId });

      await page.waitForTimeout(150);

      visibility = await checkApprovalVisibility(page);
      expect(visibility.statusBadge.text).toContain('已完成');
    });
  });

  // ──────────────────────────────────────────────
  // 真实场景：高保真还原用户日常操作
  // ──────────────────────────────────────────────
  test.describe('Real-World Scenarios', () => {
    test('用户说"帮我更新 README.md" → agent_write_file 需要审批', async ({ page }) => {
      const testId = `readme-${Date.now()}`;
      const correlationId = `corr-${testId}`;
      const userMessageId = `user-${testId}`;

      // 模拟 ~100 行 README 内容
      const readmeContent = `# IfAI Editor

> AI 驱动的智能代码编辑器

## 特性

- 🧠 AI 对话式编程
- 📁 项目结构分析
- 🔧 代码重构建议
- 🔍 全局搜索与替换
- 🚀 快速原型开发

## 安装

\`\`\`bash
npm install
npm run dev
\`\`\`

## 使用指南

### 1. 创建项目
点击左侧 "Open Folder" 打开项目目录。

### 2. AI 对话
在右侧聊天面板输入你的需求，AI 会自动分析项目并提供帮助。

### 3. 代码编辑
AI 可以直接帮你修改代码文件，所有修改都需要你确认后才会执行。

### 4. 终端命令
支持在聊天中直接执行终端命令，如构建、测试等。

## 配置

### AI 提供商
支持配置多种 AI 提供商：
- 智谱 AI (GLM 系列)
- OpenAI (GPT 系列)
- 本地模型 (Ollama)

### 编辑器设置
- 主题切换 (暗色/亮色)
- 字体大小调整
- 快捷键自定义

## 技术栈

- **框架**: React 19 + TypeScript
- **桌面**: Tauri 2.0
- **编辑器**: Monaco Editor
- **状态管理**: Zustand
- **样式**: Tailwind CSS

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

MIT License
`;

      await page.evaluate(({ correlationId, userMessageId, testId, readmeContent }) => {
        const chatStore = (window as any).__chatStore;
        const now = Date.now();
        const argsJson = JSON.stringify({ rel_path: 'README.md', content: readmeContent });

        localStorage.removeItem('ifai-chat-store');

        chatStore.setState({
          messages: [
            {
              id: userMessageId,
              role: 'user',
              content: '帮我更新一下 README.md，加上新的特性介绍和使用指南',
              timestamp: now,
            },
            {
              id: correlationId,
              role: 'assistant',
              content: '好的，我来帮你更新 README.md，加入最新的功能介绍和使用说明。',
              status: 'streaming',
              isStreaming: true,
              timestamp: now + 1,
              toolCalls: [{
                id: `tool-${testId}`,
                type: 'function',
                tool: 'agent_write_file',
                args: { rel_path: 'README.md', content: readmeContent },
                function: { name: 'agent_write_file', arguments: argsJson },
                status: 'pending',
              }],
              contentSegments: [
                { type: 'text', content: '好的，我来帮你更新 README.md，加入最新的功能介绍和使用说明。', order: 1 },
                { type: 'tool', toolCallId: `tool-${testId}`, order: 2 },
              ],
            }
          ],
          isLoading: true,
        });
      }, { correlationId, userMessageId, testId, readmeContent });

      await page.waitForTimeout(300);

      const visibility = await checkApprovalVisibility(page);
      console.log('[README update]', JSON.stringify(visibility, null, 2));

      // 审批卡片必须存在
      expect(visibility.anyCard.exists).toBe(true);
      expect(visibility.anyCard.visible).toBe(true);

      // 必须有批准和拒绝按钮
      expect(visibility.approveButton.exists).toBe(true);
      expect(visibility.approveButton.visible).toBe(true);
      expect(visibility.rejectButton.exists).toBe(true);
      expect(visibility.rejectButton.visible).toBe(true);

      // 工具名称应该是 write_file 相关
      expect(visibility.toolName.exists).toBe(true);
      expect(visibility.toolName.text).toBeTruthy();

      // 状态应该显示"待审批"
      expect(visibility.statusBadge.exists).toBe(true);
      expect(visibility.statusBadge.text).toContain('待审批');
    });

    test('用户说"重构 auth 模块" → edit_file 需要审批', async ({ page }) => {
      const testId = `auth-refactor-${Date.now()}`;
      const correlationId = `corr-${testId}`;
      const userMessageId = `user-${testId}`;

      await page.evaluate(({ correlationId, userMessageId, testId }) => {
        const chatStore = (window as any).__chatStore;
        const now = Date.now();

        localStorage.removeItem('ifai-chat-store');

        chatStore.setState({
          messages: [
            {
              id: userMessageId,
              role: 'user',
              content: '帮我重构 src/core/auth.ts，把 JWT 逻辑抽成独立的 service',
              timestamp: now,
            },
            {
              id: correlationId,
              role: 'assistant',
              content: '好的，我来重构 auth 模块。',
              status: 'streaming',
              isStreaming: true,
              timestamp: now + 1,
              toolCalls: [{
                id: `tool-${testId}`,
                type: 'function',
                tool: 'agent_edit_file',
                args: { rel_path: 'src/core/auth.ts', old_text: 'const jwt = require("jsonwebtoken")', new_text: 'import { JwtService } from "../services/jwt.service"' },
                function: { name: 'agent_edit_file', arguments: '{"rel_path":"src/core/auth.ts","old_text":"const jwt = require(\\"jsonwebtoken\\")","new_text":"import { JwtService } from \\"../services/jwt.service\\""}' },
                status: 'pending',
              }],
              contentSegments: [
                { type: 'text', content: '好的，我来重构 auth 模块。', order: 1 },
                { type: 'tool', toolCallId: `tool-${testId}`, order: 2 },
              ],
            }
          ],
          isLoading: true,
        });
      }, { correlationId, userMessageId, testId });

      await page.waitForTimeout(300);

      const visibility = await checkApprovalVisibility(page);
      console.log('[Auth refactor]', JSON.stringify(visibility, null, 2));

      expect(visibility.anyCard.exists).toBe(true);
      expect(visibility.approveButton.exists).toBe(true);
      expect(visibility.rejectButton.exists).toBe(true);
    });

    test('用户说"删除旧的 utils 文件" → delete_file 需要审批（高风险）', async ({ page }) => {
      const testId = `delete-old-${Date.now()}`;
      const correlationId = `corr-${testId}`;
      const userMessageId = `user-${testId}`;

      await page.evaluate(({ correlationId, userMessageId, testId }) => {
        const chatStore = (window as any).__chatStore;
        const now = Date.now();

        localStorage.removeItem('ifai-chat-store');

        chatStore.setState({
          messages: [
            {
              id: userMessageId,
              role: 'user',
              content: '把 src/legacy/utils.ts 和 src/legacy/helpers.ts 删掉，已经不需要了',
              timestamp: now,
            },
            {
              id: correlationId,
              role: 'assistant',
              content: '好的，我来帮你清理旧文件。',
              status: 'streaming',
              isStreaming: true,
              timestamp: now + 1,
              toolCalls: [
                {
                  id: `tool-delete1-${testId}`,
                  type: 'function',
                  tool: 'agent_delete_file',
                  args: { rel_path: 'src/legacy/utils.ts' },
                  function: { name: 'agent_delete_file', arguments: '{"rel_path":"src/legacy/utils.ts"}' },
                  status: 'pending',
                },
                {
                  id: `tool-delete2-${testId}`,
                  type: 'function',
                  tool: 'agent_delete_file',
                  args: { rel_path: 'src/legacy/helpers.ts' },
                  function: { name: 'agent_delete_file', arguments: '{"rel_path":"src/legacy/helpers.ts"}' },
                  status: 'pending',
                },
              ],
              contentSegments: [
                { type: 'text', content: '好的，我来帮你清理旧文件。', order: 1 },
                { type: 'tool', toolCallId: `tool-delete1-${testId}`, order: 2 },
                { type: 'tool', toolCallId: `tool-delete2-${testId}`, order: 3 },
              ],
            }
          ],
          isLoading: true,
        });
      }, { correlationId, userMessageId, testId });

      await page.waitForTimeout(300);

      const visibility = await checkApprovalVisibility(page);
      console.log('[Delete legacy]', JSON.stringify(visibility, null, 2));

      // 删除文件必须显示审批
      expect(visibility.anyCard.exists).toBe(true);
      expect(visibility.approveButton.exists).toBe(true);
      expect(visibility.rejectButton.exists).toBe(true);

      // 高风险工具，状态徽章应包含"待审批"
      expect(visibility.statusBadge.text).toContain('待审批');
    });
  });
});
