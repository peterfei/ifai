//! 多智能体工作流引擎
//!
//! 提供工作流的定义、验证和执行功能

pub mod types;
pub mod parser;
pub mod validator;
pub mod scheduler;

pub use types::{
    AgentConfig, AgentType, Workflow, WorkflowEdge, WorkflowNode, WorkflowValidationError,
};
pub use parser::{WorkflowParser, ParseError};
pub use validator::WorkflowValidator;
pub use scheduler::{WorkflowScheduler, Schedule, ScheduleError};

// TODO: 后续阶段添加
// pub mod runner;
