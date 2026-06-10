/**
 * streamingFileWriteAdapter — 文件写入流式预览适配器
 *
 * 将包含 streamExtract 工具调用的消息适配为 StreamingCodeCard。
 * 优先级高于 toolCallAdapter（在 MessageAdapterRegistry 中先注册）。
 * 通过 ToolApprovalRegistry.isStreamExtractTool() 判断工具是否需要流式预览。
 */

import type { MessageAdapter } from '../MessageAdapterRegistry';
import { toolApprovalRegistry } from '../../../core/approval/ToolApprovalRegistry';

export const streamingFileWriteAdapter: MessageAdapter = {
  id: 'streaming-file-write',
  match: (msg: any) => {
    if (!msg.toolCalls?.length) return false;
    return msg.toolCalls.some((tc: any) => {
      const toolName = tc.tool || tc.name || tc.function?.name;
      if (!toolName || !toolApprovalRegistry.isStreamExtractTool(toolName)) return false;
      return !!tc.isPartial;
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
