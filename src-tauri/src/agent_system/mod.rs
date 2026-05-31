// 🔥 P4: 移除 commercial 限制，让基础 agent 功能在社区版可用
pub mod base;
#[cfg(feature = "commercial")]
pub mod debugger;
#[cfg(feature = "commercial")]
pub mod persistence;

// 🆕 元编程模块（v0.5.2）
pub mod macros;

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

// 🆕 声明式注册所有 Agent（v0.5.2）
// 注意：宏通过 #[macro_export] 导出到 crate root，需要重新导入
use crate::global_agent_registry;

global_agent_registry! {
    agents: [
        Explore,
        Review,
        Refactor,
        Test,
        Doc,
        Debug,
        TaskBreakdown,  // plan_agent 映射到 TaskBreakdown
        ProposalGenerator,
        WebSearch,
        GitCommit,
        ReAct,
        GeneralPurpose,
    ],
    max_depth: 5,
}
