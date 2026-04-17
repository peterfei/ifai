//! SmartScanner - 极简元编程扫描框架
//!
//! 核心理念: KISS (Keep It Simple, Stupid)
//! - 50 行宏代码替代 500 行手写逻辑
//! - 10 行声明替代复杂的状态管理
//! - 零成本抽象，编译时优化

mod cache;
mod config;
mod progress;
mod scanner_trait;
mod streaming;

pub use cache::*;
pub use config::*;
pub use progress::*;
pub use scanner_trait::*;
pub use streaming::*;

// 重新导出宏（将在宏 crate 中实现）
// pub use smart_scanner_macro::SmartScanner;
