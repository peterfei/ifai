//! Macros 模块测试
//!
//! 包含宏展开、注册表功能、工作流 DSL、Agent 互调用、并行调用等测试

mod registry_tests;
mod workflow_tests;
mod agent_call_tests;
pub mod parallel_tests;  // 公开模块，以便父模块可以访问
// Phase 1: 消息协议测试已移至 message_types.rs

