# P2 阶段设计文档 - TodoWrite 工具集成

**日期**: 2025-04-02
**分支**: feature/p0-harness-api-sse
**阶段**: P2 - TodoWrite 工具集成

---

## 1. 现状分析

### 1.1 已实现功能

**P0 - API 客户端与 SSE 流式处理** ✅
- Anthropic、DeepSeek、OpenAI、自定义提供商
- SSE 解析器
- 流式事件处理

**P1 - 工具系统** ✅
- ToolRegistry（工具注册表）
- ToolPermissionMode（权限模式）
- SubagentToolExecutor（子 Agent 执行器）
- 10+ 内置工具注册

### 1.2 待实现功能

**TodoWrite 工具** - 已注册但无执行逻辑
- 在 `ToolRegistry` 中定义了规范
- 输入 schema 已定义
- 但没有实际的执行实现

### 1.3 前端任务系统

**现有类型**：
- `TaskNode` - 任务节点（src/types/taskBreakdown.ts）
- `TaskBreakdown` - 任务拆解结果
- `ToolCall` - 工具调用

**现有 Store**：
- `useTaskBreakdownStore` - 任务拆解状态
- `useChatStore` - 聊天和工具调用状态

---

## 2. P2 设计方案

### 2.1 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Frontend)                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐      ┌──────────────┐      ┌─────────────┐ │
│  │ ChatMessage │─────▶│ ToolCall     │─────▶│ TodoWrite   │ │
│  │ (用户消息)   │      │ (工具调用)    │      │ (任务列表)   │ │
│  └─────────────┘      └──────────────┘      └─────────────┘ │
│         │                                           │       │
│         ▼                                           ▼       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         useTaskBreakdownStore                      │    │
│  │    - tasks: TaskNode[]                             │    │
│  │    - addTask()                                     │    │
│  │    - updateTask()                                  │    │
│  │    - deleteTask()                                  │    │
│  │    - syncWithBackend()                             │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Tauri IPC
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       后端 (Rust Backend)                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              TodoWriteExecutor                        │  │
│  │  - execute() // 实现 ToolExecutor trait              │  │
│  │  - 解析任务列表                                       │  │
│  │  - 验证任务格式                                       │  │
│  │  - 同步到 TaskStore                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              TaskStore (新增)                         │  │
│  │  - tasks: Arc<RwLock<Vec<TaskItem>>>                 │  │
│  │  - add_tasks()                                       │  │
│  │  - update_task_status()                              │  │
│  │  - get_tasks()                                       │  │
│  │  - persist_to_file() // 可选持久化                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Tauri Commands (新增)                        │  │
│  │  - get_tasks() // 获取当前任务列表                    │  │
│  │  - update_task() // 更新任务状态                      │  │
│  │  - clear_tasks() // 清空任务列表                      │  │
│  │  - export_tasks() // 导出任务（可选）                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流设计

#### 场景 1: AI 调用 TodoWrite 工具

```
1. AI 生成工具调用请求
   └─> { "name": "TodoWrite", "arguments": { "todos": [...] } }

2. 前端接收 tool_call 事件
   └─> 显示工具调用面板

3. 用户批准工具调用
   └─> 调用 approve_tool_call()

4. 后端执行 TodoWrite
   └─> TodoWriteExecutor::execute()
       ├─> 解析 todos 参数
       ├─> 验证格式
       └─> 写入 TaskStore

5. 前端同步任务列表
   └─> 监听任务更新事件
       └─> 更新 useTaskBreakdownStore
```

#### 场景 2: 用户手动更新任务状态

```
1. 用户在 UI 中更新任务状态
   └─> useTaskBreakdownStore.updateTask()

2. 前端调用后端更新命令
   └─> invoke('update_task', { id, status })

3. 后端更新 TaskStore
   └─> TaskStore::update_task_status()

4. 可选：持久化到文件
   └─> tasks.json
```

---

## 3. 实现计划

### 3.1 后端实现 (Rust)

#### 3.1.1 新增文件

