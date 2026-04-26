//! TodoWrite 工具执行器
//!
//! 实现 TodoWrite 工具的实际执行逻辑。

use serde_json::Value;
use std::collections::HashSet;

use super::super::{ToolError, ToolExecutor};
use crate::harness::task::{TaskItem, TaskStatus, TaskStore};

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

        Self { store, allowed_tools }
    }

    /// 处理 TodoWrite 工具调用
    fn handle_todo_write(&self, input: &Value) -> Result<String, ToolError> {
        // 解析 todos 参数
        let todos_array = input
            .get("todos")
            .and_then(|v| v.as_array())
            .ok_or_else(|| {
                ToolError::InvalidInput("Missing or invalid 'todos' parameter".to_string())
            })?;

        // 解析每个任务
        let mut tasks = Vec::new();
        for (index, todo_value) in todos_array.iter().enumerate() {
            let task = self.parse_todo_item(todo_value, index)?;
            tasks.push(task);
        }

        // 写入 TaskStore
        self.store.set_tasks(tasks).map_err(|e| {
            ToolError::Execution(format!("Failed to write tasks to store: {}", e))
        })?;

        // 返回成功消息
        let task_count = todos_array.len();
        Ok(format!(
            "Updated task list with {} task(s):\n{}",
            task_count,
            self.format_task_list(&self.store.get_tasks())
        ))
    }

    /// 解析单个任务项
    fn parse_todo_item(&self, value: &Value, index: usize) -> Result<TaskItem, ToolError> {
        let content = value
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                ToolError::InvalidInput(format!(
                    "Task at index {} missing 'content' field",
                    index
                ))
            })?
            .to_string();

        let active_form = value
            .get("activeForm")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                ToolError::InvalidInput(format!(
                    "Task at index {} missing 'activeForm' field",
                    index
                ))
            })?
            .to_string();

        // 解析状态，默认为 pending
        let status_str = value
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("pending");

        let status = match status_str {
            "pending" => TaskStatus::Pending,
            "in_progress" => TaskStatus::InProgress,
            "completed" => TaskStatus::Completed,
            _ => {
                return Err(ToolError::InvalidInput(format!(
                    "Task at index {} has invalid status: '{}'",
                    index, status_str
                )))
            }
        };

        Ok(TaskItem {
            content,
            active_form,
            status,
        })
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

// ============ 测试 ============

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
    fn test_parse_valid_todo_item() {
        let executor = create_test_executor();
        let value = serde_json::json!({
            "content": "Test task",
            "activeForm": "Testing task",
            "status": "pending"
        });

        let result = executor.parse_todo_item(&value, 0);
        assert!(result.is_ok());

        let task = result.unwrap();
        assert_eq!(task.content, "Test task");
        assert_eq!(task.active_form, "Testing task");
        assert_eq!(task.status, TaskStatus::Pending);
    }

    #[test]
    fn test_parse_todo_item_default_status() {
        let executor = create_test_executor();
        let value = serde_json::json!({
            "content": "Test task",
            "activeForm": "Testing task"
        });

        let result = executor.parse_todo_item(&value, 0);
        assert!(result.is_ok());

        let task = result.unwrap();
        assert_eq!(task.status, TaskStatus::Pending);
    }

    #[test]
    fn test_parse_todo_item_missing_content() {
        let executor = create_test_executor();
        let value = serde_json::json!({
            "activeForm": "Testing task",
            "status": "pending"
        });

        let result = executor.parse_todo_item(&value, 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_todo_item_missing_active_form() {
        let executor = create_test_executor();
        let value = serde_json::json!({
            "content": "Test task",
            "status": "pending"
        });

        let result = executor.parse_todo_item(&value, 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_todo_item_invalid_status() {
        let executor = create_test_executor();
        let value = serde_json::json!({
            "content": "Test task",
            "activeForm": "Testing task",
            "status": "invalid_status"
        });

        let result = executor.parse_todo_item(&value, 0);
        assert!(result.is_err());
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
    fn test_handle_todo_write_missing_todos() {
        let store = create_test_store();
        let mut executor = TodoWriteExecutor::new(store);

        let input = serde_json::json!({});

        let result = executor.execute("TodoWrite", &input);
        assert!(result.is_err());
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
