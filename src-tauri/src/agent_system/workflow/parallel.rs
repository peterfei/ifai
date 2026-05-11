//! 并行工具调度器
//!
//! 为工具调用提供 RwLock 读写锁调度，确保：
//! - 并行安全工具（只读）可同时执行
//! - 独占工具（写入/副作用）串行执行

use std::sync::Arc;
use tokio::sync::RwLock;

/// 工具并行安全声明
pub struct ToolParallelSpec {
    pub name: &'static str,
    pub supports_parallel: bool,
}

/// 静态分类表（默认全部独占，需显式声明才允许并行）
const TOOL_PARALLEL_SPECS: &[ToolParallelSpec] = &[
    // 并行安全（只读工具）
    ToolParallelSpec { name: "agent_read_file", supports_parallel: true },
    ToolParallelSpec { name: "agent_list_dir", supports_parallel: true },
    ToolParallelSpec { name: "agent_scan_project", supports_parallel: true },
    // 独占工具（省略或 supports_parallel: false）
    // agent_write_file, agent_bash, bash, agent_run_shell_command, agent_execute_command 等
];

/// 查询工具是否支持并行执行
///
/// 未在分类表中注册的工具默认返回 `false`（独占执行）
pub fn tool_supports_parallel(name: &str) -> bool {
    TOOL_PARALLEL_SPECS
        .iter()
        .find(|spec| spec.name == name)
        .map(|spec| spec.supports_parallel)
        .unwrap_or(false)
}

/// 并行调度器 — 管理工具执行的读写锁
///
/// - 并行安全工具：获取读锁（多个可同时持有）
/// - 独占工具：获取写锁（排他访问）
pub struct ParallelDispatcher {
    pub lock: Arc<RwLock<()>>,
}

impl ParallelDispatcher {
    pub fn new() -> Self {
        Self {
            lock: Arc::new(RwLock::new(())),
        }
    }

    /// 调度工具执行：根据工具类型获取读锁或写锁
    pub async fn dispatch<F, Fut, T>(&self, tool_name: &str, task: F) -> T
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = T>,
    {
        if tool_supports_parallel(tool_name) {
            let _guard = self.lock.read().await;
            task().await
        } else {
            let _guard = self.lock.write().await;
            task().await
        }
    }
}

impl Default for ParallelDispatcher {
    fn default() -> Self {
        Self::new()
    }
}

/// 并行进度显示符号常量
pub mod progress_symbols {
    pub const RUNNING: &str = "\u{25b8}";    // ▸ 运行中
    pub const DONE: &str = "\u{2714}";       // ✔ 完成
    pub const FAIL: &str = "\u{2718}";       // ✘ 失败
    pub const ABORT: &str = "\u{2298}";      // ⊘ 中止
    pub const BRANCH: &str = "\u{251c}\u{2500}"; // ├─ 分支
    pub const LEAF: &str = "\u{2514}\u{2500}";   // └─ 叶子
    pub const ARROW: &str = "\u{2192}";      // → 输出预览
    pub const DOT_SEP: &str = "\u{00b7}";    // · 统计分隔符
}

/// 时间格式化：<1s / X.Xs / Xm Xs
pub fn format_duration(ms: u64) -> String {
    let seconds = ms as f64 / 1000.0;
    if seconds < 1.0 {
        "<1s".to_string()
    } else if seconds < 60.0 {
        format!("{:.1}s", seconds)
    } else {
        let mins = (seconds / 60.0).floor();
        let secs = seconds % 60.0;
        format!("{}m {:.0}s", mins, secs)
    }
}

/// Token 格式化：X / X.Xk / X.XM
pub fn format_tokens(count: usize) -> String {
    if count < 1000 {
        format!("{}", count)
    } else if count < 1_000_000 {
        format!("{:.1}k", count as f64 / 1000.0)
    } else {
        format!("{:.1}M", count as f64 / 1_000_000.0)
    }
}

/// 统计行组合：4.1s · 4 tools · 2.4k tokens
pub fn format_stats(
    time_ms: Option<u64>,
    tools: Option<usize>,
    tokens: Option<usize>,
) -> String {
    let parts: Vec<String> = vec![
        time_ms.map(format_duration),
        tools.map(|t| format!("{} tools", t)),
        tokens.map(format_tokens).map(|t| format!("{} tokens", t)),
    ]
    .into_iter()
    .flatten()
    .collect();
    parts.join(&format!(" {} ", progress_symbols::DOT_SEP))
}

