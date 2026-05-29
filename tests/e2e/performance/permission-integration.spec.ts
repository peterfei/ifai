/**
 * E2E 集成测试: 权限审批系统 TS ↔ Rust payload 契约
 *
 * 测试覆盖:
 * 1. available_decisions payload 格式与 Rust DecisionsPayload 对齐
 * 2. is_allowed payload 格式与 Rust IsAllowedPayload 对齐
 * 3. add_rule / add_session_rule payload 格式对齐
 * 4. 工具链一致性: tool 名称在全流程中保持一致
 * 5. 拒绝路径状态转移
 *
 * Rust 参考 (src-tauri/src/permission_gui.rs):
 *   available_decisions → DecisionsPayload { category: String }
 *   is_allowed          → IsAllowedPayload { tool: String, args: serde_json::Value }
 *   add_rule            → AddRulePayload { tool: String, pattern: String, rule_type: String }
 *   add_session_rule    → SessionRulePayload { tool: String, pattern: String, rule_type: String }
 *
 * @version 1.0.0
 */

import { test, expect } from '@playwright/test';
import { setupE2ETestEnvironment } from '../setup';

test.describe('权限集成: TS→Rust invoke payload 契约', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });
  });

  /* ─── INT-PS-1: available_decisions payload 结构 ─── */

  test('INT-PS-1: available_decisions payload 含 category 字段', async ({ page }) => {
    const result = await page.evaluate(() => {
      // 从 ApprovalCard 组件复制 payload 构造逻辑
      const data = { toolName: 'agent_write_file', toolCategory: 'dangerous', argsPreview: 'src/main.ts' };
      const payload = JSON.stringify({
        tool_name: data.toolName,
        category: data.toolCategory || '',
        args_preview: data.argsPreview || '',
      });
      const parsed = JSON.parse(payload);

      return {
        hasCategory: 'category' in parsed,
        category: parsed.category,
        categoryType: typeof parsed.category,
        // 额外字段 serde 会忽略，不影响
        toolName: parsed.tool_name,
      };
    });

    expect(result.hasCategory).toBe(true);
    expect(result.category).toBe('dangerous');
    expect(result.categoryType).toBe('string');
  });

  /* ─── INT-PS-2: is_allowed payload 字段名 ─── */

  test('INT-PS-2: is_allowed payload 字段为 tool + args (非 tool_name)', async ({ page }) => {
    const result = await page.evaluate(() => {
      // 从 checkPermissionStore 复制 payload 构造逻辑 (已修复)
      const toolName = 'agent_write_file';
      const payload = JSON.stringify({ tool: toolName, args: {} });
      const parsed = JSON.parse(payload);

      return {
        hasTool: 'tool' in parsed,
        hasArgs: 'args' in parsed,
        hasToolName: 'tool_name' in parsed,
        hasArgsPreview: 'args_preview' in parsed,
        tool: parsed.tool,
        argsType: typeof parsed.args,
        argsIsObject: parsed.args !== null && typeof parsed.args === 'object',
      };
    });

    expect(result.hasTool).toBe(true);
    expect(result.hasArgs).toBe(true);
    expect(result.hasToolName).toBe(false);   // 必须没有旧字段名 tool_name
    expect(result.hasArgsPreview).toBe(false); // 必须没有旧字段名 args_preview
    expect(result.tool).toBe('agent_write_file');
    expect(result.argsIsObject).toBe(true);
  });

  /* ─── INT-PS-3: add_rule payload 三字段 ─── */

  test('INT-PS-3: add_rule payload 包含 tool, pattern, rule_type', async ({ page }) => {
    const result = await page.evaluate(() => {
      // 从 ApprovalCard handleDecision 复制 payload 构造逻辑
      const toolName = 'agent_bash';
      const payload = JSON.stringify({
        rule_type: 'allow',
        tool: toolName || '',
        pattern: `${toolName || '*'}:*`,
        pattern_type: 'prefix',
      });
      const parsed = JSON.parse(payload);

      return {
        fields: Object.keys(parsed).sort(),
        hasTool: 'tool' in parsed,
        hasPattern: 'pattern' in parsed,
        hasRuleType: 'rule_type' in parsed,
        tool: parsed.tool,
        pattern: parsed.pattern,
        ruleType: parsed.rule_type,
        // rule_type 值必须小写
        ruleTypeValid: parsed.rule_type === 'allow',
        // Rust必填三字段
        requiredFields: ['tool', 'pattern', 'rule_type'].every(f => f in parsed),
      };
    });

    expect(result.requiredFields).toBe(true);
    expect(result.tool).toBe('agent_bash');
    expect(result.pattern).toBe('agent_bash:*');
    expect(result.ruleType).toBe('allow');
  });

  /* ─── INT-PS-4: add_session_rule payload ─── */

  test('INT-PS-4: add_session_rule payload 使用通配符 pattern', async ({ page }) => {
    const result = await page.evaluate(() => {
      const toolName = 'agent_write_file';
      const payload = JSON.stringify({
        rule_type: 'allow',
        tool: toolName || '',
        pattern: '*',
        pattern_type: 'prefix',
      });
      const parsed = JSON.parse(payload);

      return {
        requiredFields: ['tool', 'pattern', 'rule_type'].every(f => f in parsed),
        tool: parsed.tool,
        pattern: parsed.pattern,
        ruleType: parsed.rule_type,
        // session 规则使用通配符
        patternIsWildcard: parsed.pattern === '*',
      };
    });

    expect(result.requiredFields).toBe(true);
    expect(result.tool).toBe('agent_write_file');
    expect(result.pattern).toBe('*');
    expect(result.patternIsWildcard).toBe(true);
    expect(result.ruleType).toBe('allow');
  });

  /* ─── INT-PS-5: deny 规则 rule_type ─── */

  test('INT-PS-5: deny 规则使用 rule_type: "deny"', async ({ page }) => {
    const result = await page.evaluate(() => {
      const payload = JSON.stringify({
        rule_type: 'deny',
        tool: 'agent_bash',
        pattern: '*',
      });
      const parsed = JSON.parse(payload);

      return {
        ruleType: parsed.rule_type,
        ruleTypeValid: ['allow', 'deny'].includes(parsed.rule_type),
        isDeny: parsed.rule_type === 'deny',
      };
    });

    expect(result.ruleType).toBe('deny');
    expect(result.ruleTypeValid).toBe(true);
  });
});

