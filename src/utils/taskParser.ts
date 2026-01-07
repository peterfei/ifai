/**
 * Tasks.md 解析器
 * v0.2.6 新增
 *
 * 用于解析 OpenSpec 提案中的 tasks.md 文件
 */

export interface Task {
  id: string;          // 任务 ID (如 "1", "2-1")
  title: string;       // 任务标题
  status: 'todo' | 'in_progress' | 'done' | 'failed';
  content: string;     // 任务描述内容
  level: number;       // 缩进层级 (0, 1, 2...)
  parentId?: string;   // 父任务 ID
}

export interface TasksFile {
  proposalId?: string;
  tasks: Task[];
  rawContent: string;
}

/**
 * 从 tasks.md 文件内容中解析任务列表
 *
 * 支持多种格式：
 *
 * 格式 1（OpenSpec 标准格式）：
 * ### 1.1 依赖管理
 * - [x] 1.1.1 在 `Cargo.toml` 中添加依赖
 * - [ ] 1.1.2 验证项目成功编译
 *
 * 格式 2（简单标题格式 - proposal-generator 生成）：
 * ## Task 1: 设计登录数据模型 (development)
 *
 * 创建用户登录相关的数据模型
 *
 * **Estimated**: 2 hours
 */
export function parseTasksMarkdown(content: string, proposalId?: string): TasksFile {
  const lines = content.split('\n');
  const tasks: Task[] = [];
  const stack: { id: string; level: number }[] = []; // 用于追踪父任务

  let currentPhase = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 解析任务标题格式：## Task 1: 标题 (category)
    const taskHeadingMatch = line.match(/^##\s+Task\s+(\d+):\s*(.+?)\s*\((\w+)\)\s*$/);
    if (taskHeadingMatch) {
      const taskNum = taskHeadingMatch[1];
      const taskTitle = taskHeadingMatch[2].trim();
      const category = taskHeadingMatch[3];

      // 收集任务描述（接下来的非空行，直到下一个 ##）
      let description = '';
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('##')) {
        const descLine = lines[j].trim();
        if (descLine && !descLine.startsWith('**')) { // 跳过 **Estimated** 等元数据
          description += descLine + '\n';
        }
        j++;
      }

      const task: Task = {
        id: taskNum,
        title: taskTitle,
        status: 'todo',
        content: description.trim(),
        level: 0,
        parentId: undefined,
      };

      tasks.push(task);
      continue;
    }

    // 解析阶段/分组标题 (## 或 ###)
    const headingMatch = line.match(/^#{2,3}\s+(.+)$/);
    if (headingMatch) {
      currentPhase = headingMatch[1].trim();
      continue;
    }

    // 解析 checkbox 任务行 (- [ ] 或 - [x])
    const taskMatch = line.match(/^(\s*)-\s*\[(x| )\]\s*(.+)$/);
    if (taskMatch) {
      const indent = taskMatch[1].length;
      const isChecked = taskMatch[2] === 'x';
      const taskContent = taskMatch[3].trim();

      // 计算层级（每 2 个空格为一级）
      const level = Math.max(0, Math.floor(indent / 2));

      // 提取任务 ID（如果存在）
      // 格式：1.1.1 或 Task-1
      const idMatch = taskContent.match(/^([\d.]+|[\w-]+)\s+(.+)$/);
      let taskId: string;
      let title: string;
      let description = '';

      if (idMatch) {
        taskId = idMatch[1];
        const remaining = idMatch[2];

        // 尝试从剩余内容中提取标题和描述
        const titleDescMatch = remaining.match(/^([^:]+):\s*(.+)$/);
        if (titleDescMatch) {
          title = titleDescMatch[1].trim();
          description = titleDescMatch[2].trim();
        } else {
          title = remaining;
        }
      } else {
        // 没有 ID，尝试提取标题和描述
        const titleDescMatch = taskContent.match(/^([^:]+):\s*(.+)$/);
        if (titleDescMatch) {
          title = titleDescMatch[1].trim();
          description = titleDescMatch[2].trim();
          // 使用标题生成 ID
          taskId = title.toLowerCase().replace(/\s+/g, '-').substring(0, 20);
        } else {
          title = taskContent;
          taskId = `task-${tasks.length + 1}`;
        }
      }

      // 确定父任务
      let parentId: string | undefined;
      if (level > 0 && stack.length > 0) {
        // 找到最近的上级任务
        for (let l = level - 1; l >= 0; l--) {
          if (stack[l] && stack[l].level === l) {
            parentId = stack[l].id;
            break;
          }
        }
      }

      const task: Task = {
        id: taskId,
        title,
        status: isChecked ? 'done' : 'todo',
        content: description || title,
        level,
        parentId,
      };

      tasks.push(task);

      // 更新栈
      stack[level] = { id: taskId, level };
      // 清除更深层的栈
      stack.splice(level + 1);
    }
  }

  return {
    proposalId,
    tasks,
    rawContent: content,
  };
}

/**
 * 将任务列表重新生成 tasks.md 内容
 * 保持原格式，只更新任务状态
 */
export function generateTasksMarkdown(tasksFile: TasksFile): string {
  const lines = tasksFile.rawContent.split('\n');

  // 创建任务 ID 到状态的映射
  const taskStatusMap = new Map<string, Task['status']>();
  tasksFile.tasks.forEach(task => {
    taskStatusMap.set(task.id, task.status);
  });

  // 更新任务状态
  const updatedLines = lines.map(line => {
    const taskMatch = line.match(/^(\s*)-\s*\[(x| )\]\s*([\d.]+|[\w-]+)\s+(.+)$/);
    if (taskMatch) {
      const indent = taskMatch[1];
      const taskId = taskMatch[3];
      const newStatus = taskStatusMap.get(taskId);

      if (newStatus) {
        const checkbox = newStatus === 'done' ? 'x' : ' ';
        return `${indent}- [${checkbox}] ${taskId} ${taskMatch[4]}`;
      }
    }
    return line;
  });

  return updatedLines.join('\n');
}

/**
 * 按层级和依赖关系排序任务
 */
function groupTasksByLevel(tasks: Task[]): Task[] {
  // 简单按原始顺序返回，实际可以根据需要排序
  return tasks;
}

/**
 * 查找任务
 */
export function findTask(tasksFile: TasksFile, taskId: string): Task | undefined {
  return tasksFile.tasks.find(t => t.id === taskId);
}

/**
 * 更新任务状态
 */
export function updateTaskStatus(tasksFile: TasksFile, taskId: string, status: Task['status']): TasksFile {
  const task = findTask(tasksFile, taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const updatedTasks = tasksFile.tasks.map(t =>
    t.id === taskId ? { ...t, status } : t
  );

  return {
    ...tasksFile,
    tasks: updatedTasks,
  };
}

/**
 * 获取任务的子任务
 */
export function getSubTasks(tasksFile: TasksFile, parentId: string): Task[] {
  return tasksFile.tasks.filter(t => t.parentId === parentId);
}

/**
 * 获取任务的根路径（从根到当前任务）
 */
export function getTaskPath(tasksFile: TasksFile, taskId: string): Task[] {
  const path: Task[] = [];
  let currentTask = findTask(tasksFile, taskId);

  while (currentTask) {
    path.unshift(currentTask);
    if (currentTask.parentId) {
      currentTask = findTask(tasksFile, currentTask.parentId);
    } else {
      break;
    }
  }

  return path;
}
