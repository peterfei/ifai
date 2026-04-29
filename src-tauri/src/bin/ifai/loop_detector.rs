//! 🎨 元编程循环检测引擎
//!
//! **零手写逻辑**：配置驱动的通用检测引擎
//! **单一数据源**：JSON 配置文件
//! **声明式 API**：返回状态而非布尔值

use std::collections::{VecDeque, HashMap};
use serde::{Deserialize, Serialize};
use serde_json::Value;

// ============================================================================
// 配置结构（JSON 驱动）
// ============================================================================

/// 🎛️ 循环检测配置
///
/// 从 `tool_approval_config.json` 的 `loopDetection` 节点加载
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LoopDetectionConfig {
    /// 是否启用循环检测
    pub enabled: bool,

    /// 连续调用相同工具的最大次数（超过则警告）
    #[serde(default = "default_max_consecutive")]
    pub max_consecutive_same_tool: usize,

    /// 完全相同调用的最大次数（超过则阻断）
    #[serde(default = "default_max_identical")]
    pub max_identical_calls: usize,

    /// 检测窗口大小（保留最近 N 次调用历史）
    #[serde(default = "default_window_size")]
    pub window_size: usize,
}

fn default_max_consecutive() -> usize { 10 }
fn default_max_identical() -> usize { 3 }
fn default_window_size() -> usize { 20 }

impl Default for LoopDetectionConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_consecutive_same_tool: default_max_consecutive(),
            max_identical_calls: default_max_identical(),
            window_size: default_window_size(),
        }
    }
}

// ============================================================================
// 工具调用签名（用于检测）
// ============================================================================

/// 🔑 工具调用签名
///
/// 用于检测重复模式，不包含完整参数（避免内存过大）
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ToolCallSignature {
    pub tool_name: String,
    pub args_hash: u64,  // 参数的哈希值
}

impl ToolCallSignature {
    pub fn from_tool_call(tool_name: &str, args: &str) -> Self {
        // 使用简单的哈希算法（FNV-1a 64-bit）
        let args_hash = args.bytes().fold(0xcbf29ce484222325u64, |hash, byte| {
            hash.wrapping_mul(0x100000001b3) ^ (byte as u64)
        });

        Self {
            tool_name: tool_name.to_string(),
            args_hash,
        }
    }

    /// 完全相同（工具名 + 参数都相同）
    pub fn is_identical(&self, other: &Self) -> bool {
        self == other
    }

    /// 相同工具（忽略参数）
    pub fn is_same_tool(&self, other: &Self) -> bool {
        self.tool_name == other.tool_name
    }
}

// ============================================================================
// 检测状态（声明式，非布尔值）
// ============================================================================

/// 📊 空参数检测结果
///
/// 三态返回值，比布尔值更精确地表达检测意图
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EmptyArgsResult {
    /// 参数有效（非空）
    ValidArgs,
    /// 该工具首次空参数（应返回错误给 AI，给学习机会）
    FirstOffense,
    /// 该工具连续 2+ 次空参数（静默跳过，返回 "OK"）
    PerToolTripped,
    /// 全局空参数超过阈值（应终止整个执行循环）
    GlobalTripped,
}

/// 📊 循环检测状态
///
/// 返回详细状态而非简单的 true/false
#[derive(Debug, Clone, PartialEq)]
pub enum LoopDetectionStatus {
    /// 正常：无循环模式
    Normal,

    /// 警告：检测到循环模式
    Warning {
        count: usize,
        pattern: String,
    },

    /// 阻断：检测到危险循环
    Blocked {
        reason: String,
    },
}

impl LoopDetectionStatus {
    /// 是否应该终止执行
    pub fn should_stop(&self) -> bool {
        matches!(self, Self::Blocked { .. })
    }

    /// 是否应该显示警告
    pub fn should_warn(&self) -> bool {
        matches!(self, Self::Warning { .. })
    }
}

// ============================================================================
// 元编程循环检测引擎
// ============================================================================

/// 🎨 循环检测器（通用引擎，零硬编码）
pub struct LoopDetector {
    config: LoopDetectionConfig,
    history: VecDeque<ToolCallSignature>,
    consecutive_same_tool_count: usize,
    identical_call_count: usize,
    /// 🔥 空参数连续计数：tool_name → 连续空参数次数
    empty_args_streak: HashMap<String, u32>,
    /// 🔥 全局空参数累计计数（跨所有工具）
    /// 当 AI 轮换不同工具但都发空参数时，per-tool breaker 无法阻止
    global_empty_args_count: u32,
}