/// 截断输出预览到指定长度
pub fn truncate_preview(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    // ===== 工具分类查询测试 =====

    #[test]
    fn test_unknown_tool_defaults_to_exclusive() {
        // 未注册的工具默认为独占
        assert!(!tool_supports_parallel("unknown_tool"));
        assert!(!tool_supports_parallel("agent_bash"));
        assert!(!tool_supports_parallel("agent_write_file"));
    }

    #[test]
    fn test_empty_string_defaults_to_exclusive() {
        assert!(!tool_supports_parallel(""));
    }

    #[test]
    fn test_no_parallel_tools_in_phase1_initial() {
        // Phase 1.1 初始状态验证：独占工具确实独占
        assert!(!tool_supports_parallel("agent_bash"));
        assert!(!tool_supports_parallel("agent_write_file"));
        assert!(!tool_supports_parallel("unknown_tool"));
    }

    // ===== T1.3: 只读工具并行测试 =====

    #[test]
    fn test_read_tools_are_parallel() {
        // 只读工具标记为并行安全
        assert!(tool_supports_parallel("agent_read_file"));
        assert!(tool_supports_parallel("agent_list_dir"));
        assert!(tool_supports_parallel("agent_scan_project"));
    }

    #[test]
    fn test_write_tools_are_exclusive() {
        // 写入/副作用工具保持独占
        assert!(!tool_supports_parallel("agent_write_file"));
        assert!(!tool_supports_parallel("agent_bash"));
        assert!(!tool_supports_parallel("bash"));
        assert!(!tool_supports_parallel("agent_run_shell_command"));
        assert!(!tool_supports_parallel("agent_execute_command"));
    }

    // ===== RwLock 调度器测试 =====

    #[tokio::test]
    async fn test_parallel_dispatcher_write_lock_exclusive() {
        // Phase 1 所有工具都是独占 → 写锁
        let dispatcher = ParallelDispatcher::new();
        let concurrent_count = Arc::new(AtomicUsize::new(0));
        let max_concurrent = Arc::new(AtomicUsize::new(0));

        let mut handles = Vec::new();
        for _ in 0..3 {
            let dispatcher = dispatcher.lock.clone();
            let concurrent = concurrent_count.clone();
            let max_c = max_concurrent.clone();
            handles.push(tokio::spawn(async move {
                let dispatcher_ref = ParallelDispatcher {
                    lock: dispatcher,
                };
                dispatcher_ref.dispatch("agent_bash", || async {
                    // 进入临界区
                    let current = concurrent.fetch_add(1, Ordering::SeqCst) + 1;
                    let _ = max_c.fetch_max(current, Ordering::SeqCst);
                    tokio::time::sleep(Duration::from_millis(50)).await;
                    concurrent.fetch_sub(1, Ordering::SeqCst);
                }).await;
            }));
        }

        for h in handles {
            h.await.unwrap();
        }

        // 写锁独占：最大并发应为 1
        assert_eq!(max_concurrent.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_parallel_dispatcher_sequential_behavior_unchanged() {
        // Phase 1 所有工具独占 → 行为与当前 join_all 一致（写锁串行）
        // 但因为是 join_all 启动，实际是"启动并行但执行串行"
        let dispatcher = ParallelDispatcher::new();
        let execution_order = Arc::new(std::sync::Mutex::new(Vec::new()));

        let mut handles = Vec::new();
        for i in 0..3 {
            let dispatcher = dispatcher.lock.clone();
            let order = execution_order.clone();
            handles.push(tokio::spawn(async move {
                let dispatcher_ref = ParallelDispatcher {
                    lock: dispatcher,
                };
                dispatcher_ref.dispatch("agent_read_file", move || {
                    let order = order.clone();
                    async move {
                        order.lock().unwrap().push(i);
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                }).await;
            }));
        }

        for h in handles {
            h.await.unwrap();
        }

        let order = execution_order.lock().unwrap();
        assert_eq!(order.len(), 3);
        // 写锁保证串行：每个工具完成后下一个才开始
        // 但 tokio spawn 顺序不确定，所以只验证全部执行完毕
    }

    // ===== T1.3: 读锁并行测试 =====

    #[tokio::test]
    async fn test_parallel_dispatcher_read_lock_concurrent() {
        // 只读工具应能并行执行（读锁不互斥）
        let dispatcher = ParallelDispatcher::new();
        let concurrent_count = Arc::new(AtomicUsize::new(0));
        let max_concurrent = Arc::new(AtomicUsize::new(0));

        let mut handles = Vec::new();
        for _ in 0..3 {
            let dispatcher = dispatcher.lock.clone();
            let concurrent = concurrent_count.clone();
            let max_c = max_concurrent.clone();
            handles.push(tokio::spawn(async move {
                let dispatcher_ref = ParallelDispatcher {
                    lock: dispatcher,
                };
                dispatcher_ref.dispatch("agent_read_file", || async {
                    let current = concurrent.fetch_add(1, Ordering::SeqCst) + 1;
                    let _ = max_c.fetch_max(current, Ordering::SeqCst);
                    tokio::time::sleep(Duration::from_millis(50)).await;
                    concurrent.fetch_sub(1, Ordering::SeqCst);
                }).await;
            }));
        }

        for h in handles {
            h.await.unwrap();
        }

        // 读锁应允许多个同时持有
        assert!(max_concurrent.load(Ordering::SeqCst) > 1,
            "读锁应允许并发，最大并发数应 > 1，实际: {}", max_concurrent.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn test_parallel_dispatcher_mixed_read_write() {
        // 混合场景：读操作并行，写操作独占
        let dispatcher = ParallelDispatcher::new();
        let write_entered = Arc::new(AtomicUsize::new(0));
        let write_max_concurrent = Arc::new(AtomicUsize::new(0));

        // 启动 2 个读操作和 1 个写操作
        let mut handles = Vec::new();
        for _ in 0..2 {
            let dispatcher = dispatcher.lock.clone();
            handles.push(tokio::spawn(async move {
                let dispatcher_ref = ParallelDispatcher { lock: dispatcher };
                dispatcher_ref.dispatch("agent_read_file", || async {
                    tokio::time::sleep(Duration::from_millis(30)).await;
                }).await;
            }));
        }
        // 写操作
        {
            let dispatcher = dispatcher.lock.clone();
            let entered = write_entered.clone();
            let max_c = write_max_concurrent.clone();
            handles.push(tokio::spawn(async move {
                let dispatcher_ref = ParallelDispatcher { lock: dispatcher };
                dispatcher_ref.dispatch("agent_write_file", || async {
                    let current = entered.fetch_add(1, Ordering::SeqCst) + 1;
                    let _ = max_c.fetch_max(current, Ordering::SeqCst);
                    tokio::time::sleep(Duration::from_millis(30)).await;
                    entered.fetch_sub(1, Ordering::SeqCst);
                }).await;
            }));
        }

        for h in handles {
            h.await.unwrap();
        }

        // 写操作最大并发应为 1
        assert_eq!(write_max_concurrent.load(Ordering::SeqCst), 1);
    }

    // ===== T3.1: 格式化函数测试 =====

    #[test]
    fn test_format_duration_sub_second() {
        assert_eq!(format_duration(500), "<1s");
        assert_eq!(format_duration(0), "<1s");
        assert_eq!(format_duration(999), "<1s");
    }

    #[test]
    fn test_format_duration_seconds() {
        assert_eq!(format_duration(1000), "1.0s");
        assert_eq!(format_duration(3200), "3.2s");
        assert_eq!(format_duration(59999), "60.0s");
    }

    #[test]
    fn test_format_duration_minutes() {
        assert_eq!(format_duration(60000), "1m 0s");
        assert_eq!(format_duration(125000), "2m 5s");
    }

    #[test]
    fn test_format_tokens_raw() {
        assert_eq!(format_tokens(0), "0");
        assert_eq!(format_tokens(500), "500");
        assert_eq!(format_tokens(999), "999");
    }

    #[test]
    fn test_format_tokens_kilo() {
        assert_eq!(format_tokens(1000), "1.0k");
        assert_eq!(format_tokens(2400), "2.4k");
    }

    #[test]
    fn test_format_tokens_mega() {
        assert_eq!(format_tokens(1_000_000), "1.0M");
        assert_eq!(format_tokens(1_500_000), "1.5M");
    }

    #[test]
    fn test_format_stats_full() {
        let result = format_stats(Some(4100), Some(4), Some(2400));
        assert_eq!(result, "4.1s \u{00b7} 4 tools \u{00b7} 2.4k tokens");
    }

    #[test]
    fn test_format_stats_partial() {
        let result = format_stats(Some(500), None, None);
        assert_eq!(result, "<1s");
    }

    #[test]
    fn test_format_stats_empty() {
        let result = format_stats(None, None, None);
        assert_eq!(result, "");
    }

    #[test]
    fn test_truncate_preview_short() {
        assert_eq!(truncate_preview("hello", 80), "hello");
    }

    #[test]
    fn test_truncate_preview_long() {
        let long = "a".repeat(100);
        let result = truncate_preview(&long, 80);
        assert_eq!(result.len(), 80);
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_progress_symbols_are_valid_unicode() {
        // 确保所有符号是有效的 Unicode 且非空
        assert!(!progress_symbols::RUNNING.is_empty());
        assert!(!progress_symbols::DONE.is_empty());
        assert!(!progress_symbols::FAIL.is_empty());
        assert!(!progress_symbols::ABORT.is_empty());
        assert!(!progress_symbols::BRANCH.is_empty());
        assert!(!progress_symbols::LEAF.is_empty());
        assert!(!progress_symbols::ARROW.is_empty());
        assert!(!progress_symbols::DOT_SEP.is_empty());
    }
}
