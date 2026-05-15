//! 工具执行器
//!
//! 定义工具执行接口和错误类型。

pub mod agentexecutors;
pub mod aliastools;
// pub mod filetools;  // 已删除，被宏工具替代
pub mod memorytools;
pub mod searchtools;
pub mod shelltools;
pub mod todoutil;

use serde_json::Value;
use std::collections::HashSet;

use super::spec::ToolPermissionMode;

// 重新导出执行器
pub use agentexecutors::{DebugAgentExecutor, DocAgentExecutor, ExploreAgentExecutor, GitCommitAgentExecutor, RefactorAgentExecutor, ReviewAgentExecutor, TestAgentExecutor, WebSearchAgentExecutor};
pub use aliastools::AliasExecutor;
// pub use filetools::FileToolsExecutor;  // 已删除，被宏工具替代
pub use memorytools::MemorySaveExecutor;
pub use searchtools::SearchToolsExecutor;
pub use shelltools::ShellToolsExecutor;
pub use todoutil::TodoWriteExecutor;

/// 工具执行错误
#[derive(Debug, thiserror::Error)]
pub enum ToolError {
    #[error("工具 '{name}' 不存在或未注册")]
    NotFound { name: String },

    #[error("工具 '{name}' 需要更高权限: 需要 {required:?}, 当前 {current:?}")]
    PermissionDenied {
        name: String,
        required: ToolPermissionMode,
        current: ToolPermissionMode,
    },

    #[error("工具输入验证失败: {0}")]
    InvalidInput(String),

    #[error("工具执行失败: {0}")]
    Execution(String),

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON 错误: {0}")]
    Json(#[from] serde_json::Error),

    #[error("WebSearch 错误: {0}")]
    WebSearch(String),
}

// 从 WebSearchError 转换
impl From<crate::harness::tool::new_tools::web_search::WebSearchError> for ToolError {
    fn from(err: crate::harness::tool::new_tools::web_search::WebSearchError) -> Self {
        ToolError::WebSearch(err.to_string())
    }
}

/// 工具执行器 trait
pub trait ToolExecutor: Send + Sync {
    /// 执行工具
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError>;

    /// 检查工具是否可用
    fn is_available(&self, name: &str) -> bool {
        // 默认实现：所有已注册工具都可用
        true
    }

    /// 获取允许的工具列表
    fn allowed_tools(&self) -> &HashSet<String>;

    /// 获取工具数量
    fn tool_count(&self) -> usize {
        self.allowed_tools().len()
    }
}

/// 子 Agent 工具执行器（带权限限制）
pub struct SubagentToolExecutor {
    allowed_tools: HashSet<String>,
}

impl SubagentToolExecutor {
    /// 创建受限的工具执行器
    pub fn new(allowed_tools: HashSet<String>) -> Self {
        Self { allowed_tools }
    }

    /// 从白名单创建
    pub fn from_whitelist(tools: Vec<&str>) -> Self {
        Self {
            allowed_tools: tools.into_iter().map(String::from).collect(),
        }
    }
}

impl ToolExecutor for SubagentToolExecutor {
    fn execute(&mut self, name: &str, input: &Value) -> Result<String, ToolError> {
        // 🔑 关键：运行时权限检查
        if !self.allowed_tools.contains(name) {
            return Err(ToolError::PermissionDenied {
                name: name.to_string(),
                required: ToolPermissionMode::DangerFullAccess,
                current: ToolPermissionMode::ReadOnly,
            });
        }

        // 权限通过，执行工具
        // TODO: 实际执行工具逻辑
        Ok(format!("Executed: {}", name))
    }

    fn is_available(&self, name: &str) -> bool {
        self.allowed_tools.contains(name)
    }

    fn allowed_tools(&self) -> &HashSet<String> {
        &self.allowed_tools
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_subagent_executor_restricted() {
        let allowed = ["read_file", "grep_search"]
            .iter()
            .map(|s| s.to_string())
            .collect();

        let mut executor = SubagentToolExecutor::new(allowed);

        // 允许的工具
        assert!(executor
            .execute("read_file", &serde_json::json!({}))
            .is_ok());

        // 不允许的工具
        assert!(matches!(
            executor.execute("write_file", &serde_json::json!({})),
            Err(ToolError::PermissionDenied { .. })
        ));
    }

    #[test]
    fn test_from_whitelist() {
        let executor = SubagentToolExecutor::from_whitelist(vec!["bash", "read_file"]);

        assert!(executor.is_available("bash"));
        assert!(executor.is_available("read_file"));
        assert!(!executor.is_available("write_file"));
    }
}