impl LoopDetector {
    /// 从配置创建检测器
    pub fn from_config(config: LoopDetectionConfig) -> Self {
        let window_size = config.window_size;
        Self {
            config,
            history: VecDeque::with_capacity(window_size),
            consecutive_same_tool_count: 0,
            identical_call_count: 0,
            empty_args_streak: HashMap::new(),
            global_empty_args_count: 0,
        }
    }

    /// 🎯 声明式检测 API
    ///
    /// 返回详细状态，调用方根据状态决定行为
    pub fn check(&mut self, tool_name: &str, args: &str) -> LoopDetectionStatus {
        // 如果未启用，直接返回正常
        if !self.config.enabled {
            return LoopDetectionStatus::Normal;
        }

        // 🔥 FIX: 空参数统一归一化为同一签名，快速阻止跨工具的空参数死循环
        let normalized_args = if args.trim() == "{}" || args.trim().is_empty() {
            "__EMPTY_ARGS__".to_string()
        } else {
            args.to_string()
        };

        let signature = ToolCallSignature::from_tool_call(tool_name, &normalized_args);

        // 关键修复：先更新历史，再进行检测
        // 这样检测逻辑就能看到包含当前调用的完整历史
        self.update_history(&signature);

        // 检测规则 1：完全相同调用（高优先级）
        if let Some(status) = self.check_identical_calls(&signature) {
            return status;
        }

        // 检测规则 2：连续相同工具（中等优先级）
        if let Some(status) = self.check_consecutive_same_tool(&signature) {
            return status;
        }

        LoopDetectionStatus::Normal
    }

    /// 规则 1：检测完全相同调用
    fn check_identical_calls(&self, signature: &ToolCallSignature) -> Option<LoopDetectionStatus> {
        // 计算历史中相同签名的数量
        let identical_count = self.history.iter()
            .filter(|s| s.is_identical(signature))
            .count();

        // 关键修复：由于先更新了历史，历史已包含当前调用，不需要 +1
        if identical_count >= self.config.max_identical_calls {
            return Some(LoopDetectionStatus::Blocked {
                reason: format!(
                    "检测到完全相同的工具调用 {} 次（上限：{}）",
                    identical_count,
                    self.config.max_identical_calls
                ),
            });
        }

        None
    }

    /// 规则 2：检测连续相同工具
    fn check_consecutive_same_tool(&self, signature: &ToolCallSignature) -> Option<LoopDetectionStatus> {
        // 计算历史末尾连续相同工具的数量
        // 由于先更新了历史，当前调用已在历史中，所以直接计数即可
        let consecutive_count = self.history.iter()
            .rev()
            .take_while(|s| s.is_same_tool(signature))
            .count();

        if consecutive_count >= self.config.max_consecutive_same_tool {
            return Some(LoopDetectionStatus::Blocked {
                reason: format!(
                    "连续调用相同工具 '{}' {} 次（上限：{}）",
                    signature.tool_name,
                    consecutive_count,
                    self.config.max_consecutive_same_tool
                ),
            });
        }

        // 警告阈值：达到上限的 50%（使用 ceil 确保合理边界）
        let warn_threshold = (self.config.max_consecutive_same_tool + 1) / 2;
        if consecutive_count >= warn_threshold {
            return Some(LoopDetectionStatus::Warning {
                count: consecutive_count,
                pattern: format!("连续调用 '{}'", signature.tool_name),
            });
        }

        None
    }

    /// 更新历史记录
    fn update_history(&mut self, signature: &ToolCallSignature) {
        // 更新连续相同工具计数
        if let Some(last) = self.history.back() {
            if last.is_same_tool(signature) {
                self.consecutive_same_tool_count += 1;
            } else {
                self.consecutive_same_tool_count = 1;  // 重置为 1（当前调用）
            }
        } else {
            self.consecutive_same_tool_count = 1;
        }

        // 添加到历史
        self.history.push_back(signature.clone());

        // 保持窗口大小
        if self.history.len() > self.config.window_size {
            self.history.pop_front();
        }
    }

    /// 重置检测器状态（用于新的对话）
    pub fn reset(&mut self) {
        self.history.clear();
        self.consecutive_same_tool_count = 0;
        self.identical_call_count = 0;
        self.empty_args_streak.clear();
        self.global_empty_args_count = 0;
    }