**`src-tauri/src/harness/tool/executor/todoutil.rs`**
```rust
//! TodoWrite 工具执行器
//!
//! 实现 TodoWrite 工具的实际执行逻辑。

use serde_json::Value;
use super::super::{ToolError, ToolExecutor};

pub struct TodoWriteExecutor {
    // 任务存储引用
}

impl ToolExecutor for TodoWriteExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "TodoWrite" => self.handle_todo_write(input),
            _ => Err(ToolError::NotFound { name: name.to_string() }),
        }
    }

    fn allowed_tools(&self) -> &std::collections::HashSet<String> {
        // 只允许 TodoWrite
        &self.allowed
    }
}

impl TodoWriteExecutor {
    fn handle_todo_write(&self, input: &Value) -> Result<String, ToolError> {
        // 解析 todos 数组
        // 验证每个 todo 的格式
        // 写入 TaskStore
        // 返回成功消息
    }
}
```

**`src-tauri/src/harness/task/store.rs`**
```rust
//! 任务存储
//!
//! 集中管理当前会话的任务列表。

use std::sync::{Arc, RwLock};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskItem {
    pub content: String,
    pub active_form: String,
    pub status: TaskStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
}

pub struct TaskStore {
    tasks: Arc<RwLock<Vec<TaskItem>>>,
}

impl TaskStore {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn add_tasks(&self, tasks: Vec<TaskItem>) -> Result<(), String> {
        let mut store = self.tasks.write().unwrap();
        store.extend(tasks);
        Ok(())
    }

    pub fn update_task_status(&self, index: usize, status: TaskStatus) -> Result<(), String> {
        let mut store = self.tasks.write().unwrap();
        if index < store.len() {
            store[index].status = status;
            Ok(())
        } else {
            Err(format!("Task index {} out of bounds", index))
        }
    }

    pub fn get_tasks(&self) -> Vec<TaskItem> {
        let store = self.tasks.read().unwrap();
        store.clone()
    }

    pub fn clear(&self) {
        let mut store = self.tasks.write().unwrap();
        store.clear();
    }
}
```

**`src-tauri/src/commands/task_store_commands.rs`**
```rust
//! 任务存储 Tauri 命令
//!
//! 提供前端访问任务存储的接口。

use crate::harness::task::store::{TaskStore, TaskItem, TaskStatus};

#[tauri::command]
pub async fn get_tasks(
    state: tauri::State<'_, TaskStore>,
) -> Result<Vec<TaskItem>, String> {
    Ok(state.get_tasks())
}

#[tauri::command]
pub async fn update_task(
    state: tauri::State<'_, TaskStore>,
    index: usize,
    status: String,
) -> Result<(), String> {
    let task_status = match status.as_str() {
        "pending" => TaskStatus::Pending,
        "in_progress" => TaskStatus::InProgress,
        "completed" => TaskStatus::Completed,
        _ => return Err(format!("Invalid task status: {}", status)),
    };
    state.update_task_status(index, task_status)
}

#[tauri::command]
pub async fn clear_tasks(
    state: tauri::State<'_, TaskStore>,
) -> Result<(), String> {
    state.clear();
    Ok(())
}
```

#### 3.1.2 修改现有文件

**`src-tauri/src/lib.rs`**
```rust
// 添加 TaskStore 到 AppState
pub struct AppState {
    pub rag_service: RagService,
    pub task_store: TaskStore, // 新增
    // ... 其他字段
}

// 注册命令
.invoke_handler(tauri::generate_handler![
    // ... 现有命令
    get_tasks,
    update_task,
    clear_tasks,
])
```

**`src-tauri/src/harness/tool/mod.rs`**
```rust
pub mod executor;
pub mod executor; // 确保 TodoWriteExecutor 可以被导入
pub mod spec;
pub mod registry;

// 新增：任务存储相关
pub mod task;

pub use task::store::TaskStore;
```

### 3.2 前端实现 (TypeScript)

#### 3.2.1 新增文件

