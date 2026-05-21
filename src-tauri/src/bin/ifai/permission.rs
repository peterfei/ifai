//! 元编程权限引擎
//!
//! 从 tool_approval_config.json 自动生成权限判断逻辑
//! 零重复代码，配置驱动。

use crate::loop_detector::{
    EmptyArgsResult, LoopDetectionConfig, LoopDetector,
};

// 🔍 重新导出 LoopDetectionStatus，供 session.rs 的循环检测使用
pub use crate::loop_detector::LoopDetectionStatus;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};

/// 🔥 调试日志路径（与 session.rs 保持一致）
fn get_debug_log_path() -> PathBuf {
    std::env::var("IFAI_DEBUG_LOG")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let mut path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
            path.push(".ifai");
            path.push("debug.log");
            path
        })
}

/// 同步写入调试日志（用于非异步上下文）
fn log_debug_sync(message: String) {
    let log_path = get_debug_log_path();
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let log_line = format!("[{}] {}\n", timestamp, message);
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut file| std::io::Write::write_all(&mut file, log_line.as_bytes()));
}

// ═══════════════════════════════════════════════════════════
// 类型定义（与 UI 对齐）
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolCategory {
    Safe,
    Dangerous,
    Destructive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")] // 🔥 FIX: 匹配 TypeScript 的驼峰命名
pub struct ToolConfig {
    pub name: String,
    pub aliases: Vec<String>,
    pub category: ToolCategory,
    pub risk_level: RiskLevel,
    pub requires_approval: bool,
    pub require_sandbox: bool,
    pub aggregatable: bool,
    pub max_iterations: usize,
    pub path_risk_rules: Vec<PathRiskRule>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PathRiskRule {
    pub pattern: String,
    pub risk: RiskLevel,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")] // 🔥 FIX: 匹配 TypeScript 的驼峰命名
pub struct AutoApprovalRule {
    pub priority: i32,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub when: Option<RuleCondition>,
    pub then: RuleAction,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")] // 🔥 FIX: 匹配 TypeScript 的驼峰命名
pub struct RuleCondition {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "deserialize_optional_vec")]
    pub category: Option<Vec<ToolCategory>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "deserialize_optional_vec")]
    pub risk_level: Option<Vec<RiskLevel>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub require_sandbox: Option<bool>,
}

