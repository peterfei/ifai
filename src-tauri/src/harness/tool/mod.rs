//! 工具注册表系统
//!
//! 参考 claw-code 的设计，实现集中化的工具注册和权限管理。

pub mod executor;
pub mod global_config;  // 🔥 新增：全局配置共享
pub mod registry;
pub mod router;
pub mod spec;
pub mod new_tools;     // 🆕 使用 #[derive(Tool)] 宏的新工具

#[cfg(test)]
mod integration_tests;

pub use executor::{ToolError, ToolExecutor};
pub use global_config::{
    clear_global_progress_callback, clear_global_provider_config, get_global_provider_config,
    set_global_provider_config, try_get_progress_callback_wrapper,
    // 进度回调函数（Phase 1.5.3）
    set_global_progress_callback,
};
pub use registry::ToolRegistry;
pub use router::ToolRouter;
pub use spec::{ToolCategory, ToolPermissionMode, ToolSpec};
pub use new_tools::{PingTool, PingResult, PingError};  // 🆕 导出新工具

/// 工具执行结果
pub type ToolResult<T> = Result<T, ToolError>;
