//! 🔥 元编程 Token 显示层 - 零重复实现，100% 复用 GUI 端
//!
//! ## 架构原则
//!
//! **单一数据源**：provider_metadata 驱动所有功能
//!
//! **复用策略**：
//! - Token 计数：使用简化估算（避免类型转换）
//! - 定价查询：复用 `harness::api::provider_metadata`
//! - 压缩判断：复用 `conversation::should_summarize`
//! - 预警逻辑：复用 UI 端 `TokenUsageIndicator.tsx` 颜色分级
//! - 流式状态：复用 `StreamEvent` 和 Theme 系统
//!
//! ## 模块结构
//!
//! - `display.rs` - 格式化输出（进度条、成本、预警）
//! - `stream_status.rs` - 流式状态栏（实时刷新）

pub mod display;
pub mod stream_status;

pub use display::{
    calculate_cost,
    estimate_tokens, // 🔥 公开供 StreamStatus 使用
    format_compaction_warning,
    format_cost,
    format_session_stats,
    format_token_warning,
    get_model_max_tokens,
};

pub use stream_status::{
    format_number, // 🔥 公开供会话摘要使用
    BottomStatusBar,
    StatusBarState,
    StreamStatus,
    STATUS_REFRESH_INTERVAL,
};