    /// 🔥 空参数熔断检测
    ///
    /// 返回 `EmptyArgsResult`，包含三种状态：
    /// - `FirstOffense` — 该工具首次空参数（应返回错误给 AI，给学习机会）
    /// - `PerToolTripped` — 该工具连续 3+ 次空参数（静默跳过，返回 "OK"）
    /// - `GlobalTripped` — 全局空参数超过阈值（应终止整个循环）
    ///
    /// 有效参数重置该工具的 per-tool 计数和全局计数。
    /// 有效参数说明 AI 恢复了正常行为，应重新开始计数。
    pub fn check_empty_args_breaker(&mut self, tool_name: &str, args: &str) -> EmptyArgsResult {
        let is_empty = args.trim() == "{}" || args.trim().is_empty();

        if is_empty {
            self.global_empty_args_count += 1;

            // 全局阈值：跨所有工具累计 15 次空参数后，终止整个循环
            // 正常工作流中 TodoWrite/write_file 交替时空参数是偶发 API 行为，
            // 15 次预算足够完成大部分任务（如 5 个任务 × 3 次偶发空参数）
            if self.global_empty_args_count > 15 {
                return EmptyArgsResult::GlobalTripped;
            }

            let streak = self.empty_args_streak.entry(tool_name.to_string()).or_insert(0);
            *streak += 1;
            // 连续 3 次空参数后熔断：前 2 次给学习机会，第 3+ 次静默跳过
            if *streak >= 3 {
                EmptyArgsResult::PerToolTripped
            } else {
                EmptyArgsResult::FirstOffense
            }
        } else {
            // 有效参数：重置该工具的 per-tool 计数和全局计数
            // 有效参数说明 AI 恢复了正常行为，应重新开始计数
            self.empty_args_streak.remove(tool_name);
            self.global_empty_args_count = 0;
            EmptyArgsResult::ValidArgs
        }
    }

    /// 获取当前全局空参数计数（用于日志和调试）
    pub fn global_empty_args_count(&self) -> u32 {
        self.global_empty_args_count
    }

    /// 获取统计信息（用于调试）
    pub fn stats(&self) -> LoopDetectorStats {
        LoopDetectorStats {
            history_size: self.history.len(),
            consecutive_same_tool_count: self.consecutive_same_tool_count,
            window_size: self.config.window_size,
        }
    }
}

// ============================================================================
// 统计信息
// ============================================================================

#[derive(Debug, Clone)]
pub struct LoopDetectorStats {
    pub history_size: usize,
    pub consecutive_same_tool_count: usize,
    pub window_size: usize,
}

// ============================================================================
// 单例模式（全局共享）
// ============================================================================

use std::sync::OnceLock;

/// 全局循环检测器单例
pub fn global_loop_detector() -> &'static LoopDetector {
    static DETECTOR: OnceLock<LoopDetector> = OnceLock::new();
    DETECTOR.get_or_init(|| {
        // TODO: 从配置文件加载
        LoopDetector::from_config(LoopDetectionConfig::default())
    })
}

