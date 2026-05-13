//! 宏工具适配器
//!
//! 将使用 #[derive(Tool)] 宏生成的工具适配到现有的 ToolExecutor trait。

use serde_json::Value;
use std::collections::HashSet;
use crate::harness::tool::{ToolError, ToolExecutor};

/// 宏生成工具的接口
///
/// 所有使用 `#[derive(Tool)]` 宏生成的工具都应该实现这个 trait
/// （虽然宏目前不自动生成，但可以手动实现）
pub trait ToolLike {
    /// 获取工具的 JSON schema（用于 LLM function calling）
    fn schema(&self) -> Value;

    /// 执行工具逻辑
    ///
    /// 参数:
    /// - `args`: LLM 传递的参数（JSON 对象）
    ///
    /// 返回: 工具执行结果（字符串格式）
    fn execute_tool(&self, args: &Value) -> Result<String, ToolError>;
}

/// 宏工具适配器
///
/// 将实现了 `ToolLike` trait 的工具适配为 `ToolExecutor`
pub struct MacroToolAdapter<T> {
    inner: T,
    tool_name: String,
    allowed: HashSet<String>,
}

impl<T> MacroToolAdapter<T>
where
    T: ToolLike + Send + Sync,
{
    /// 创建新的适配器
    pub fn new(tool: T, tool_name: String) -> Self {
        let mut allowed = HashSet::new();
        allowed.insert(tool_name.clone());

        Self {
            inner: tool,
            tool_name,
            allowed,
        }
    }
}

// 为 PingTool 实现 ToolLike trait
impl ToolLike for super::ping::PingTool {
    fn schema(&self) -> Value {
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "ping",
                "description": "Test network connectivity to a host",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "host": {
                            "type": "string",
                            "description": "The hostname or IP address to ping"
                        },
                        "port": {
                            "type": "integer",
                            "description": "The port number to connect to"
                        }
                    },
                    "required": ["host", "port"]
                }
            }
        })
    }

    fn execute_tool(&self, args: &Value) -> Result<String, ToolError> {
        let host = args.get("host")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'host' parameter".to_string()))?;

        let port = args.get("port")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| ToolError::InvalidInput("Missing or invalid 'port' parameter".to_string()))?
            as u16;

        // 执行 ping
        let result = self.execute_ping(host, port)
            .map_err(|e| ToolError::Execution(format!("Ping failed: {}", e)))?;

        Ok(result.to_string())
    }
}

// 为 ReadFileTool 实现 ToolLike trait
impl ToolLike for super::read_file::ReadFileTool {
    fn schema(&self) -> Value {
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read the contents of a file from disk",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the file to read"
                        }
                    },
                    "required": ["path"]
                }
            }
        })
    }

    fn execute_tool(&self, args: &Value) -> Result<String, ToolError> {
        let path = args.get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'path' parameter".to_string()))?;

        // 执行文件读取
        let result = self.execute_read_file(path)
            .map_err(|e| ToolError::Execution(e.to_string()))?;

        Ok(result.to_output_string())
    }
}

// 为 WriteFileTool 实现 ToolLike trait
impl ToolLike for super::write_file::WriteFileTool {
    fn schema(&self) -> Value {
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write content to a file, creating directories if needed",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the file to write"
                        },
                        "content": {
                            "type": "string",
                            "description": "The content to write to the file"
                        }
                    },
                    "required": ["path", "content"]
                }
            }
        })
    }

    fn execute_tool(&self, args: &Value) -> Result<String, ToolError> {
        let path = args.get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'path' parameter".to_string()))?;

        let content = args.get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'content' parameter".to_string()))?;

        // 执行文件写入
        let result = self.execute_write_file(path, content)
            .map_err(|e| ToolError::Execution(e.to_string()))?;

        Ok(result.to_output_string())
    }
}

// 为 EditFileTool 实现 ToolLike trait
impl ToolLike for super::edit_file::EditFileTool {
    fn schema(&self) -> Value {
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Edit a file by replacing old_text with new_text, with fuzzy matching",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the file to edit"
                        },
                        "old_text": {
                            "type": "string",
                            "description": "The text to replace"
                        },
                        "new_text": {
                            "type": "string",
                            "description": "The new text to replace with"
                        }
                    },
                    "required": ["path", "old_text", "new_text"]
                }
            }
        })
    }

    fn execute_tool(&self, args: &Value) -> Result<String, ToolError> {
        let path = args.get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'path' parameter".to_string()))?;

        let old_text = args.get("old_text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'old_text' parameter".to_string()))?;

        let new_text = args.get("new_text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput("Missing 'new_text' parameter".to_string()))?;

        // 执行文件编辑
        let result = self.execute_edit_file(path, old_text, new_text)
            .map_err(|e| ToolError::Execution(e.to_string()))?;

        Ok(result.to_output_string())
    }
}

impl<T> ToolExecutor for MacroToolAdapter<T>
where
    T: ToolLike + Send + Sync,
{
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        if name != self.tool_name {
            return Err(ToolError::NotFound { name: name.to_string() });
        }
        self.inner.execute_tool(input)
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed
    }
}

// 导出便捷类型
pub type PingToolAdapter = MacroToolAdapter<super::ping::PingTool>;
pub type ReadFileAdapter = MacroToolAdapter<super::read_file::ReadFileTool>;
pub type WriteFileAdapter = MacroToolAdapter<super::write_file::WriteFileTool>;
pub type EditFileAdapter = MacroToolAdapter<super::edit_file::EditFileTool>;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::tool::new_tools::ping::PingTool;

    #[test]
    fn test_adapter_creation() {
        let tool = PingTool::new(5000, 0);
        let adapter = MacroToolAdapter::new(tool, "ping".to_string());

        assert_eq!(adapter.tool_name, "ping");
        assert_eq!(adapter.allowed_tools().len(), 1);
        assert!(adapter.allowed_tools().contains("ping"));
    }

    #[test]
    fn test_adapter_execute() {
        let tool = PingTool::new(5000, 0);
        let mut adapter = MacroToolAdapter::new(tool, "ping".to_string());

        let args = serde_json::json!({
            "host": "example.com",
            "port": 80
        });

        let result = adapter.execute("ping", &args);
        assert!(result.is_ok());

        let output = result.unwrap();
        // 应该包含 "example.com"
        assert!(output.contains("example.com"));
    }

    #[test]
    fn test_adapter_wrong_tool_name() {
        let tool = PingTool::new(5000, 0);
        let mut adapter = MacroToolAdapter::new(tool, "ping".to_string());

        let args = serde_json::json!({
            "host": "example.com",
            "port": 80
        });

        // 尝试调用错误的工具名
        let result = adapter.execute("wrong_tool", &args);
        assert!(result.is_err());
    }
}
