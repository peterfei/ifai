// 🔥 P4: 移除 commercial 限制，让基础 agent 功能在社区版可用
pub mod base;
pub mod supervisor;
pub mod runner;
pub mod tools;
pub mod pivo_controller;
#[cfg(feature = "commercial")]
pub mod debugger;
#[cfg(feature = "commercial")]
pub mod persistence;

// 🆕 多智能体工作流系统
pub mod workflow;

// 🆕 智能体通信系统
pub mod communication;

pub use base::{AgentStatus, AgentContext};
pub use supervisor::Supervisor;