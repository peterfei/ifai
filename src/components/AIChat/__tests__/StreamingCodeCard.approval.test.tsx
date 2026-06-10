/**
 * StreamingCodeCard 审批按钮显隐 TDD 测试
 *
 * 覆盖场景：
 *   APP-1: 流式中（partial JSON, isPartial=true, isComplete=false）→ 不可见审批按钮
 *   APP-2: 流式完成（完整 JSON, isPartial=true, isComplete=true）→ 可见审批按钮
 *   APP-3: 已批准（isPartial=false）→ 不渲染组件
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------- Mocks ----------

let mockToolCalls: any[] = [];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      const map: Record<string, string> = {
        'aiChat.fileWrite.waiting': '等待中...',
        'aiChat.fileWrite.streaming': '流式接收中',
        'aiChat.fileWrite.previewDone': '预览完成',
        'aiChat.fileWrite.reject': '拒绝',
        'aiChat.fileWrite.approve': '批准',
        'aiChat.fileWrite.batchProgress': '进度',
      };
      if (key === 'aiChat.fileWrite.streaming' && params?.count) {
        return `流式接收中 ${params.count} 字符`;
      }
      return map[key] || key;
    },
  }),
}));

vi.mock('../../../core/approval/ToolApprovalRegistry', () => ({
  toolApprovalRegistry: {
    getStreamExtract: (toolName: string) => {
      if (toolName === 'agent_write_file') {
        return { path: 'rel_path', content: 'content' };
      }
      return null;
    },
    isStreamExtractTool: (name: string) => name === 'agent_write_file',
  },
}));

// ---------- Helper ----------

async function renderCard(toolCalls: any[]) {
  const { StreamingCodeCard } = await import('../StreamingCodeCard');
  return render(
    <StreamingCodeCard
      message={{
        id: 'msg-1',
        toolCalls,
      }}
      onAction={vi.fn()}
    />
  );
}

// ---------- Tests ----------

describe('StreamingCodeCard 审批按钮显隐', () => {

  beforeEach(() => {
    mockToolCalls = [];
  });

  // APP-1: 🔴 RED — 流式进行中，isComplete=false，但 content 有部分数据
  // 期望：审批按钮不可见（用户还在等待流式完成）
  it('APP-1: 流式进行中（partial JSON）→ 审批按钮不可见', async () => {
    // 模拟 delta 先行阶段：JSON 不完整，content 只有部分数据
    const toolCalls = [
      {
        id: 'write_1',
        tool: 'agent_write_file',
        status: 'pending',
        isPartial: true,
        function: {
          name: 'agent_write_file',
          arguments: '{"rel_path":"test.js","content":"console.log', // ← 未闭合 JSON
        },
      },
    ];

    const { container } = await renderCard(toolCalls);

    // 验证组件已渲染（应有 card 容器）
    expect(container.querySelector('[class*="card"]')).toBeTruthy();

    // 🔴 RED: 流式中不应出现审批按钮
    // 预期：approvalBar 元素不存在
    expect(container.querySelector('[class*="approvalBar"]')).toBeNull();
  });

  // APP-2: ✅ GREEN — 流式完成，isComplete=true
  describe('APP-2: 流式完成后 → 审批按钮可见', () => {
    it('完整 JSON，isPartial=true', async () => {
      const toolCalls = [
        {
          id: 'write_2',
          tool: 'agent_write_file',
          status: 'pending',
          isPartial: true,
          function: {
            name: 'agent_write_file',
            arguments: '{"rel_path":"test.js","content":"console.log(\'hello\');"}',
          },
        },
      ];

      const { container } = await renderCard(toolCalls);

      // JSON 完整，isComplete=true → 应出现审批按钮
      expect(container.querySelector('[class*="approvalBar"]')).toBeTruthy();
    });
  });

  // APP-3: ✅ GREEN — 已批准/完成，isPartial=false → 不渲染
  it('APP-3: 已批准（isPartial=false）→ 不渲染', async () => {
    const toolCalls = [
      {
        id: 'write_3',
        tool: 'agent_write_file',
        status: 'executing',
        isPartial: false,
        function: {
          name: 'agent_write_file',
          arguments: '{"rel_path":"test.js","content":"console.log(\'done\');"}',
        },
      },
    ];

    const { container } = await renderCard(toolCalls);

    // isPartial=false → StreamingCodeCard 内部 filter 排除 → 返回 null
    // container.innerHTML 应为空
    expect(container.innerHTML).toBe('');
  });
});
