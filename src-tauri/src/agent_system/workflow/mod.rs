//! 多智能体工作流引擎
//!
//! 提供工作流的定义、验证和执行功能

use std::sync::atomic::{AtomicBool, Ordering};

/// 全局工作流调试日志开关。
/// 默认关闭；设置环境变量 `WORKFLOW_DEBUG=1` 开启。
static WORKFLOW_DEBUG: AtomicBool = AtomicBool::new(false);

/// 初始化调试开关（读取环境变量，仅调用一次）
fn init_debug_flag() {
    let enabled = std::env::var("WORKFLOW_DEBUG").is_ok_and(|v| v == "1" || v == "true");
    WORKFLOW_DEBUG.store(enabled, Ordering::Relaxed);
}

/// 返回调试日志是否启用
#[inline]
pub fn is_workflow_debug() -> bool {
    if !WORKFLOW_DEBUG.load(Ordering::Relaxed) {
        init_debug_flag();
    }
    WORKFLOW_DEBUG.load(Ordering::Relaxed)
}

/// 工作流调试日志宏（受 WORKFLOW_DEBUG 控制）
#[macro_export]
macro_rules! wf_log {
    ($($arg:tt)*) => {
        if $crate::agent_system::workflow::is_workflow_debug() {
            println!($($arg)*);
        }
    };
}

pub mod executor;
pub mod parser;
pub mod prompt_loader; // 🔥 添加提示词加载器模块
pub mod runner;
pub mod scheduler;
pub mod tool_loop;
pub mod tools; // 🔥 添加工具模块
pub mod types;
pub mod validator; // 🔥 添加工具调用循环模块

#[cfg(test)]
pub mod integration_tests;

pub mod examples;

pub use executor::{
    AgentNodeExecutor, ConditionEvaluator, DataPassingManager, NodeExecutionContext, NodeExecutor,
};
pub use parser::{ParseError, WorkflowParser};
pub use runner::{
    NodeResult,
    NodeStatus,
    ProgressEvent, // 🔥 导出 ProgressEvent
    RunnerConfig,
    WorkflowResult,
    WorkflowRunner,
    WorkflowStatus,
};
pub use scheduler::{Schedule, ScheduleError, WorkflowScheduler};
pub use tool_loop::{execute_with_tools, ToolLoopConfig};
pub use tools::{create_tool_definitions, DefaultToolExecutor, ToolCall, ToolExecutor, ToolResult};
pub use types::{
    AgentConfig, AgentType, Workflow, WorkflowEdge, WorkflowNode, WorkflowValidationError,
};
pub use validator::WorkflowValidator;
