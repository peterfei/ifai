//! 多智能体工作流引擎
//!
//! 提供工作流的定义、验证和执行功能

pub mod types;
pub mod parser;

pub use types::{
    AgentConfig, AgentType, Workflow, WorkflowEdge, WorkflowNode, WorkflowValidationError,
};
pub use parser::{WorkflowParser, ParseError};

// TODO: 后续阶段添加
// pub mod scheduler;
// pub mod runner;
// pub mod validator;
