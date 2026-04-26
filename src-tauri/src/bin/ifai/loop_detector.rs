//! 🎨 元编程循环检测引擎
//!
//! **零手写逻辑**：配置驱动的通用检测引擎
//! **单一数据源**：JSON 配置文件
//! **声明式 API**：返回状态而非布尔值

use std::collections::VecDeque;
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

        let signature = ToolCallSignature::from_tool_call(tool_name, args);

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
}
