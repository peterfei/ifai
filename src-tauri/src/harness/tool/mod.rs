//! 工具注册表系统
//!
//! 参考 claw-code 的设计，实现集中化的工具注册和权限管理。

pub mod executor;
pub mod registry;
pub mod router;
pub mod spec;

#[cfg(test)]
mod integration_tests;

pub use executor::{ToolError, ToolExecutor};
pub use registry::ToolRegistry;
pub use router::ToolRouter;
pub use spec::{ToolCategory, ToolPermissionMode, ToolSpec};

/// 工具执行结果
pub type ToolResult<T> = Result<T, ToolError>;