**`src/services/taskStoreService.ts`**
```typescript
/**
 * 任务存储服务
 *
 * 与后端 TaskStore 交互
 */

import { invoke } from '@tauri-apps/api/core';

export interface TaskItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export const taskStoreService = {
  /**
   * 获取当前任务列表
   */
  async getTasks(): Promise<TaskItem[]> {
    return await invoke<TaskItem[]>('get_tasks');
  },

  /**
   * 更新任务状态
   */
  async updateTask(index: number, status: TaskItem['status']): Promise<void> {
    await invoke('update_task', { index, status });
  },

  /**
   * 清空任务列表
   */
  async clearTasks(): Promise<void> {
    await invoke('clear_tasks');
  },
};
```

**`src/stores/taskStore.ts`**
```typescript
/**
 * 任务列表 Store
 *
 * 管理当前会话的任务状态
 */

import { create } from 'zustand';
import { taskStoreService, type TaskItem } from '../services/taskStoreService';

interface TaskStoreState {
  tasks: TaskItem[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadTasks: () => Promise<void>;
  updateTaskStatus: (index: number, status: TaskItem['status']) => Promise<void>;
  clearTasks: () => Promise<void>;
  syncFromToolCall: (todos: any[]) => void;
}

export const useTaskStore = create<TaskStoreState>((set, get) => ({
  tasks: [],
  isLoading: false,
  error: null,

  loadTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const tasks = await taskStoreService.getTasks();
      set({ tasks, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  updateTaskStatus: async (index, status) => {
    set({ error: null });
    try {
      await taskStoreService.updateTask(index, status);
      // 重新加载任务列表
      get().loadTasks();
    } catch (error) {
      set({ error: String(error) });
    }
  },

  clearTasks: async () => {
    set({ error: null });
    try {
      await taskStoreService.clearTasks();
      set({ tasks: [] });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  syncFromToolCall: (todos) => {
    // 从 TodoWrite 工具调用同步任务
    const tasks: TaskItem[] = todos.map(todo => ({
      content: todo.content,
      activeForm: todo.activeForm,
      status: todo.status || 'pending',
    }));
    set({ tasks });
  },
}));
```

#### 3.2.2 修改现有文件

**`src/stores/useChatStore.ts`**
- 在工具调用成功后，检查是否是 TodoWrite
- 如果是，同步任务到 TaskStore

---

## 4. 测试计划

### 4.1 单元测试

**后端测试** (`src-tauri/src/harness/tool/executor/todoutil_tests.rs`)
```rust
#[test]
fn test_todo_write_parse_valid_input() {
    let executor = TodoWriteExecutor::new();
    let input = json!({
        "todos": [
            {
                "content": "Test task",
                "activeForm": "Testing task",
                "status": "pending"
            }
        ]
    });

    let result = executor.handle_todo_write(&input);
    assert!(result.is_ok());
}
```

### 4.2 集成测试

**端到端流程**：
1. 调用 TodoWrite 工具
2. 验证任务写入 TaskStore
3. 验证前端可以读取任务
4. 验证前端更新任务状态同步到后端

---

## 5. 验收标准

### 5.1 功能验收

- [ ] TodoWrite 工具可以被 AI 调用
- [ ] 任务列表正确显示在前端
- [ ] 用户可以手动更新任务状态
- [ ] 任务状态变更同步到后端
- [ ] 任务列表可以在会话间持久化（可选）

### 5.2 性能验收

- [ ] 任务更新延迟 < 100ms
- [ ] 支持至少 100 个任务
- [ ] 工具调用响应时间 < 500ms

### 5.3 代码质量

- [ ] 所有函数有文档注释
- [ ] 错误处理完整
- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试通过

---

## 6. 下一步行动

1. ✅ 设计方案评审
2. ⏳ 实现后端 TaskStore
3. ⏳ 实现 TodoWriteExecutor
4. ⏳ 实现 Tauri 命令
5. ⏳ 实现前端服务
6. ⏳ 实现前端 Store
7. ⏳ 集成测试
8. ⏳ 验收测试
