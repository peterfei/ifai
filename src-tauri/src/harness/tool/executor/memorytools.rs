//! MemorySave 工具执行器
//!
//! 处理 AI 主动保存记忆的工具调用。

use serde_json::Value;
use std::collections::HashSet;

use super::super::{ToolError, ToolExecutor};

/// MemorySave 工具执行器
pub struct MemorySaveExecutor {
    allowed_tools: HashSet<String>,
}

impl MemorySaveExecutor {
    /// 创建新的 MemorySave 执行器
    pub fn new() -> Self {
        let mut allowed_tools = HashSet::new();
        allowed_tools.insert("MemorySave".to_string());

        Self { allowed_tools }
    }

    /// 处理 MemorySave 工具调用
    fn handle_memory_save(&self, input: &Value) -> Result<String, ToolError> {
        // 解析输入参数
        let path = input
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'path' parameter".to_string()))?;

        let content = input
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'content' parameter".to_string()))?;

        // 调用处理函数
        crate::memory::handle_memory_save(path, content)
            .map_err(|e| ToolError::Execution(e))
    }
}

impl ToolExecutor for MemorySaveExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        match name {
            "MemorySave" => self.handle_memory_save(input),
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

impl Default for MemorySaveExecutor {
    fn default() -> Self {
        Self::new()
    }
}

// ============ 单元测试 ============

#[cfg(test)]
mod tests {
    use super::*;

    fn create_executor() -> MemorySaveExecutor {
        MemorySaveExecutor::new()
    }

    #[test]
    fn test_executor_creation() {
        let executor = create_executor();
        assert_eq!(executor.allowed_tools().len(), 1);
        assert!(executor.is_available("MemorySave"));
        assert!(!executor.is_available("OtherTool"));
    }

    #[test]
    fn test_handle_memory_save_missing_path() {
        let mut executor = create_executor();
        let input = serde_json::json!({
            "content": "test content"
        });

        let result = executor.execute("MemorySave", &input);
        assert!(result.is_err());
        assert!(matches!(result, Err(ToolError::InvalidInput(_))));
    }

    #[test]
    fn test_handle_memory_save_missing_content() {
        let mut executor = create_executor();
        let input = serde_json::json!({
            "path": "Preferences/test"
        });

        let result = executor.execute("MemorySave", &input);
        assert!(result.is_err());
        assert!(matches!(result, Err(ToolError::InvalidInput(_))));
    }

    #[test]
    fn test_handle_memory_save_invalid_path() {
        let mut executor = create_executor();
        let input = serde_json::json!({
            "path": "InvalidPath",
            "content": "test content"
        });

        let result = executor.execute("MemorySave", &input);
        assert!(result.is_err());
    }

    #[test]
    fn test_handle_memory_save_success() {
        let temp_dir = std::env::temp_dir().join("ifai_test_executor");
        std::fs::create_dir_all(&temp_dir).ok();

        let original_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", temp_dir.to_str().unwrap());

        let mut executor = create_executor();
        let input = serde_json::json!({
            "path": "Preferences/test",
            "content": "测试记忆保存"
        });

        let result = executor.execute("MemorySave", &input);
        assert!(result.is_ok());
        assert!(result.unwrap().contains("测试记忆保存"));

        if let Some(home) = original_home {
            std::env::set_var("HOME", home);
        }
        std::fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn test_execute_unknown_tool() {
        let mut executor = create_executor();
        let input = serde_json::json!({});

        let result = executor.execute("UnknownTool", &input);
        assert!(matches!(result, Err(ToolError::NotFound { .. })));
    }
}
