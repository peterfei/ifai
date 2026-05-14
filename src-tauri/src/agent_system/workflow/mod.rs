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
/// 输出到控制台和 debug.log 文件
#[macro_export]
macro_rules! wf_log {
    ($($arg:tt)*) => {
        if $crate::agent_system::workflow::is_workflow_debug() {
            use std::io::Write;

            // 输出到控制台
            println!($($arg)*);

            // 输出到 debug.log 文件（追加模式）
            let log_line = format!($($arg)*);

            // 注意：这会忽略错误（如果文件不可写），避免影响主流程
            let _ = std::fs::OpenOptions::new()
                .write(true)
                .append(true)
                .create(true)
                .open("debug.log")
                .ok()
                .and_then(|mut file| file.write_all(log_line.as_bytes()).ok());
        }
    };
}

pub mod cancellation;
pub mod executor;
pub mod parallel;
pub mod parser;
pub mod prompt_loader;
pub mod runner;
pub mod scheduler;
pub mod tool_loop;
pub mod tools;
pub mod types;
pub mod validator;

#[cfg(test)]
pub mod integration_tests;

pub mod examples;

pub use executor::{
    AgentNodeExecutor, ConditionEvaluator, DataPassingManager, NodeExecutionContext, NodeExecutor,
};
pub use parser::{ParseError, WorkflowParser};
pub use runner::{
    CompletionStats,
    NodeResult,
    NodeStatus,
    PlannedNode,
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
