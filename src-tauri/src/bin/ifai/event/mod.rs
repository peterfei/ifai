//! TUI 事件系统 — 元编程级声明式事件处理框架
//!
//! ## 架构概述
//!
//! ```text
//! Event (crossterm::event::Event)
//!     ↓
//! EventRouter (查表派发)
//!     ↓
//! EventHandler (trait 对象)
//!     ↓
//! ControlFlow (类型安全的控制流)
//! ```
//!
//! ## 使用示例
//!
//! ```rust
//! use crate::event::{EventHandler, EventRouter, ControlFlow};
//!
//! // 1. 定义处理器
//! struct MyHandler;
//! impl EventHandler<KeyEvent> for MyHandler {
//!     fn handle(&mut self, event: &KeyEvent, app: &mut App) -> ControlFlow {
//!         // 处理逻辑
//!     }
//! }
//!
//! // 2. 构建路由器
//! let router = EventRouter::new()
//!     .on(|e| matches!(e, Event::Key(_)), MyHandler);
//!
//! // 3. 派发事件
//! router.dispatch(&event, &mut app);
//! ```

pub mod handler;
pub mod handlers;
pub mod router;

// 重新导出核心类型
pub use handler::{ControlFlow, EventHandler, EventRoute};
pub use handlers::{
    CombinedKeyHandler, DiffEnterHandler, DiffModeHandler, HelpEnterHandler, HelpExitHandler,
    IgnoreHandler, InputSubmitHandler, KeyScrollHandler, MouseScrollHandler, ResizeHandler,
    SearchEnterHandler, SearchInputHandler,
};
pub use router::EventRouter;
