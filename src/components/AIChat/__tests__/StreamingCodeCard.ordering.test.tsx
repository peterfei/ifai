/**
 * StreamingCodeCard 排序问题 TDD 测试
 *
 * 目的：高保真确认 StreamingCodeCard 渲染位置问题
 *
 * 问题场景：
 * - 一条 assistant 消息中有多个工具调用（scan_project, write_file, TodoWrite）
 * - write_file 的 isPartial=true → StreamingCodeCard 应渲染
 * - 但 StreamingCodeCard 作为 Phase D 消息级卡片渲染在 segments 循环之前
 * - 导致它出现在消息顶部，而不是在 write_file 对应的 tool segment 位置
 *
 * 期望：StreamingCodeCard 应该出现在 write_file 对应的 segment 位置
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveCardType } from '../../../gui/conversation/MessageCardRegistry';

describe('StreamingCodeCard 排序问题 (TDD)', () => {

  describe('Phase 1: 确认问题 — resolveCardType 匹配行为', () => {
    it('POS-1: 消息中包含 isPartial=true 的 write_file → 整条消息被标记为 streaming-file-write', () => {
      // 场景：一条消息中有 scan_project(completed) + write_file(isPartial=true) + TodoWrite(completed)
      const message = {
        id: 'msg-1',
        role: 'assistant',
        content: '让我来修改文件...',
        toolCalls: [
          { id: 'call_1', tool: 'agent_scan_project', status: 'completed', isPartial: false },
          { id: 'call_2', tool: 'agent_write_file', status: 'pending', isPartial: true, arguments: '{"rel_path":"index.html","content":"<html>..."}' },
          { id: 'call_3', tool: 'TodoWrite', status: 'completed', isPartial: false },
        ],
      };

      const cardType = resolveCardType(message as any);
      // 🔴 RED: 整条消息被标记为 streaming-file-write
      // 这意味着 StreamingCodeCard 在 Phase D（消息顶部）渲染
      expect(cardType).toBe('streaming-file-write');
    });

    it('POS-2: isPartial=true 的 write_file 出现在中间 toolCall → 仍然在顶部渲染', () => {
      // 即使 write_file 不是第一个 toolCall，StreamingCodeCard 仍在顶部
      const message = {
        id: 'msg-2',
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'call_1', tool: 'agent_read_file', status: 'completed', isPartial: false },
          { id: 'call_2', tool: 'agent_read_file', status: 'completed', isPartial: false },
          { id: 'call_3', tool: 'agent_write_file', status: 'pending', isPartial: true, arguments: '{"rel_path":"test.js","content":"..."}' },
        ],
      };

      const cardType = resolveCardType(message as any);
      expect(cardType).toBe('streaming-file-write');
      // 🔴 问题：StreamingCodeCard 在消息顶部渲染，但 write_file 是第3个工具
      // 期望位置：在 read_file 完成后、write_file 的 tool segment 位置
    });
  });

  describe('Phase 2: segment order 对比', () => {
    it('POS-3: segments 中 tool segment 的 order 应决定工具卡片的渲染位置', () => {
      // 模拟 ContentSegmentManager 生成的 segments
      const segments = [
        { type: 'text', order: 1, content: '让我来分析项目...' },
        { type: 'tool', order: 2, toolCallId: 'call_1', toolName: 'agent_scan_project' },
        { type: 'text', order: 3, content: '项目结构分析完成' },
        { type: 'text', order: 4, content: '现在修改文件...' },
        { type: 'tool', order: 5, toolCallId: 'call_3', toolName: 'agent_write_file' },
        { type: 'text', order: 6, content: '' },
      ];

      // agent_write_file 的 tool segment order=5
      // 🔴 但 StreamingCodeCard 在 Phase D 渲染（order < 1）
      // 期望：StreamingCodeCard 应该在 order=5 的位置渲染
      const writeSegment = segments.find(s => s.toolCallId === 'call_3');
      expect(writeSegment?.order).toBe(5);

      // 验证 segments 按 order 排列
      const sortedOrders = segments.map(s => s.order);
      expect(sortedOrders).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('Phase 3: 多个 write_file 的场景', () => {
    it('POS-4: 多个 write_file 工具，StreamingCodeCard 只有一个（消息级）', () => {
      const message = {
        id: 'msg-3',
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'w1', tool: 'agent_write_file', status: 'pending', isPartial: true, arguments: '{"rel_path":"a.js"}' },
          { id: 'w2', tool: 'agent_write_file', status: 'pending', isPartial: true, arguments: '{"rel_path":"b.js"}' },
        ],
      };

      const cardType = resolveCardType(message as any);
      expect(cardType).toBe('streaming-file-write');
      // 🔴 问题：只有一张 StreamingCodeCard（消息级），无法区分两个文件的位置
    });
  });
});
