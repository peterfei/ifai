/**
 * 任务拆解服务
 * v0.2.6 重构 - 使用 Agent 系统
 *
 * 负责调用 task-breakdown agent 进行任务拆解
 */

import { listen } from '@tauri-apps/api/event';
import { v4 as uuidv4 } from 'uuid';
import { useAgentStore } from '../stores/agentStore';
import { useChatStore } from '../stores/useChatStore';
import { TaskBreakdown, TaskNode } from '../types/taskBreakdown';

/**
 * 解析 AI 响应中的 JSON
 */
function parseAIResponse(response: string): TaskNode {
  // 尝试直接解析
  try {
    const parsed = JSON.parse(response);
    if (parsed.taskTree) {
      return parsed.taskTree;
    }
    throw new Error('响应中缺少 taskTree 字段');
  } catch (e) {
    // 尝试提取 JSON 代码块
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                     response.match(/```\s*([\s\S]*?)\s*```/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.taskTree) {
          return parsed.taskTree;
        }
      } catch (e2) {
        console.error('[TaskBreakdownService] Failed to parse extracted JSON:', e2);
      }
    }

    // 尝试查找第一个完整的 JSON 对象
    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]);
        if (parsed.taskTree) {
          return parsed.taskTree;
        }
      } catch (e3) {
        console.error('[TaskBreakdownService] Failed to parse matched JSON:', e3);
      }
    }

    throw new Error('无法解析 AI 响应为有效的任务树结构');
  }
}

/**
 * 生成任务 ID
 */
function generateTaskId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  return `tb-${Date.now()}-${slug}`;
}

/**
 * 启动任务拆解 Agent
 *
 * @param taskDescription 任务描述
 * @param chatMsgId 可选的聊天消息 ID（用于显示进度）
 * @returns agent ID
 */
export async function startBreakdownAgent(
  taskDescription: string,
  chatMsgId?: string
): Promise<string> {
  console.log('[TaskBreakdownService] Starting agent for task:', taskDescription);

  // 启动 agent
  const agentId = await useAgentStore.getState().launchAgent(
    'task-breakdown',  // agent 类型，对应 task-breakdown.md
    taskDescription,    // 任务描述
    chatMsgId           // 聊天消息 ID（可选）
  );

  console.log('[TaskBreakdownService] Agent started:', agentId);
  return agentId;
}

/**
 * 等待 Agent 完成
 *
 * @param agentId Agent ID
 * @param timeout 超时时间（毫秒），默认 60 秒
 * @returns 任务拆解结果
 */
export async function waitForBreakdownResult(
  agentId: string,
  timeout: number = 60000
): Promise<TaskBreakdown> {
  console.log('[TaskBreakdownService] Waiting for agent result:', agentId);

  return new Promise((resolve, reject) => {
    const eventId = `agent_${agentId}`;
    let unlisten: (() => void) | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let resolved = false;

    // 清理函数
    const cleanup = () => {
      if (resolved) return;
      resolved = true;

      if (unlisten) unlisten();
      if (timeoutId) clearTimeout(timeoutId);
    };

    // 设置超时
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('任务拆解超时（60秒）'));
    }, timeout);

    // 监听 agent 事件
    listen(eventId, (event) => {
      if (resolved) return;

      const payload = event.payload as any;
      console.log('[TaskBreakdownService] Agent event:', payload.type);

      // 检查 result 事件
      if (payload.type === 'result' && payload.result) {
        const result = payload.result;
        console.log('[TaskBreakdownService] Result received:', result.substring(0, 100));

        try {
          // 解析 JSON
          const taskTree = parseAIResponse(result);

          // 构建 TaskBreakdown
          const breakdown: TaskBreakdown = {
            id: generateTaskId(taskTree.title),
            title: taskTree.title,
            description: taskTree.description || result.substring(0, 200),
            originalPrompt: result, // 保存完整的原始响应
            taskTree: taskTree,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: 'draft',
          };

          cleanup();
          resolve(breakdown);
        } catch (e) {
          cleanup();
          reject(new Error(`解析任务拆解结果失败: ${e}`));
        }
      }

      // 检查错误事件
      if (payload.type === 'error') {
        cleanup();
        reject(new Error(payload.error || '任务拆解失败'));
      }
    }).then((unlistenFn) => {
      unlisten = unlistenFn;
    }).catch((e) => {
      cleanup();
      reject(new Error(`设置事件监听器失败: ${e}`));
    });
  });
}

/**
 * 调用 AI 进行任务拆解（兼容旧接口）
 *
 * @param taskDescription 任务描述
 * @param providerId 提供商 ID（已废弃，保留用于兼容）
 * @param modelName 模型名称（已废弃，保留用于兼容）
 * @returns 任务拆解结果
 */
export async function breakdownTask(
  taskDescription: string,
  providerId?: string,
  modelName?: string
): Promise<TaskBreakdown> {
  console.log('[TaskBreakdownService] breakdownTask (deprecated, using agent system)');

  // 创建一个临时的聊天消息来显示进度
  const { addMessage } = useChatStore.getState() as any;
  const tempMsgId = uuidv4();

  addMessage({
    id: tempMsgId,
    role: 'assistant',
    content: `🔄 正在拆解任务...

**任务描述**：${taskDescription}

**AI 正在分析任务...**
`
  });

  try {
    // 启动 agent
    const agentId = await startBreakdownAgent(taskDescription, tempMsgId);

    // 等待结果
    const breakdown = await waitForBreakdownResult(agentId);

    console.log('[TaskBreakdownService] Task breakdown completed:', breakdown.id);
    return breakdown;
  } catch (e) {
    // 更新消息显示错误
    const { updateMessageContent } = useChatStore.getState() as any;
    updateMessageContent(tempMsgId, `### ❌ 任务拆解失败

${e}

**可能的原因**：
- AI 响应格式不正确
- 网络连接问题
- API 配额不足
`);

    throw e;
  }
}

/**
 * 流式任务拆解（已废弃，agent 系统自动处理流式）
 */
export async function breakdownTaskStreaming(
  taskDescription: string,
  providerId: string,
  modelName: string,
  onProgress: (progress: number, content: string) => void
): Promise<TaskBreakdown> {
  // Agent 系统已经自动处理流式，直接调用 breakdownTask
  return breakdownTask(taskDescription, providerId, modelName);
}
