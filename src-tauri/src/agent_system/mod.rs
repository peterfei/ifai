// 🔥 P4: 移除 commercial 限制，让基础 agent 功能在社区版可用
pub mod base;
#[cfg(feature = "commercial")]
pub mod debugger;
#[cfg(feature = "commercial")]
pub mod persistence;
pub mod pivo_controller;
pub mod runner;
pub mod supervisor;
pub mod tools;

// 🆕 多智能体工作流系统
pub mod workflow;

// 🆕 智能体通信系统
pub mod communication;

pub use base::{AgentContext, AgentStatus};
pub use supervisor::Supervisor;
