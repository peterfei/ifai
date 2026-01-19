/**
 * 任务监控同步服务
 * 将 Agent 动作同步到 Mission Control 任务监控
 * @module taskMonitorSync
 */

import { useTaskStore } from '@/stores/taskStore';
import { TaskStatus as MonitorStatus, TaskCategory, TaskPriority, TaskMetadata } from '@/components/TaskMonitor/types';

/**
 * 同步 Agent 动作到 Mission Control
 *
 * 功能说明：
 * - 根据 agent 状态映射到任务监控状态
 * - 为新 agent 创建任务，为已存在的 agent 更新任务
 * - 保留任务的创建时间
 * - 添加带时间戳的日志
 *
 * @param id - Agent ID
 * @param agentType - Agent 类型（如 explore, backend_dev）
 * @param status - Agent 状态（running, completed, failed）
 * @param log - 可选的日志消息
 */
export function syncAgentActionToTaskMonitor(
  id: string,
  agentType: string,
  status: string,
  log?: string
): void {
  const taskStore = useTaskStore.getState();
  const existing = taskStore.tasks.find(t => t.id === id);

  let monitorStatus = MonitorStatus.RUNNING;
  if (status === 'completed') monitorStatus = MonitorStatus.SUCCESS;
  if (status === 'failed') monitorStatus = MonitorStatus.FAILED;

  const metadata: TaskMetadata = {
    id,
    title: `${agentType} Agent`,
    description: log || existing?.description || `Executing ${agentType} logic...`,
    status: monitorStatus,
    category: TaskCategory.GENERATION,
    priority: TaskPriority.HIGH,
    createdAt: existing ? existing.createdAt : Date.now(),
    progress: {
      current: status === 'completed' ? 100 : 50,
      total: 100,
      percentage: status === 'completed' ? 100 : 50
    },
    logs: log ? [{ timestamp: Date.now(), level: 'info' as any, message: log }] : existing?.logs
  };

  if (existing) {
    taskStore.updateTask(id, metadata);
  } else {
    taskStore.addTask(metadata);
  }
}
