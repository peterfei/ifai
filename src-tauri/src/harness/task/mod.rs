//! 任务管理模块
//!
//! 提供任务存储、TodoWrite 工具执行等功能。

pub mod store;

pub use store::{TaskItem, TaskStore, TaskStatus};

use std::sync::OnceLock;

/// 全局 TaskStore (P2)
static GLOBAL_TASK_STORE: OnceLock<TaskStore> = OnceLock::new();

pub fn get_global_task_store() -> &'static TaskStore {
    GLOBAL_TASK_STORE.get_or_init(|| TaskStore::new())
}
