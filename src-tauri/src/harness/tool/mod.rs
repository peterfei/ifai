//! 工具注册表系统
//!
//! 参考 claw-code 的设计，实现集中化的工具注册和权限管理。

pub mod registry;
pub mod spec;
pub mod executor;
pub mod router;

#[cfg(test)]
mod integration_tests;

pub use registry::ToolRegistry;
pub use spec::{ToolSpec, ToolPermissionMode};
pub use executor::{ToolExecutor, ToolError};
pub use router::ToolRouter;

/// 工具执行结果
pub type ToolResult<T> = Result<T, ToolError>;
