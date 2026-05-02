//! 工具路由器
//!
//! 根据工具名称路由到对应的执行器。

use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use super::{
    executor::{
        AliasExecutor, FileToolsExecutor, SearchToolsExecutor, ShellToolsExecutor,
        TodoWriteExecutor, ToolExecutor,
    },
    ToolError,
};

/// 全局项目根目录（P4: 用于 agent_* 工具的相对路径解析）
static GLOBAL_PROJECT_ROOT: OnceLock<Option<String>> = OnceLock::new();

/// 设置全局项目根目录
pub fn set_global_project_root(root: String) {
    GLOBAL_PROJECT_ROOT.set(Some(root)).ok();
}

/// 获取全局项目根目录
pub fn get_global_project_root() -> Option<String> {
    GLOBAL_PROJECT_ROOT.get().cloned().flatten()
}

/// 工具路由器
pub struct ToolRouter {
    executors: Mutex<HashMap<String, Box<dyn ToolExecutor>>>,
}

impl ToolRouter {
    /// 创建新的工具路由器，注册所有内置工具
    pub fn new() -> Self {
        // 明确指定 HashMap 类型
        let mut executors: HashMap<String, Box<dyn ToolExecutor>> = HashMap::new();

        // 注册 TodoWrite 执行器
        let task_store = crate::harness::task::get_global_task_store();
        executors.insert(
            "TodoWrite".to_string(),
            Box::new(TodoWriteExecutor::new(task_store.clone())),
        );

        // 注册文件工具执行器（每个工具一个实例）
        executors.insert("read_file".to_string(), Box::new(FileToolsExecutor::new()));
        executors.insert("write_file".to_string(), Box::new(FileToolsExecutor::new()));
        executors.insert("edit_file".to_string(), Box::new(FileToolsExecutor::new()));

        // 注册搜索工具执行器（每个工具一个实例）
        executors.insert(
            "glob_search".to_string(),
            Box::new(SearchToolsExecutor::new()),
        );
        executors.insert(
            "grep_search".to_string(),
            Box::new(SearchToolsExecutor::new()),
        );

        // 注册 Shell 工具执行器（每个工具一个实例）
        executors.insert("bash".to_string(), Box::new(ShellToolsExecutor::new()));
        executors.insert(
            "PowerShell".to_string(),
            Box::new(ShellToolsExecutor::new()),
        );

        // 🆕 P4: 注册 agent_* 工具（使用 AliasExecutor）
        executors.insert(
            "agent_read_file".to_string(),
            Box::new(AliasExecutor::new()),
        );
        executors.insert(
            "agent_write_file".to_string(),
            Box::new(AliasExecutor::new()),
        );
        executors.insert("agent_list_dir".to_string(), Box::new(AliasExecutor::new()));
        executors.insert(
            "agent_scan_project".to_string(),
            Box::new(AliasExecutor::new()),
        );

        Self {
            executors: Mutex::new(executors),
        }
    }

    /// 设置项目根目录（用于 agent_* 工具）
    pub fn set_project_root(&self, root: String) {
        // 设置全局 project_root
        set_global_project_root(root);
    }

    /// 执行工具
    pub fn execute(&self, name: &str, input: &Value) -> Result<String, ToolError> {
        let mut executors = self.executors.lock().unwrap();
        let executor = executors.get_mut(name).ok_or_else(|| ToolError::NotFound {
            name: name.to_string(),
        })?;

        executor.execute(name, input)
    }

    /// 检查工具是否可用
    pub fn is_available(&self, name: &str) -> bool {
        let executors = self.executors.lock().unwrap();
        executors.contains_key(name)
    }

    /// 获取所有已注册的工具名称
    pub fn list_tools(&self) -> Vec<String> {
        let executors = self.executors.lock().unwrap();
        executors.keys().cloned().collect()
    }
}

impl Default for ToolRouter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_router_has_all_tools() {
        let router = ToolRouter::new();
        let tools = router.list_tools();

        // 应该包含所有内置工具
        assert!(tools.contains(&"TodoWrite".to_string()));
        assert!(tools.contains(&"read_file".to_string()));
        assert!(tools.contains(&"write_file".to_string()));
        assert!(tools.contains(&"edit_file".to_string()));
        assert!(tools.contains(&"glob_search".to_string()));
        assert!(tools.contains(&"grep_search".to_string()));
        assert!(tools.contains(&"bash".to_string()));
        assert!(tools.contains(&"PowerShell".to_string()));
    }

    #[test]
    fn test_router_execute_todo_write() {
        let router = ToolRouter::new();
        let input = serde_json::json!({
            "todos": [
                {
                    "content": "Test task",
                    "activeForm": "Testing",
                    "status": "pending"
                }
            ]
        });

        let result = router.execute("TodoWrite", &input);
        assert!(result.is_ok());
        assert!(result.unwrap().contains("Updated task list"));
    }

    #[test]
    fn test_router_execute_unknown_tool() {
        let router = ToolRouter::new();
        let input = serde_json::json!({});

        let result = router.execute("unknown_tool", &input);
        assert!(matches!(result, Err(ToolError::NotFound { .. })));
    }
}
