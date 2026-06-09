/**
 * streamingFileWriteAdapter — 文件写入流式预览适配器
 *
 * 将包含文件写入类工具调用的消息适配为 StreamingCodeCard。
 * 优先级高于 toolCallAdapter（在 MessageAdapterRegistry 中先注册）。
 *
 * ⚠️ 临时硬编码工具名集合，数据层接入后由 ToolApprovalRegistry 替代
 */

import type { MessageAdapter } from '../MessageAdapterRegistry';

/* ===== 声明式配置 ===== */

/**
 * 流式文件写入工具名集合
 * 匹配这些工具时，走 StreamingCodeCard 而非 ToolCallCard
 */
export const STREAM_EXTRACT_TOOLS: Set<string> = new Set([
  'agent_write_file',
  'write_file',
  'agent_create_file',
  'agent_replace_text',
  'agent_replace_content',
  'agent_edit_file',
  'edit_file',
]);

export const streamingFileWriteAdapter: MessageAdapter = {
  id: 'streaming-file-write',
  match: (msg: any) => {
    if (!msg.toolCalls?.length) return false;
    return msg.toolCalls.some((tc: any) => {
      const toolName = tc.tool || tc.name || tc.function?.name;
      if (!toolName || !STREAM_EXTRACT_TOOLS.has(toolName)) return false;
      // 仅 pending 状态匹配（等待审批）
      // approved(executing)/completed/rejected 后交还给正常渲染流程
      return tc.status === 'pending';
    });
  },
  adapt: (msg: any) => ({
    cardType: 'streaming-file-write',
    id: msg.id,
    role: msg.role,
    content: msg.content,
    data: { toolCalls: msg.toolCalls },
  }),
};
