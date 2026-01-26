/**
 * Agent 文件读取测试辅助函数
 *
 * @version v0.3.4 - 适配会话信任机制
 */

/**
 * 🔥 v0.3.4: 等待工具调用完成（适配会话信任机制）
 *
 * 会话信任机制会自动批准工具调用，不再显示审批对话框。
 * Agent 系统使用 tool 消息来表示工具调用结果。
 */
export async function waitForToolCallsCompletion(page: any, timeout: number = 30000): Promise<{
  completedCount: number;
  totalCount: number;
}> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await page.evaluate(() => {
      const messages = (window as any).__chatStore?.getState().messages || [];
      const toolCalls = messages.filter((m: any) => m.toolCalls && m.toolCalls.length > 0);

      let completedCount = 0;
      let totalCount = 0;

      toolCalls.forEach((message: any) => {
        message.toolCalls?.forEach((tc: any) => {
          totalCount++;
          // 检查工具调用是否完成（completed 或 failed）
          if (tc.status === 'completed' || tc.status === 'failed') {
            completedCount++;
          }
        });
      });

      // 🔥 v0.3.4: 也检查 tool 消息（Agent 执行结果）
      const toolMessages = messages.filter((m: any) => m.role === 'tool');

      // 🔥 DEBUG: 输出 messages 结构信息
      return {
        completedCount,
        totalCount,
        totalMessages: messages.length,
        messagesWithToolCalls: toolCalls.length,
        toolMessagesCount: toolMessages.length,
        // 输出前几条消息的信息用于调试
        sampleMessages: messages.slice(0, 5).map((m: any) => ({
          role: m.role,
          hasToolCalls: !!m.toolCalls,
          toolCallsCount: m.toolCalls?.length || 0,
          toolCallId: m.tool_call_id
        }))
      };
    });

    // 🔥 DEBUG: 首次输出详细信息
    if (Date.now() - startTime < 100) {
      console.log(`[waitForToolCallsCompletion] 🔥 Initial state:`, JSON.stringify(result, null, 2));
    }

    // 🔥 DEBUG: 每5秒输出一次状态
    const elapsed = Date.now() - startTime;
    if (elapsed > 0 && elapsed % 5000 < 500) {
      console.log(`[waitForToolCallsCompletion] 🔥 Status: ${result.completedCount}/${result.totalCount} tool calls, ${result.toolMessagesCount} tool messages (elapsed: ${elapsed}ms)`);
    }

    // 🔥 v0.3.4: 如果有 tool 消息，说明 Agent 已完成工具调用
    if (result.toolMessagesCount > 0) {
      console.log(`[waitForToolCallsCompletion] ✅ Found ${result.toolMessagesCount} tool messages!`);
      // 返回一个估算值，基于 tool 消息数量
      return { completedCount: result.toolMessagesCount, totalCount: result.toolMessagesCount };
    }

    // 如果有工具调用且都已完成，返回结果
    if (result.totalCount > 0 && result.completedCount >= result.totalCount) {
      console.log(`[waitForToolCallsCompletion] ✅ All ${result.totalCount} tool calls completed!`);
      return { completedCount: result.completedCount, totalCount: result.totalCount };
    }

    // 如果没有任何工具调用，继续等待
    await page.waitForTimeout(500);
  }

  console.log(`[waitForToolCallsCompletion] ⏰ Timeout! Final status: 0/0`);
  return { completedCount: 0, totalCount: 0 };
}

/**
 * 向后兼容：保留旧的 waitForApprovalDialog 名称
 * @deprecated 使用 waitForToolCallsCompletion 替代
 */
export async function waitForApprovalDialog(page: any, timeout: number = 30000): Promise<{
  completedCount: number;
  totalCount: number;
  dialogCount: number;
}> {
  const result = await waitForToolCallsCompletion(page, timeout);
  return {
    ...result,
    dialogCount: 0 // v0.3.4: 会话信任机制不会显示对话框
  };
}
