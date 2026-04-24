//! Token 显示层 - 零重复实现
//!
//! CLI 只负责格式化输出，所有逻辑复用 GUI 端：
//! - Token 计数：复用 `conversation::token_counter`
//! - 定价查询：复用 `harness::api::provider_metadata`
//! - 压缩判断：复用 `conversation::should_summarize`
//! - 预警逻辑：复用 UI 端 `TokenUsageIndicator.tsx`

pub mod display;

pub use display::{
    format_token_warning,
    format_cost,
    format_session_stats,
    format_compaction_warning,
    get_model_max_tokens,
    calculate_cost,
};
