/**
 * Task Breakdown 结果处理器
 * 处理 task-breakdown agent 的结果
 * @module taskBreakdownResultHandler
 */

import { toast } from 'sonner';
import { v4 } from 'uuid';
import { useTaskBreakdownStore } from '@/stores/taskBreakdownStore';
import { useFileStore } from '@/stores/fileStore';
import { openFileFromPath } from '@/utils/fileActions';

/**
 * 解析后的任务拆解数据结构
 */
export interface ParsedBreakdownData {
  id?: string;
  title?: string;
  description?: string;
  originalPrompt?: string;
  taskTree?: {
    title?: string;
    description?: string;
    children?: any[];
  };
  proposalReference?: {
    proposalId: string;
  };
  updatedAt?: number;
}

/**
 * 处理 task-breakdown agent 的完成结果
 */
export async function handleTaskBreakdownResult(
  result: string,
  agentId: string
): Promise<{ success: boolean; breakdownId?: string; error?: string }> {
  console.log('[TaskBreakdownResultHandler] 📋 Task breakdown completed, processing result...');
  console.log('[TaskBreakdownResultHandler] 📋 Result preview:', result.substring(0, 200));

  try {
    // 检查结果是否为空或过短
    const trimmedResult = result.trim();
    if (!trimmedResult || trimmedResult.length < 10) {
      throw new Error('AI 返回结果为空或过短，无法解析任务拆解');
    }

    // 从结果中提取 JSON（处理 markdown 代码块）
    let jsonStr = result;
    const codeBlockMatch = result.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
      console.log('[TaskBreakdownResultHandler] 📋 Extracted JSON from code block');
    } else {
      console.log('[TaskBreakdownResultHandler] 📋 No code block found, parsing raw result');
    }

    // 清理 JSON 字符串
    jsonStr = jsonStr.trim();
    if (!jsonStr || jsonStr.length < 10) {
      throw new Error('提取的 JSON 内容为空');
    }

    console.log('[TaskBreakdownResultHandler] 📋 Parsing JSON...', {
      length: jsonStr.length,
      preview: jsonStr.substring(0, 100),
    });

    // 解析任务拆解数据
    let breakdownData: ParsedBreakdownData = JSON.parse(jsonStr);

    console.log('[TaskBreakdownResultHandler] 📋 Parsed breakdown data:', {
      hasId: !!breakdownData.id,
      hasTitle: !!breakdownData.title,
      hasTaskTree: !!breakdownData.taskTree,
      breakdownId: breakdownData.id,
    });

    // 验证并修复数据结构
    breakdownData = normalizeBreakdownData(breakdownData);

    if (!breakdownData.taskTree) {
      console.warn('[TaskBreakdownResultHandler] ⚠️ Invalid breakdown data structure:', breakdownData);
      toast.error('任务拆解格式错误', {
        description: 'AI 返回的数据格式不正确',
      });
      return { success: false, error: 'Invalid breakdown data structure' };
    }

    console.log('[TaskBreakdownResultHandler] 📋 Final breakdown structure:', {
      id: breakdownData.id,
      title: breakdownData.title,
      description: breakdownData.description,
      hasTaskTree: !!breakdownData.taskTree,
    });

    // 保存任务拆解
    const taskBreakdownStore = useTaskBreakdownStore.getState();

    const breakdown = {
      ...breakdownData,
      id: breakdownData.id || v4(),
      title: breakdownData.title || '任务拆解',
      description: breakdownData.description || '',
      originalPrompt: breakdownData.originalPrompt || '',
      createdAt: Date.now(),
      status: 'draft' as const,
    };

    console.log('[TaskBreakdownResultHandler] 📋 Saving task breakdown...');
    await taskBreakdownStore.saveBreakdown(breakdown as any);

    console.log('[TaskBreakdownResultHandler] ✅ Task breakdown saved:', breakdown.id);

    // 处理完成后的 UI 展示
    await handleBreakdownCompletion(breakdownData, breakdown);

    return { success: true, breakdownId: breakdown.id };
  } catch (error) {
    console.error('[TaskBreakdownResultHandler] ❌ Failed to process task breakdown result:', error);
    toast.error('任务拆解处理失败', {
      description: error instanceof Error ? error.message : '未知错误',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 规范化任务拆解数据
 */
function normalizeBreakdownData(data: ParsedBreakdownData): ParsedBreakdownData {
  // 如果缺少 id，生成一个
  if (!data.id) {
    data.id = `tb-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    console.log('[TaskBreakdownResultHandler] 📋 Generated id for breakdown:', data.id);
  }

  // 如果缺少 title，从 taskTree.title 获取
  if (!data.title && data.taskTree?.title) {
    data.title = data.taskTree.title;
    console.log('[TaskBreakdownResultHandler] 📋 Extracted title from taskTree:', data.title);
  }

  // 如果仍然没有 title，使用默认值
  if (!data.title) {
    data.title = '任务拆解';
    console.log('[TaskBreakdownResultHandler] 📋 Using default title');
  }

  // 如果缺少 description，使用 taskTree.description 或默认值
  if (!data.description) {
    data.description = data.taskTree?.description || '任务拆解结果';
    console.log('[TaskBreakdownResultHandler] 📋 Generated description:', data.description);
  }

  // 如果缺少 originalPrompt，使用 description
  if (!data.originalPrompt) {
    data.originalPrompt = data.description;
    console.log('[TaskBreakdownResultHandler] 📋 Generated originalPrompt');
  }

  // 确保 updatedAt 存在
  if (!data.updatedAt) {
    data.updatedAt = Date.now();
  }

  return data;
}

/**
 * 处理任务拆解完成后的 UI 展示
 */
async function handleBreakdownCompletion(
  breakdownData: ParsedBreakdownData,
  breakdown: any
): Promise<void> {
  const taskBreakdownStore = useTaskBreakdownStore.getState();

  // 检查是否有关联的提案
  if (breakdownData.proposalReference?.proposalId) {
    const rootPath = useFileStore.getState().rootPath;
    const proposalId = breakdownData.proposalReference.proposalId;
    const proposalPath = `${rootPath}/.ifai/changes/${proposalId}/proposal.md`;

    console.log('[TaskBreakdownResultHandler] 📄 Opening proposal file:', proposalPath);

    // 尝试打开提案文件
    const success = await openFileFromPath(proposalPath);

    if (success) {
      toast.success('任务拆解完成', {
        description: `已打开提案：${breakdownData.title}`,
      });
    } else {
      // 如果打开失败，回退到任务树面板
      taskBreakdownStore.setCurrentBreakdown(breakdown);
      taskBreakdownStore.setPanelOpen(true);
      toast.success('任务拆解完成', {
        description: `"${breakdownData.title}" 已生成`,
        action: {
          label: '查看任务树',
          onClick: () => {
            taskBreakdownStore.setPanelOpen(true);
          },
        },
      });
    }
  } else {
    // 没有提案关联，显示任务树面板
    taskBreakdownStore.setCurrentBreakdown(breakdown);
    taskBreakdownStore.setPanelOpen(true);
    toast.success('任务拆解完成', {
      description: `"${breakdownData.title}" 已生成`,
      action: {
        label: '查看',
        onClick: () => {
          taskBreakdownStore.setPanelOpen(true);
        },
      },
    });
  }
}

/**
 * 检查是否应该处理 task-breakdown 结果
 */
export function shouldHandleTaskBreakdownResult(agentType: string | undefined, result: string): boolean {
  return agentType === 'task-breakdown' && !!result;
}

/**
 * 验证 task-breakdown 结果格式
 */
export function validateTaskBreakdownResult(result: string): { valid: boolean; error?: string } {
  const trimmedResult = result.trim();

  if (!trimmedResult) {
    return { valid: false, error: 'Result is empty' };
  }

  if (trimmedResult.length < 10) {
    return { valid: false, error: 'Result is too short' };
  }

  return { valid: true };
}