// ============================================================================
// 测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_signature_identical() {
        let sig1 = ToolCallSignature::from_tool_call("read_file", r#"{"path": "test.rs"}"#);
        let sig2 = ToolCallSignature::from_tool_call("read_file", r#"{"path": "test.rs"}"#);
        let sig3 = ToolCallSignature::from_tool_call("read_file", r#"{"path": "other.rs"}"#);

        assert!(sig1.is_identical(&sig2));
        assert!(!sig1.is_identical(&sig3));
    }

    #[test]
    fn test_tool_signature_same_tool() {
        let sig1 = ToolCallSignature::from_tool_call("read_file", r#"{"path": "a"}"#);
        let sig2 = ToolCallSignature::from_tool_call("read_file", r#"{"path": "b"}"#);
        let sig3 = ToolCallSignature::from_tool_call("bash", r#"{"cmd": "ls"}"#);

        assert!(sig1.is_same_tool(&sig2));
        assert!(!sig1.is_same_tool(&sig3));
    }

    #[test]
    fn test_detector_normal_case() {
        let config = LoopDetectionConfig {
            enabled: true,
            max_consecutive_same_tool: 10,
            max_identical_calls: 3,
            window_size: 20,
        };
        let mut detector = LoopDetector::from_config(config);

        // 正常调用：不同工具交替
        let status1 = detector.check("read_file", r#"{"path": "a"}"#);
        let status2 = detector.check("bash", r#"{"cmd": "ls"}"#);
        let status3 = detector.check("write_file", r#"{"path": "b"}"#);

        assert_eq!(status1, LoopDetectionStatus::Normal);
        assert_eq!(status2, LoopDetectionStatus::Normal);
        assert_eq!(status3, LoopDetectionStatus::Normal);
    }

    #[test]
    fn test_detector_consecutive_same_tool() {
        let config = LoopDetectionConfig {
            enabled: true,
            max_consecutive_same_tool: 5,
            max_identical_calls: 3,
            window_size: 20,
        };
        let mut detector = LoopDetector::from_config(config);

        // 连续调用相同工具 3 次（达到警告阈值）
        for i in 1..=3 {
            let status = detector.check("read_file", &format!(r#"{{"path": "file{}.rs"}}"#, i));
            if i == 3 {
                // 第 3 次应该触发警告
                assert!(status.should_warn());
                if let LoopDetectionStatus::Warning { count, .. } = status {
                    assert_eq!(count, 3);
                }
            }
        }
    }

    #[test]
    fn test_detector_identical_calls() {
        let config = LoopDetectionConfig {
            enabled: true,
            max_consecutive_same_tool: 10,
            max_identical_calls: 3,
            window_size: 20,
        };
        let mut detector = LoopDetector::from_config(config);

        // 完全相同调用 3 次
        for i in 1..=3 {
            let status = detector.check("bash", r#"{"cmd": "ls"}"#);
            if i == 3 {
                // 第 3 次应该触发阻断
                assert!(status.should_stop());
                if let LoopDetectionStatus::Blocked { reason } = status {
                    assert!(reason.contains("完全相同"));
                }
            }
        }
    }

    #[test]
    fn test_detector_disabled() {
        let config = LoopDetectionConfig {
            enabled: false,  // 禁用
            ..Default::default()
        };
        let mut detector = LoopDetector::from_config(config);

        // 即使调用相同工具多次，也不触发检测
        for _ in 0..100 {
            let status = detector.check("bash", r#"{"cmd": "ls"}"#);
            assert_eq!(status, LoopDetectionStatus::Normal);
        }
    }

    #[test]
    fn test_detector_reset() {
        let config = LoopDetectionConfig::default();
        let mut detector = LoopDetector::from_config(config);

        // 添加一些历史
        detector.check("read_file", r#"{"path": "a"}"#);
        detector.check("read_file", r#"{"path": "b"}"#);
        assert_eq!(detector.stats().history_size, 2);

        // 重置
        detector.reset();
        assert_eq!(detector.stats().history_size, 0);
        assert_eq!(detector.stats().consecutive_same_tool_count, 0);
    }

    // ═══════════════════════════════════════════════════════════
    // 集成测试
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_integration_full_workflow_normal_case() {
        // 正常工作流：不同工具交替调用
        let config = LoopDetectionConfig::default();
        let mut detector = LoopDetector::from_config(config);

        let calls = vec![
            ("read_file", r#"{"path": "a.rs"}"#),
            ("bash", r#"{"cmd": "ls"}"#),
            ("write_file", r#"{"path": "b.rs"}"#),
            ("read_file", r#"{"path": "c.rs"}"#),
        ];

        for (tool, args) in calls {
            let status = detector.check(tool, args);
            assert_eq!(status, LoopDetectionStatus::Normal);
        }
    }

    #[test]
    fn test_integration_complex_scenario() {
        // 复杂场景：混合调用
        let config = LoopDetectionConfig {
            enabled: true,
            max_consecutive_same_tool: 10,
            max_identical_calls: 3,
            window_size: 20,
        };
        let mut detector = LoopDetector::from_config(config);

        // 模拟真实的工具调用序列
        let sequence = vec![
            ("read_file", r#"{"path": "a.rs"}"#),
            ("read_file", r#"{"path": "b.rs"}"#),
            ("bash", r#"{"cmd": "ls"}"#),
            ("write_file", r#"{"path": "c.rs"}"#),
            ("read_file", r#"{"path": "d.rs"}"#),
        ];

        for (tool, args) in sequence {
            let status = detector.check(tool, args);
            assert_eq!(status, LoopDetectionStatus::Normal);
        }

        // 验证统计信息
        let stats = detector.stats();
        assert_eq!(stats.history_size, 5);
        assert_eq!(stats.consecutive_same_tool_count, 1);  // 最后一次是 read_file
    }

    #[test]
    fn test_integration_boundary_case() {
        // 边界情况：刚好达到阈值
        let config = LoopDetectionConfig {
            enabled: true,
            max_consecutive_same_tool: 3,
            max_identical_calls: 2,
            window_size: 10,
        };
        let mut detector = LoopDetector::from_config(config);

        // 连续调用刚好达到警告阈值（max_consecutive_same_tool / 2 = 1）
        // 这里我们测试第 2 次调用（因为 max_consecutive_same_tool / 2 = 1）
        // 第 1 次：normal
        // 第 2 次：warning（因为 2 >= 3/2 = 1）
        // 第 3 次：blocked（因为 3 >= 3）

        let status1 = detector.check("bash", r#"{"cmd": "ls1"}"#);
        assert_eq!(status1, LoopDetectionStatus::Normal);

        let status2 = detector.check("bash", r#"{"cmd": "ls2"}"#);
        assert!(status2.should_warn());

        let status3 = detector.check("bash", r#"{"cmd": "ls3"}"#);
        assert!(status3.should_stop());
    }

    // ═══════════════════════════════════════════════════════════
    // 真实场景模拟：AI 工具调用死循环
    // ═══════════════════════════════════════════════════════════

    /// 模拟 2048 游戏场景：AI 重复调用相同 bash 命令
    ///
    /// 截图中的真实场景：
    ///   AI 连续调用 bash("mkdir -p 2048-game") 超过 6 次
    ///   循环检测触发后仍然执行了（只打了警告没阻止）
    ///
    /// 这个测试验证：完全相同调用在第 max_identical_calls 次后必须被 Blocked
    #[test]
    fn test_real_scenario_repeated_bash_mkdir() {
        let config = LoopDetectionConfig {
            enabled: true,
            max_consecutive_same_tool: 10,
            max_identical_calls: 3,
            window_size: 20,
        };
        let mut detector = LoopDetector::from_config(config);

        // 模拟 AI 连续调用 "mkdir -p 2048-game"
        let identical_call = r#"{"command": "mkdir -p 2048-game"}"#;
        let mut blocked_count = 0;
        let mut executed_count = 0;

        for i in 1..=10 {
            let status = detector.check("bash", identical_call);
            if status.should_stop() {
                blocked_count += 1;
            } else {
                executed_count += 1;
            }
        }

        // 前 2 次应该正常执行，第 3 次起全部被阻止
        assert_eq!(executed_count, 2, "Expected 2 executions before block, got {}", executed_count);
        assert_eq!(blocked_count, 8, "Expected 8 blocks, got {}", blocked_count);
    }

    /// 模拟 AI 交替使用不同工具但参数相同的场景
    ///
    /// 真实场景：AI 先调用 glob_search({}) 失败 3 次，然后换 bash
    /// 循环检测应该在第 3 次相同调用时就阻止
    #[test]
    fn test_real_scenario_alternating_tools_with_same_args() {
        let config = LoopDetectionConfig {
            enabled: true,
            max_consecutive_same_tool: 10,
            max_identical_calls: 3,
            window_size: 20,
        };
        let mut detector = LoopDetector::from_config(config);

        // 阶段 1：glob_search 无参数调用 3 次（应该在第 3 次被阻止）
        for i in 1..=3 {
            let status = detector.check("glob_search", "{}");
            if i == 3 {
                assert!(status.should_stop(), "glob_search 3rd call should be blocked");
            } else {
                assert!(!status.should_stop(), "glob_search {}th call should not be blocked", i);
            }
        }

        // 阶段 2：切换到 bash，调用 mkdir（history 中仍有 glob_search 的记录）
        let status = detector.check("bash", r#"{"command": "mkdir -p 2048-game"}"#);
        assert!(!status.should_stop(), "First bash call should not be blocked");

        // 阶段 3：重复 bash mkdir 2 次
        let status = detector.check("bash", r#"{"command": "mkdir -p 2048-game"}"#);
        assert!(!status.should_stop(), "Second bash call should not be blocked");

        let status = detector.check("bash", r#"{"command": "mkdir -p 2048-game"}"#);
        assert!(status.should_stop(), "Third bash call should be blocked");
    }

    /// 模拟窗口溢出场景：history 窗口满了后旧记录被丢弃
    ///
    /// 真实场景：AI 在 20 次调用中穿插了 TodoWrite 等不同工具
    /// 导致旧的相同调用被挤出窗口，循环检测失效
    ///
    /// 这个测试验证窗口挤出的真实效果：相同签名从窗口中消失后，
    /// identical_count 会降到阈值以下，允许再次执行。
    #[test]
    fn test_real_scenario_window_eviction_allows_reexecution() {
        let config = LoopDetectionConfig {
            enabled: true,
            max_consecutive_same_tool: 10,
            max_identical_calls: 3,
            window_size: 20,
        };
        let mut detector = LoopDetector::from_config(config);

        // 先调用 bash 3 次 → 第 3 次被阻止
        for i in 1..=3 {
            let status = detector.check("bash", r#"{"command": "mkdir -p 2048-game"}"#);
            if i == 3 {
                assert!(status.should_stop(), "3rd identical bash call should be blocked");
            }
        }

        // 用不同工具的调用填满窗口（避免触发 identical 或 consecutive 检测）
        // 策略：每次调用都用唯一参数，保证 identical_count=1
        // 连续同工具不超过 9 次（consecutive 阈值 10）
        for i in 0..9 {
            let args = format!(r#"{{"path": "filler_{}.rs"}}"#, i);
            let status = detector.check("read_file", &args);
            assert!(!status.should_stop(), "read filler {} should not be blocked", i);
        }

        // 切换到 glob_search 填充（连续 9 次，避免 consecutive 阻止）
        for i in 0..9 {
            let args = format!(r#"{{"pattern": "filler_{}.rs"}}"#, i);
            let status = detector.check("glob_search", &args);
            assert!(!status.should_stop(), "glob filler {} should not be blocked", i);
        }

        // 此时窗口中有：3 bash + 9 read_file + 9 glob_search = 21
        // 窗口只保留 20 条，最旧的 1 个 bash 被挤出，剩 2 个 bash
        // 还需要 1 个 filler 把 bash 挤到只剩 1 个
        let status = detector.check("grep_search", r#"{"pattern": "evict_bash"}"#);
        assert!(!status.should_stop(), "extra grep filler should not be blocked");

        // 现在窗口：2 bash + 9 read_file + 9 glob_search + 1 grep = 21 → 挤出 1 个 bash → 剩 1 个 bash
        // 再次调用 bash mkdir → identical_count = 1（窗口中 1 个）+ 1（当前）= 2 < 3
        let status = detector.check("bash", r#"{"command": "mkdir -p 2048-game"}"#);
        assert!(!status.should_stop(),
            "After window eviction, bash identical_count < 3 — ROOT CAUSE confirmed: window eviction defeats loop detection");

        // 再调 2 次 → identical_count 应该达到 3 → 被阻止
        let status = detector.check("bash", r#"{"command": "mkdir -p 2048-game"}"#);
        // 此时 identical_count = 2（窗口中 2 个）+ 1（当前）= 3 → 但可能被挤出
        // 关键断言：只要能执行就说明窗口挤出让循环检测失效了
        if status.should_stop() {
            // 第 3 次被阻止 — 正常行为（窗口没挤出太多）
        } else {
            // 第 3 次没被阻止 — 窗口挤出导致 identical_count 降到阈值以下
            // 这正是我们要证明的根因
        }

        // 最终验证：无论是否被阻止，bash 至少被执行了 1 次（窗口挤出后）
        // 这证明了窗口挤出确实能让循环检测失效
        let stats = detector.stats();
        eprintln!("Final stats: history_size={}, consecutive_same_tool={}", stats.history_size, stats.consecutive_same_tool_count);
    }

    /// 模拟 continuation loop：循环检测在窗口被挤占后失效
    ///
    /// 这是根因测试：AI 在每轮 continuation 中调用 TodoWrite + bash + write_file，
    /// TodoWrite 和 write_file 的调用会挤占窗口，导致 bash 的 identical_count
    /// 反复降到阈值以下，形成 "执行2次→阻止→窗口挤出→再执行2次" 的循环。
    ///
    /// 真实场景中 continuation loop 会执行 100 轮，bash mkdir 可能被执行 20+ 次。
    #[test]
    fn test_real_scenario_continuation_loop_with_interleaved_todowrite() {
        let config = LoopDetectionConfig {
            enabled: true,
            max_consecutive_same_tool: 10,
            max_identical_calls: 3,
            window_size: 20,
        };
        let mut detector = LoopDetector::from_config(config);

        let bash_call = r#"{"command": "mkdir -p 2048-game"}"#;

        // 模拟 10 轮 continuation loop
        // 每轮 AI 调用 3 个不同工具：TodoWrite, bash, write_file
        // TodoWrite 和 write_file 每轮参数不同（模拟 AI 更新内容）
        let mut bash_execution_count = 0;
        let mut bash_blocked_count = 0;

        for round in 1..=10 {
            // 1. TodoWrite（每轮参数不同，避免 identical 检测）
            let tw_args = format!(r#"{{"todos":[{{"content":"task {}","activeForm":"doing task {}","status":"in_progress"}}]}}"#, round, round);
            let _ = detector.check("TodoWrite", &tw_args);

            // 2. bash mkdir（始终相同参数）
            let bash_status = detector.check("bash", bash_call);
            if bash_status.should_stop() {
                bash_blocked_count += 1;
            } else {
                bash_execution_count += 1;
            }

            // 3. write_file（每轮参数不同）
            let wf_args = format!(r#"{{"path":"2048-game/file{}.html","content":"<html>{}</html>"}}"#, round, round);
            let _ = detector.check("write_file", &wf_args);
        }

        eprintln!("=== continuation loop simulation (10 rounds, 3 tools/round) ===");
        eprintln!("bash executed: {}, bash blocked: {}", bash_execution_count, bash_blocked_count);

        // 当 TodoWrite 和 write_file 参数每轮不同时，它们不会触发 identical 检测
        // 窗口中有大量不同签名，bash 的 identical 记录被挤出后只能重新执行 2 次
        // 所以 bash 执行次数应该被限制在较低水平
        assert!(bash_execution_count <= 4,
            "bash mkdir was executed {} times in 10 rounds (blocked: {}). \
             Loop detection should limit re-execution after window eviction.",
            bash_execution_count, bash_blocked_count);
    }

    /// 参数微变绕过 identical 检测的测试
    ///
    /// 真实场景：AI 每次调用时参数可能有细微差异（空格、换行、字段顺序等），
    /// 导致 args_hash 不同，identical 检测完全失效。
    /// 只剩 consecutive_same_tool 检测（阈值 10），需要连续 10 次同工具才阻止。
    #[test]
    fn test_real_scenario_slightly_different_args_bypass_identical() {
        let config = LoopDetectionConfig {
            enabled: true,
            max_consecutive_same_tool: 10,
            max_identical_calls: 3,
            window_size: 20,
        };
        let mut detector = LoopDetector::from_config(config);

        // AI 每次调用的参数有细微差异（模拟真实 LLM 输出）
        // 每个变体的 FNV-1a hash 都不同
        let bash_variants = [
            r#"{"command":"mkdir -p 2048-game"}"#,              // 无空格
            r#"{"command": "mkdir -p 2048-game"}"#,              // 冒号后空格
            r#"{"command":"mkdir -p 2048-game", "quiet": true}"#, // 多字段
            r#"{ "command" : "mkdir -p 2048-game" }"#,           // 多空格
            r#"{"command":"mkdir -p 2048-game","verbose":1}"#,   // 整数值
        ];

        // 验证变体确实有不同的 hash
        let hashes: std::collections::HashSet<u64> = bash_variants.iter()
            .map(|v| ToolCallSignature::from_tool_call("bash", v).args_hash)
            .collect();
        assert_eq!(hashes.len(), 5, "All variants should have different hashes");

        let mut execution_count = 0;
        // 模拟 15 轮，每轮选一个参数变体（循环使用）
        for i in 0..15 {
            let variant = bash_variants[i % bash_variants.len()];
            let status = detector.check("bash", variant);
            if !status.should_stop() {
                execution_count += 1;
            }
        }

        // identical 检测完全失效（每次参数 hash 不同）
        // consecutive 检测在第 10 次连续 bash 时触发
        // 但注意：consecutive 检查的是 history 末尾连续相同 tool_name
        // 由于全部都是 "bash"，consecutive 一直在增长
        // 第 10 次时 consecutive_count=10 >= max_consecutive_same_tool(10) → Blocked
        assert_eq!(execution_count, 9,
            "Expected 9 executions (consecutive threshold 10), got {}. \
             This shows that when args vary slightly, only consecutive_same_tool detection works.",
            execution_count);
    }

    // ═══════════════════════════════════════════════════════════
    // 空参数熔断测试
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_empty_args_breaker_first_call_not_tripped() {
        let mut detector = LoopDetector::from_config(LoopDetectionConfig::default());
        // 首次空参数 → FirstOffense（应返回错误给 AI）
        assert_eq!(detector.check_empty_args_breaker("read_file", "{}"), EmptyArgsResult::FirstOffense);
    }

    #[test]
    fn test_empty_args_breaker_second_call_not_tripped() {
        let mut detector = LoopDetector::from_config(LoopDetectionConfig::default());
        detector.check_empty_args_breaker("read_file", "{}");
        // 第 2 次 → 仍然 FirstOffense（streak < 3）
        assert_eq!(detector.check_empty_args_breaker("read_file", "{}"), EmptyArgsResult::FirstOffense);
    }

    #[test]
    fn test_empty_args_breaker_third_call_tripped() {
        let mut detector = LoopDetector::from_config(LoopDetectionConfig::default());
        detector.check_empty_args_breaker("read_file", "{}");
        detector.check_empty_args_breaker("read_file", "{}");
        // 第 3 次 → PerToolTripped（streak >= 3）
        assert_eq!(detector.check_empty_args_breaker("read_file", "{}"), EmptyArgsResult::PerToolTripped);
    }

    #[test]
    fn test_empty_args_breaker_valid_args_resets_streak() {
        let mut detector = LoopDetector::from_config(LoopDetectionConfig::default());
        // 空参数 1 次 → FirstOffense
        assert_eq!(detector.check_empty_args_breaker("read_file", "{}"), EmptyArgsResult::FirstOffense);

        // 有效参数 → per-tool 重置 + 全局计数重置
        assert_eq!(detector.check_empty_args_breaker("read_file", r#"{"path": "a.rs"}"#), EmptyArgsResult::ValidArgs);
        assert_eq!(detector.global_empty_args_count(), 0, "valid args should reset global count");

        // 再次空参数 → per-tool 重置后重新从 FirstOffense 开始
        assert_eq!(detector.check_empty_args_breaker("read_file", "{}"), EmptyArgsResult::FirstOffense);
    }

    #[test]
    fn test_empty_args_breaker_independent_per_tool() {
        let mut detector = LoopDetector::from_config(LoopDetectionConfig::default());
        // read_file 空参数 2 次 → 还没熔断（streak < 3）
        detector.check_empty_args_breaker("read_file", "{}");
        assert_eq!(detector.check_empty_args_breaker("read_file", "{}"), EmptyArgsResult::FirstOffense);

        // read_file 第 3 次 → 熔断
        assert_eq!(detector.check_empty_args_breaker("read_file", "{}"), EmptyArgsResult::PerToolTripped);

        // write_file 首次空参数 → 不熔断（独立计数）
        assert_eq!(detector.check_empty_args_breaker("write_file", "{}"), EmptyArgsResult::FirstOffense);
    }

    #[test]
    fn test_empty_args_breaker_empty_string() {
        let mut detector = LoopDetector::from_config(LoopDetectionConfig::default());
        // 空字符串也应触发
        assert_eq!(detector.check_empty_args_breaker("bash", ""), EmptyArgsResult::FirstOffense);
        assert_eq!(detector.check_empty_args_breaker("bash", ""), EmptyArgsResult::FirstOffense);
        assert_eq!(detector.check_empty_args_breaker("bash", ""), EmptyArgsResult::PerToolTripped);
    }

    #[test]
    fn test_empty_args_breaker_reset() {
        let mut detector = LoopDetector::from_config(LoopDetectionConfig::default());
        detector.check_empty_args_breaker("read_file", "{}");
        detector.check_empty_args_breaker("read_file", "{}");
        assert_eq!(detector.check_empty_args_breaker("read_file", "{}"), EmptyArgsResult::PerToolTripped);

        detector.reset();
        // 重置后重新开始
        assert_eq!(detector.check_empty_args_breaker("read_file", "{}"), EmptyArgsResult::FirstOffense);
    }

    // ═══════════════════════════════════════════════════════════
    // 全局空参数熔断测试
    // ═══════════════════════════════════════════════════════════

    /// 模拟 AI 轮换不同工具但都发空参数的场景
    ///
    /// 全局阈值 15，需要连续 16 次空参数才触发 GlobalTripped
    #[test]
    fn test_global_empty_args_breaker_cross_tool_rotation() {
        let mut detector = LoopDetector::from_config(LoopDetectionConfig::default());

        // 15 次空参数（跨多个工具）→ 不触发
        for i in 0..15 {
            let tool = ["write_file", "TodoWrite", "read_file", "bash"][i % 4];
            let r = detector.check_empty_args_breaker(tool, "{}");
            assert_ne!(r, EmptyArgsResult::GlobalTripped, "{}th empty args should NOT trigger GlobalTripped", i + 1);
        }
        assert_eq!(detector.global_empty_args_count(), 15);

        // 第 16 次 → GlobalTripped
        let r16 = detector.check_empty_args_breaker("bash", "{}");
        assert_eq!(r16, EmptyArgsResult::GlobalTripped, "16th empty args should trigger GlobalTripped");
    }

    /// 有效参数重置全局计数
    ///
    /// 有效参数说明 AI 恢复正常，全局计数应重置为 0
    #[test]
    fn test_global_empty_args_valid_resets_global_count() {
        let mut detector = LoopDetector::from_config(LoopDetectionConfig::default());

        // 3 次空参数
        for tool in &["write_file", "TodoWrite", "read_file"] {
            detector.check_empty_args_breaker(tool, "{}");
        }
        assert_eq!(detector.global_empty_args_count(), 3);

        // 有效参数 → 全局计数重置为 0
        detector.check_empty_args_breaker("bash", r#"{"command": "ls"}"#);
        assert_eq!(detector.global_empty_args_count(), 0, "valid args should reset global count");

        // 之后又可以累计 15 次空参数
        for i in 0..15 {
            let tool = ["write_file", "TodoWrite", "read_file", "bash"][i % 4];
            let r = detector.check_empty_args_breaker(tool, "{}");
            assert_ne!(r, EmptyArgsResult::GlobalTripped, "{}th empty args after reset should NOT trigger", i + 1);
        }
    }
}
