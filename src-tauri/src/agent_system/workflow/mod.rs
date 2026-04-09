//! 多智能体工作流引擎
//!
//! 提供工作流的定义、验证和执行功能

pub mod types;
pub mod parser;
pub mod validator;
pub mod scheduler;
pub mod runner;
pub mod executor;
pub mod tools;  // 🔥 添加工具模块
pub mod tool_loop;  // 🔥 添加工具调用循环模块

#[cfg(test)]
pub mod integration_tests;

pub mod examples;

pub use types::{
    AgentConfig, AgentType, Workflow, WorkflowEdge, WorkflowNode, WorkflowValidationError,
};
pub use parser::{WorkflowParser, ParseError};
pub use validator::WorkflowValidator;
pub use scheduler::{WorkflowScheduler, Schedule, ScheduleError};
pub use runner::{
    WorkflowRunner, RunnerConfig, WorkflowResult, NodeResult,
    NodeStatus, WorkflowStatus, ProgressEvent,  // 🔥 导出 ProgressEvent
};
pub use executor::{
    NodeExecutor, AgentNodeExecutor, NodeExecutionContext,
    ConditionEvaluator, DataPassingManager,
};
pub use tools::{ToolExecutor, DefaultToolExecutor, ToolCall, ToolResult, create_tool_definitions};
pub use tool_loop::{execute_with_tools, ToolLoopConfig};
