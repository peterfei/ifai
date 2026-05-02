//! 多智能体工作流引擎
//!
//! 提供工作流的定义、验证和执行功能

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