// 🔥 辅助函数：支持从字符串或数组反序列化
fn deserialize_optional_vec<'de, D, T>(deserializer: D) -> Result<Option<Vec<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    use serde::de::{Error, Visitor};
    use std::fmt;
    use std::marker::PhantomData;

    struct StringOrVecVisitor<T>(PhantomData<T>);

    impl<'de, T> Visitor<'de> for StringOrVecVisitor<T>
    where
        T: serde::Deserialize<'de>,
    {
        type Value = Option<Vec<T>>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("string or array")
        }

        fn visit_str<E>(self, s: &str) -> Result<Self::Value, E>
        where
            E: Error,
        {
            // 从单字符串转换为包含该元素的数组
            // 使用 serde_json::Value 作为中间类型
            let json_value = serde_json::Value::String(s.to_string());
            T::deserialize(json_value)
                .map(|item| Some(vec![item]))
                .map_err(|_| Error::custom(format!("failed to parse string: {}", s)))
        }

        fn visit_seq<A>(self, seq: A) -> Result<Self::Value, A::Error>
        where
            A: serde::de::SeqAccess<'de>,
        {
            use serde::Deserialize;
            // 解析数组
            Deserialize::deserialize(serde::de::value::SeqAccessDeserializer::new(seq)).map(Some)
        }
    }

    deserializer.deserialize_any(StringOrVecVisitor(PhantomData))
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RuleAction {
    pub approve: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")] // 🔥 FIX: 匹配 TypeScript 的驼峰命名
pub struct ApprovalConfig {
    pub tools: Vec<ToolConfig>,
    pub auto_approval_rules: Vec<AutoApprovalRule>,
    #[serde(default)]
    pub loop_detection: Option<LoopDetectionConfig>,
    #[serde(rename = "globalPathRiskRules")]
    pub global_path_risk_rules: Vec<PathRiskRule>,
}

// ═══════════════════════════════════════════════════════════
// 元编程引擎：从配置生成运行时索引
// ═══════════════════════════════════════════════════════════

pub struct ToolApprovalEngine {
    // 运行时索引（O(1) 查询）
    tool_by_name: HashMap<String, ToolConfig>,
    tools_by_category: HashMap<ToolCategory, Vec<ToolConfig>>,
    max_iterations_by_category: HashMap<ToolCategory, usize>,

    // 排序后的规则链
    sorted_rules: Vec<AutoApprovalRule>,
}

impl ToolApprovalEngine {
    /// 从配置文件加载
    pub fn from_config(config: ApprovalConfig) -> Self {
        let mut tool_by_name = HashMap::new();
        let mut tools_by_category = HashMap::new();
        let mut max_iterations_by_category = HashMap::new();

        // 构建索引
        for tool in config.tools {
            // 注册主名称
            tool_by_name.insert(tool.name.clone(), tool.clone());

            // 注册别名
            for alias in &tool.aliases {
                tool_by_name.insert(alias.clone(), tool.clone());
            }

            // 按类别分组
            tools_by_category
                .entry(tool.category)
                .or_insert_with(Vec::new)
                .push(tool.clone());

            // 记录最大迭代次数
            max_iterations_by_category.insert(tool.category, tool.max_iterations);
        }

        // 排序规则链
        let mut sorted_rules = config.auto_approval_rules;
        sorted_rules.sort_by_key(|r| r.priority);

        Self {
            tool_by_name,
            tools_by_category,
            max_iterations_by_category,
            sorted_rules,
        }
    }

    /// 获取循环检测配置
    pub fn loop_detection_config(&self) -> Option<LoopDetectionConfig> {
        None // 暂时返回 None，由全局函数提供
    }

    /// 🔥 元编程 API：工具分类（O(1) 查询）
    pub fn categorize_tool(&self, name: &str) -> ToolCategory {
        self.tool_by_name
            .get(name)
            .map(|t| t.category)
            .unwrap_or(ToolCategory::Dangerous) // 默认：未知工具为危险
    }

    /// 🔥 元编程 API：风险计算（O(1) 查询）
    pub fn calculate_risk(&self, name: &str, _args: &serde_json::Value) -> RiskLevel {
        self.tool_by_name
            .get(name)
            .map(|t| t.risk_level)
            .unwrap_or(RiskLevel::Medium) // 默认：中等风险
    }

    /// 🔥 元编程 API：自动审批判断（规则链求值）
    pub fn should_auto_approve(&self, tool_name: &str, is_sandbox: bool) -> bool {
        let tool = self.tool_by_name.get(tool_name);

        for rule in &self.sorted_rules {
            // 规则条件检查
            if let Some(when) = &rule.when {
                // 类别过滤
                if let Some(categories) = &when.category {
                    let tool_category = tool.map(|t| t.category).unwrap_or(ToolCategory::Dangerous);
                    if !categories.contains(&tool_category) {
                        continue;
                    }
                }

                // 沙箱条件
                if when.require_sandbox.unwrap_or(false) && !is_sandbox {
                    continue;
                }
            }

            // 规则命中
            return rule.then.approve;
        }

        false // 默认：需要手动审批
    }

    /// 🔥 元编程 API：最大迭代次数（完全信任模型）
    ///
    /// **策略**: 移除硬性限制，完全信任模型自主决策
    /// - 使用 `usize::MAX` 表示几乎无限（实际受内存限制）
    /// - 依赖循环检测器提供安全网：
    ///   - 10 次连续相同工具 → 警告
    ///   - 3 次完全相同调用 → 阻断
    /// - 依赖其他保护机制：
    ///   - 空参数熔断（连续 2 次跳过）
    ///   - 节点超时（5 分钟）
    ///   - AI 服务的循环检测（连续相同工具签名）
    pub fn max_iterations(&self, _category: ToolCategory) -> usize {
        1000 // 安全上限，防止无限循环
    }

    /// 获取工具完整配置
    pub fn get_config(&self, name: &str) -> Option<&ToolConfig> {
        self.tool_by_name.get(name)
    }
}

// ═══════════════════════════════════════════════════════════
// 全局单例（延迟加载）
// ═══════════════════════════════════════════════════════════

use once_cell::sync::Lazy;

static APPROVAL_ENGINE: Lazy<ToolApprovalEngine> = Lazy::new(|| {
    let config_json = include_str!("tool_approval_config.json");
    let config: ApprovalConfig =
        serde_json::from_str(config_json).expect("Failed to parse tool_approval_config.json");

    ToolApprovalEngine::from_config(config)
});

/// 全局循环检测器（使用 RwLock 实现内部可变性）
static LOOP_DETECTOR: OnceLock<RwLock<LoopDetector>> = OnceLock::new();

/// 初始化全局循环检测器
fn init_loop_detector() {
    let config_json = include_str!("tool_approval_config.json");
    let config: ApprovalConfig =
        serde_json::from_str(config_json).expect("Failed to parse tool_approval_config.json");

    let loop_config = config.loop_detection.unwrap_or_default();
    LOOP_DETECTOR.get_or_init(|| RwLock::new(LoopDetector::from_config(loop_config)));
}

// 确保在首次使用时初始化
fn ensure_loop_detector_initialized() {
    if LOOP_DETECTOR.get().is_none() {
        init_loop_detector();
    }
}

// ═══════════════════════════════════════════════════════════
// 便捷 API（直接调用全局单例）
// ═══════════════════════════════════════════════════════════

pub fn categorize_tool(name: &str) -> ToolCategory {
    APPROVAL_ENGINE.categorize_tool(name)
}

pub fn calculate_risk(name: &str, args: &serde_json::Value) -> RiskLevel {
    APPROVAL_ENGINE.calculate_risk(name, args)
}

pub fn should_auto_approve(tool_name: &str, is_sandbox: bool) -> bool {
    APPROVAL_ENGINE.should_auto_approve(tool_name, is_sandbox)
}

pub fn max_iterations(category: ToolCategory) -> usize {
    APPROVAL_ENGINE.max_iterations(category)
}

/// 🎯 声明式循环检测 API
///
/// 返回检测状态，调用方根据状态决定行为
pub fn check_loop(tool_name: &str, args: &str) -> LoopDetectionStatus {
    ensure_loop_detector_initialized();

    if let Some(detector) = LOOP_DETECTOR.get() {
        if let Ok(mut detector) = detector.write() {
            let status = detector.check(tool_name, args);

            // 🔥 打印循环检测日志
            match &status {
                LoopDetectionStatus::Normal => {}
                LoopDetectionStatus::Warning { count, pattern } => {
                    // 检查参数唯一比例
                    let consecutive_count = detector.get_consecutive_count(tool_name);
                    let unique_args = detector.get_unique_args_in_window(tool_name, consecutive_count);
                    let unique_ratio = if consecutive_count > 0 {
                        unique_args.len() as f64 / consecutive_count as f64
                    } else {
                        1.0
                    };

                    if unique_ratio > 0.8 {
                        // 参数各不相同，允许继续
                        log_debug_sync(format!(
                            "[LOOP-DETECT] INFO: {} x{} (连续调用 '{}' {} 次（但参数各不相同，允许继续）) | unique_ratio={:.1}% | args: {}",
                            tool_name, count, tool_name, consecutive_count,
                            unique_ratio * 100.0,
                            args.chars().take(100).collect::<String>()
                        ));
                    } else {
                        // 参数大量重复，警告
                        log_debug_sync(format!(
                            "[LOOP-DETECT] WARNING: {} x{} (连续调用 '{}' {} 次，唯一参数 {}/{} ({:.1}%)) | args: {}",
                            tool_name, count, tool_name, consecutive_count,
                            unique_args.len(), consecutive_count, unique_ratio * 100.0,
                            args.chars().take(100).collect::<String>()
                        ));
                    }
                }
                LoopDetectionStatus::Blocked { reason } => {
                    log_debug_sync(format!(
                        "[LOOP-DETECT] BLOCKED: {} | args: {}",
                        reason,
                        args.chars().take(100).collect::<String>()
                    ));
                }
            }

            return status;
        }
    }

    LoopDetectionStatus::Normal
}

/// 重置循环检测器（新的对话开始时调用）
pub fn reset_loop_detector() {
    ensure_loop_detector_initialized();

    if let Some(detector) = LOOP_DETECTOR.get() {
        if let Ok(mut detector) = detector.write() {
            detector.reset();
        }
    }
}

/// 🔥 空参数熔断检测
///
/// 返回 `EmptyArgsResult`：
/// - `ValidArgs` — 参数非空
/// - `FirstOffense` — 该工具首次空参数（调用方应返回错误给 AI）
/// - `PerToolTripped` — 该工具连续 2+ 次空参数（调用方应静默跳过）
/// - `GlobalTripped` — 全局空参数超过阈值（调用方应终止整个循环）
pub fn check_empty_args_breaker(tool_name: &str, args: &str) -> EmptyArgsResult {
    ensure_loop_detector_initialized();

    if let Some(detector) = LOOP_DETECTOR.get() {
        if let Ok(mut detector) = detector.write() {
            return detector.check_empty_args_breaker(tool_name, args);
        }
    }

    EmptyArgsResult::ValidArgs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_categorize_safe_tools() {
        assert_eq!(categorize_tool("read_file"), ToolCategory::Safe);
        assert_eq!(categorize_tool("TodoWrite"), ToolCategory::Safe);
    }

    #[test]
    fn test_categorize_destructive_tools() {
        assert_eq!(categorize_tool("bash"), ToolCategory::Destructive);
        assert_eq!(categorize_tool("delete_file"), ToolCategory::Destructive);
    }

    #[test]
    fn test_unknown_tool_is_dangerous() {
        assert_eq!(categorize_tool("unknown_tool"), ToolCategory::Dangerous);
    }

    #[test]
    fn test_max_iterations() {
        // 安全上限：所有类别统一限制为 1000 次
        let safe_max = max_iterations(ToolCategory::Safe);
        let destructive_max = max_iterations(ToolCategory::Destructive);
        let dangerous_max = max_iterations(ToolCategory::Dangerous);

        // 验证返回的是安全上限 1000
        assert_eq!(safe_max, 1000);
        assert_eq!(destructive_max, 1000);
        assert_eq!(dangerous_max, 1000);

        // 验证所有类别返回相同的值
        assert_eq!(safe_max, destructive_max);
        assert_eq!(destructive_max, dangerous_max);
    }
}