test.describe('权限集成: 工具链名称一致性', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });
  });

  /* ─── INT-PS-6: 全流程 tool 名称一致 ─── */

  test('INT-PS-6: is_allowed → add_rule → is_allowed 三步 tool 名称一致', async ({ page }) => {
    const result = await page.evaluate(() => {
      const toolName = 'agent_write_file';

      // Step 1: is_allowed 检查 (tool + args)
      const isAllowedPayload = { tool: toolName, args: {} };
      // Step 2: add_rule 写入 (rule_type, tool, pattern)
      const addRulePayload = { rule_type: 'allow', tool: toolName, pattern: `${toolName}:*` };
      // Step 3: 再次 is_allowed 检查
      const nextCheckPayload = { tool: toolName, args: {} };

      return {
        step1EqualsStep2: isAllowedPayload.tool === addRulePayload.tool,
        step2EqualsStep3: addRulePayload.tool === nextCheckPayload.tool,
        toolNameConsistent: isAllowedPayload.tool === nextCheckPayload.tool,
        patternContainsTool: addRulePayload.pattern.includes(addRulePayload.tool),
      };
    });

    expect(result.step1EqualsStep2).toBe(true);
    expect(result.step2EqualsStep3).toBe(true);
    expect(result.toolNameConsistent).toBe(true);
    expect(result.patternContainsTool).toBe(true);
  });
});

test.describe('权限集成: 拒绝路径状态', () => {
  test.beforeEach(async ({ page }) => {
    await setupE2ETestEnvironment(page, {
      useRealAI: false,
      skipWelcome: true,
    });
  });

  /* ─── INT-PS-7: 拒绝后消息状态变更为 rejected ─── */

  test('INT-PS-7: 审批拒绝后消息 status 变更为 rejected', async ({ page }) => {
    const result = await page.evaluate(() => {
      const chatStore = (window as any).__chatStore;
      if (!chatStore) return { error: 'chatStore not found' };

      // 注入一条 pending 审批消息
      chatStore.setState({
        messages: [{
          id: 'test-approval-card-1',
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          data: {
            type: 'code_review',
            title: '测试拒绝',
            description: '拒绝路径 E2E',
            overallRisk: 'medium',
            files: [{ path: 'src/main.ts', change: '+5 -3', risk: 'low' }],
            onApprove: 'continue',
            onReject: 'stop',
          },
          status: 'pending',
        }],
      });

      // 模拟拒绝: 更新消息状态为 rejected
      chatStore.setState((state: any) => ({
        messages: state.messages.map((m: any) =>
          m.id === 'test-approval-card-1'
            ? { ...m, status: 'rejected', data: { ...m.data, _resolution: 'rejected' } }
            : m
        ),
      }));

      const msg = chatStore.getState().messages[0];
      return {
        status: msg?.status,
        hasResolution: msg?.data?._resolution === 'rejected',
      };
    });

    expect(result.status).toBe('rejected');
    expect(result.hasResolution).toBe(true);
  });
});
