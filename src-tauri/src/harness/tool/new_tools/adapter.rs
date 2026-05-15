//! 宏工具适配器
//!
//! 将使用 #[derive(Tool)] 宏生成的工具适配到现有的 ToolExecutor trait。

use serde_json::Value;
use std::collections::HashSet;
use crate::harness::tool::{ToolError, ToolExecutor};

/// 宏生成工具的接口
///
/// 使用 `#[derive(Tool)]` 宏并声明 `params(...)` 的工具会自动实现这个 trait
/// ✨ Phase C: 现在由宏自动生成，无需手动实现
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
pub type WebSearchAdapter = MacroToolAdapter<super::web_search::WebSearchTool>;
pub type GitDiffAdapter = MacroToolAdapter<super::git_diff::GitDiffTool>;
pub type GitStatusAdapter = MacroToolAdapter<super::git_status::GitStatusTool>;
pub type GitSnapshotAdapter = MacroToolAdapter<super::git_snapshot::GitSnapshotTool>;
pub type GitCommitAdapter = MacroToolAdapter<super::git_commit::GitCommitTool>;
pub type SecretScannerAdapter = MacroToolAdapter<super::secret_scanner::SecretScannerTool>;
pub type ComplexityAnalyzerAdapter = MacroToolAdapter<super::complexity_analyzer::ComplexityAnalyzer>;

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
