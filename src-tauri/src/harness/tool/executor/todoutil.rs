//! TodoWrite 工具执行器
//!
//! 🪄 元编程驱动：声明式验证，一行代码替代 70+ 行手动检查

use serde_json::Value;
use std::collections::HashSet;

use super::super::{ToolError, ToolExecutor};
use crate::harness::task::{TaskItem, TaskStatus, TaskStore, ValidatedTodoWrite};

/// TodoWrite 工具执行器
pub struct TodoWriteExecutor {
    /// 任务存储引用
    store: TaskStore,

    /// 允许的工具（只有 TodoWrite）
    allowed_tools: HashSet<String>,
}

impl TodoWriteExecutor {
    /// 创建新的 TodoWrite 执行器
    pub fn new(store: TaskStore) -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("TodoWrite".to_string());

        Self {
            store,
            allowed_tools,
        }
    }

    /// 处理 TodoWrite 工具调用
    ///
    /// 🪄 元编程魔法：
    /// - 旧实现：70+ 行手动解析和验证代码
    /// - 新实现：1 行 serde 反序列化（自动验证）
    fn handle_todo_write(&self, input: &Value) -> Result<String, ToolError> {
        // ✅ 声明式验证：反序列化时自动执行所有验证规则
        // - 空/空白 content → 自动拒绝
        // - content < 3 字符 → 自动拒绝
        // - 空/空白 activeForm → 自动拒绝
        // - activeForm < 3 字符 → 自动拒绝
        // - todos 数组为空 → 自动拒绝
        let validated: ValidatedTodoWrite = serde_json::from_value(input.clone())
            .map_err(|e| ToolError::InvalidInput(e.to_string()))?;

        // 转换为 TaskItem 并存储
        let tasks: Vec<TaskItem> = validated.todos
            .into_iter()
            .map(|item| item.into())
            .collect();

        // 写入 TaskStore
        self.store
            .set_tasks(tasks)
            .map_err(|e| ToolError::Execution(format!("Failed to write tasks to store: {}", e)))?;

        // 返回成功消息
        let task_count = self.store.task_count();
        Ok(format!(
            "Updated task list with {} task(s):\n{}",
            task_count,
            self.format_task_list(&self.store.get_tasks())
        ))
    }

    /// 格式化任务列表用于显示
    fn format_task_list(&self, tasks: &[TaskItem]) -> String {
        tasks
            .iter()
            .enumerate()
            .map(|(i, task)| {
                let status_symbol = match task.status {
                    TaskStatus::Pending => "[TODO]",
                    TaskStatus::InProgress => "[IN-PROGRESS]",
                    TaskStatus::Completed => "[DONE]",
                };
                format!("  [{}] {} {}", i + 1, status_symbol, task.content)
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

impl ToolExecutor for TodoWriteExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "TodoWrite" => self.handle_todo_write(input),
            _ => Err(ToolError::NotFound {
                name: name.to_string(),
            }),
        }
    }

    fn is_available(&self, name: &str) -> bool {
        self.allowed_tools.contains(name)
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

// ============ 元编程：单元测试 ============

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_store() -> TaskStore {
        TaskStore::new()
    }

    fn create_test_executor() -> TodoWriteExecutor {
        TodoWriteExecutor::new(create_test_store())
    }

    #[test]
    fn test_handle_todo_write_valid_input() {
        let store = create_test_store();
        let mut executor = TodoWriteExecutor::new(store);

        let input = serde_json::json!({
            "todos": [
                {
                    "content": "Task 1",
                    "activeForm": "Working on Task 1",
                    "status": "pending"
                },
                {
                    "content": "Task 2",
                    "activeForm": "Working on Task 2",
                    "status": "in_progress"
                }
            ]
        });

        let result = executor.execute("TodoWrite", &input);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.contains("Updated task list with 2 task(s)"));
        assert!(output.contains("Task 1"));
        assert!(output.contains("Task 2"));
    }

    #[test]
    fn test_handle_todo_write_empty_content() {
        // 🪄 元编程：验证逻辑在 serde 反序列化时自动执行
        let store = create_test_store();
        let mut executor = TodoWriteExecutor::new(store);

        let input = serde_json::json!({
            "todos": [{
                "content": "",
                "activeForm": "Testing"
            }]
        });

        let result = executor.execute("TodoWrite", &input);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("content 字段为空") || err.contains("content"));
    }

    #[test]
    fn test_handle_todo_write_whitespace_only_content() {
        let store = create_test_store();
        let mut executor = TodoWriteExecutor::new(store);

        let input = serde_json::json!({
            "todos": [{
                "content": "   ",
                "activeForm": "Testing"
            }]
        });

        let result = executor.execute("TodoWrite", &input);
        assert!(result.is_err());
    }

    #[test]
    fn test_handle_todo_write_content_too_short() {
        let store = create_test_store();
        let mut executor = TodoWriteExecutor::new(store);

        let input = serde_json::json!({
            "todos": [{
                "content": "AB",
                "activeForm": "Testing"
            }]
        });

        let result = executor.execute("TodoWrite", &input);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("长度") || err.contains("2"));
    }

    #[test]
    fn test_handle_todo_write_empty_todos() {
        let store = create_test_store();
        let mut executor = TodoWriteExecutor::new(store);

        let input = serde_json::json!({
            "todos": []
        });

        let result = executor.execute("TodoWrite", &input);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("todos 数组不能为空"));
    }

    #[test]
    fn test_execute_unknown_tool() {
        let store = create_test_store();
        let mut executor = TodoWriteExecutor::new(store);

        let input = serde_json::json!({
            "todos": []
        });

        let result = executor.execute("UnknownTool", &input);
        assert!(matches!(result, Err(ToolError::NotFound { .. })));
    }

    #[test]
    fn test_allowed_tools() {
        let executor = create_test_executor();
        assert!(executor.is_available("TodoWrite"));
        assert!(!executor.is_available("OtherTool"));
    }

    #[test]
    fn test_format_task_list() {
        let executor = create_test_executor();
        let tasks = vec![
            TaskItem {
                content: "Task 1".to_string(),
                active_form: "Working".to_string(),
                status: TaskStatus::Pending,
            },
            TaskItem {
                content: "Task 2".to_string(),
                active_form: "Working".to_string(),
                status: TaskStatus::Completed,
            },
        ];

        let formatted = executor.format_task_list(&tasks);
        assert!(formatted.contains("[1]"));
        assert!(formatted.contains("Task 1"));
        assert!(formatted.contains("[2]"));
        assert!(formatted.contains("Task 2"));
    }

    #[test]
    fn test_full_workflow() {
        let store = create_test_store();
        let mut executor = TodoWriteExecutor::new(store.clone());

        let input = serde_json::json!({
            "todos": [
                {
                    "content": "Implement feature A",
                    "activeForm": "Implementing feature A"
                },
                {
                    "content": "Write tests",
                    "activeForm": "Writing tests"
                },
                {
                    "content": "Document code",
                    "activeForm": "Documenting code",
                    "status": "completed"
                }
            ]
        });

        let result = executor.execute("TodoWrite", &input);
        assert!(result.is_ok());

        // 验证任务已写入 store
        let tasks = store.get_tasks();
        assert_eq!(tasks.len(), 3);
        assert_eq!(tasks[0].content, "Implement feature A");
        assert_eq!(tasks[1].status, TaskStatus::Pending);
        assert_eq!(tasks[2].status, TaskStatus::Completed);
    }
}
