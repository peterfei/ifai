//! Permission Store — 用户白名单权限规则存储
//!
//! 声明式架构：
//! - PATTERN_STRATEGIES 表：args_field + match_type + suffix + word_count
//! - APPROVAL_OPTION_DEFS 表：categories + option_type + label_template
//! - TOOL_DISPLAY_NAMES 表：tool_name + display_title + color
//! - MATCH_ENGINES 表：match_type → 函数指针映射

use crate::permission::{ToolCategory, should_auto_approve};
use serde::{Deserialize, Serialize};
use ratatui::style::Color;
use std::fs;
use std::path::PathBuf;

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

/// 规则类型：deny 始终优先于 allow
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RuleType {
    Allow,
    Deny,
}

/// 匹配类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MatchType {
    Prefix,  // 前缀匹配："git diff:*" 匹配 "git diff --stat"
    GlobDir, // Glob 目录匹配："src/**" 匹配 "src/main.rs"
    Exact,   // 精确匹配
}

/// 权限规则
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PermissionRule {
    pub tool_name: String,
    pub pattern: String,
    pub rule_type: RuleType,
}

/// 审批决策（扩展 approval_overlay::ApprovalDecision）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalDecision {
    ApproveOnce,
    ApproveAlways,
    ApproveSession,
    Deny,
    Abort,
}

/// 审批选项（用于构建 UI 选项列表）
#[derive(Debug, Clone)]
pub struct ApprovalOption {
    pub label: String,
    pub decision: ApprovalDecision,
}

/// 审批选项请求（用于生成选项列表）
#[derive(Debug, Clone)]
pub struct ApprovalOptionRequest {
    pub tool_name: String,
    pub category: ToolCategory,
    pub args_preview: String,
}

// ═══════════════════════════════════════════════════════════
// 声明式配置表（Single Source of Truth）
// ═══════════════════════════════════════════════════════════

/// 模式提取策略表
struct PatternStrategy {
    args_field: &'static str,    // 从哪个 JSON 字段提取
    match_type: MatchType,       // 匹配策略
    suffix: &'static str,        // 自动追加后缀
    word_count: Option<usize>,   // Prefix 模式取前 N 个词
}

const PATTERN_STRATEGIES: &[(&[&str], PatternStrategy)] = &[
    (&["bash"],
        PatternStrategy { args_field: "cmd",  match_type: MatchType::Prefix,
                          suffix: ":*", word_count: Some(2) }),
    (&["write_file", "edit_file", "delete_file"],
        PatternStrategy { args_field: "path", match_type: MatchType::GlobDir,
                          suffix: "/**", word_count: None }),
];

/// 审批选项类型
#[derive(Debug, Clone, Copy)]
pub enum ApprovalOptionType {
    Always,   // 持久化白名单
    Session,  // 会话级白名单
}

/// 审批选项定义表
struct ToolApprovalOptionDef {
    categories: &'static [ToolCategory],
    option_type: ApprovalOptionType,
    label_template: &'static str,  // "{pattern}" / "{dir}" 占位符
}

const APPROVAL_OPTION_DEFS: &[ToolApprovalOptionDef] = &[
    ToolApprovalOptionDef {
        categories: &[ToolCategory::Destructive],
        option_type: ApprovalOptionType::Always,
        label_template: "Yes, and always allow \"{pattern}\" for this project",
    },
    ToolApprovalOptionDef {
        categories: &[ToolCategory::Dangerous],
        option_type: ApprovalOptionType::Session,
        label_template: "Yes, and allow edits to {dir}/ for this session",
    },
];

/// 工具面板标题表
const TOOL_DISPLAY_NAMES: &[(&str, &str, Color)] = &[
    ("bash",        "Bash command",  Color::Magenta),
    ("write_file",  "Write file",    Color::Cyan),
    ("edit_file",   "Edit file",     Color::Cyan),
    ("delete_file", "Delete file",   Color::Red),
];

/// 匹配引擎策略表
type MatchFn = fn(pattern: &str, target: &str) -> bool;

const MATCH_ENGINES: &[(MatchType, MatchFn)] = &[
    (MatchType::Prefix,  match_prefix),
    (MatchType::GlobDir, match_glob_dir),
    (MatchType::Exact,   match_exact),
];

// ═══════════════════════════════════════════════════════════
// 匹配引擎实现
// ═══════════════════════════════════════════════════════════

fn match_prefix(pattern: &str, target: &str) -> bool {
    let prefix = pattern.trim_end_matches(":*");
    target.starts_with(prefix)
}

fn match_glob_dir(pattern: &str, target: &str) -> bool {
    let base = pattern.trim_end_matches("/**");
    if target == base {
        return true;
    }
    if target.starts_with(base) && target[base.len()..].starts_with('/') {
        return true;
    }
    // 检查子目录
    if target.starts_with(base) && target[base.len()..].contains('/') {
        return true;
    }
    false
}

fn match_exact(pattern: &str, target: &str) -> bool {
    pattern == target
}

// ═══════════════════════════════════════════════════════════
// PermissionStore
// ═══════════════════════════════════════════════════════════

pub struct PermissionStore {
    /// 持久化规则（从 ~/.ifai/permissions.toml 加载）
    persistent: Vec<PermissionRule>,
    /// 会话级规则（内存中，重启失效）
    session: Vec<PermissionRule>,
}

impl PermissionStore {
    pub fn new() -> Self {
        Self {
            persistent: Vec::new(),
            session: Vec::new(),
        }
    }

    /// 从 ~/.ifai/permissions.toml 加载
    pub fn load() -> Self {
        let path = Self::config_path();
        let persistent = if path.exists() {
            let content = fs::read_to_string(&path).unwrap_or_default();
            toml::from_str(&content).unwrap_or_default()
        } else {
            Vec::new()
        };
        Self {
            persistent,
            session: Vec::new(),
        }
    }

    fn config_path() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".ifai")
            .join("permissions.toml")
    }

    /// 查表提取模式（PATTERN_STRATEGIES 驱动）
    pub fn extract_pattern(tool_name: &str, args: &serde_json::Value) -> String {
        // 查表获取策略
        for (tools, strategy) in PATTERN_STRATEGIES {
            if tools.contains(&tool_name) {
                // 提取字段值
                let field_value = if let Some(v) = args.get(strategy.args_field) {
                    v.as_str().unwrap_or("")
                } else {
                    ""
                };

                // 应用策略
                return match strategy.match_type {
                    MatchType::Prefix => {
                        let words: Vec<&str> = field_value.split_whitespace().collect();
                        let count = strategy.word_count.unwrap_or(words.len());
                        let prefix = words.iter().take(count).cloned().collect::<Vec<_>>().join(" ");
                        format!("{}{}", prefix, strategy.suffix)
                    }
                    MatchType::GlobDir => {
                        if let Some(parent) = std::path::Path::new(field_value).parent() {
                            let dir = parent.to_str().unwrap_or(".");
                            format!("{}{}", dir, strategy.suffix)
                        } else {
                            format!(".{}", strategy.suffix)
                        }
                    }
                    MatchType::Exact => field_value.to_string(),
                };
            }
        }
        // 未找到策略，fallback 到工具名
        tool_name.to_string()
    }

    /// 查表匹配（MATCH_ENGINES 驱动）
    pub fn match_rule(pattern: &str, target: &str) -> bool {
        // 推断匹配类型
        let match_type = if pattern.ends_with(":*") {
            MatchType::Prefix
        } else if pattern.ends_with("/**") {
            MatchType::GlobDir
        } else {
            MatchType::Exact
        };

        // 查表调用匹配函数
        for (mt, func) in MATCH_ENGINES {
            if *mt == match_type {
                return func(pattern, target);
            }
        }
        false
    }

    /// 查表构建选项（APPROVAL_OPTION_DEFS 驱动）
    pub fn build_options(req: &ApprovalOptionRequest) -> Vec<ApprovalOption> {
        let mut options = vec![
            ApprovalOption {
                label: "Yes".to_string(),
                decision: ApprovalDecision::ApproveOnce,
            },
        ];

        // 遍历 APPROVAL_OPTION_DEFS，过滤 category
        for def in APPROVAL_OPTION_DEFS {
            if def.categories.contains(&req.category) {
                let label = match def.option_type {
                    ApprovalOptionType::Always => {
                        // 从 args_preview 提取 pattern
                        let pattern = Self::extract_pattern(&req.tool_name, &serde_json::json!(req.args_preview));
                        def.label_template.replace("{pattern}", &pattern)
                    }
                    ApprovalOptionType::Session => {
                        // 从 args_preview 提取目录
                        let path = &req.args_preview;
                        let dir = std::path::Path::new(path)
                            .parent()
                            .map(|p| p.to_str().unwrap_or("."))
                            .unwrap_or(".");
                        def.label_template.replace("{dir}", dir)
                    }
                };

                let decision = match def.option_type {
                    ApprovalOptionType::Always => ApprovalDecision::ApproveAlways,
                    ApprovalOptionType::Session => ApprovalDecision::ApproveSession,
                };

                options.push(ApprovalOption { label, decision });
            }
        }

        options.push(ApprovalOption {
            label: "No".to_string(),
            decision: ApprovalDecision::Deny,
        });

        options
    }

    /// 查表获取工具显示名称
    pub fn tool_display_name(tool_name: &str) -> (String, Color) {
        for (name, title, color) in TOOL_DISPLAY_NAMES {
            if *name == tool_name {
                return (title.to_string(), *color);
            }
        }
        (tool_name.to_string(), Color::White)
    }

    /// 添加会话级规则
    pub fn add_session_rule(&mut self, rule: PermissionRule) {
        self.session.push(rule);
    }

    /// 添加持久化规则（写入文件 + 内存）
    pub fn add_persistent_rule(&mut self, rule: PermissionRule) {
        // TODO: 实现文件写入
        self.persistent.push(rule);
    }

    /// 统一查询管道：deny → allow → fallback ToolApprovalEngine
    pub fn is_allowed(&self, tool_name: &str, args: &serde_json::Value) -> bool {
        // 1. 提取目标值
        let target = Self::extract_pattern(tool_name, args);

        // 2. deny 规则优先匹配
        for rule in &self.persistent {
            if rule.tool_name == tool_name {
                if rule.rule_type == RuleType::Deny {
                    if Self::match_rule(&rule.pattern, &target) {
                        return false;  // deny 命中，阻止
                    }
                }
            }
        }

        // 3. allow 规则匹配
        for rule in &self.persistent {
            if rule.tool_name == tool_name {
                if rule.rule_type == RuleType::Allow {
                    if Self::match_rule(&rule.pattern, &target) {
                        return true;  // allow 命中，放行
                    }
                }
            }
        }

        // 4. 会话级规则（会话级 deny 优先于会话级 allow）
        for rule in &self.session {
            if rule.tool_name == tool_name {
                if rule.rule_type == RuleType::Deny {
                    if Self::match_rule(&rule.pattern, &target) {
                        return false;
                    }
                }
            }
        }

        for rule in &self.session {
            if rule.tool_name == tool_name {
                if rule.rule_type == RuleType::Allow {
                    if Self::match_rule(&rule.pattern, &target) {
                        return true;
                    }
                }
            }
        }

        // 5. fallback 到 ToolApprovalEngine
        should_auto_approve(tool_name, false)
    }
}

impl Default for PermissionStore {
    fn default() -> Self {
        Self::new()
    }
}

// ═══════════════════════════════════════════════════════════
// 持久化数据结构
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Deserialize, Serialize, Default)]
struct PermissionFile {
    #[serde(default)]
    allow: Vec<PermissionRule>,
    #[serde(default)]
    deny: Vec<PermissionRule>,
}

impl From<PermissionFile> for Vec<PermissionRule> {
    fn from(file: PermissionFile) -> Self {
        let mut rules = Vec::new();
        for mut rule in file.allow {
            rule.rule_type = RuleType::Allow;
            rules.push(rule);
        }
        for mut rule in file.deny {
            rule.rule_type = RuleType::Deny;
            rules.push(rule);
        }
        rules
    }
}

// ═══════════════════════════════════════════════════════════
// 单元测试
// ═══════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn make_args(tool_name: &str, value: serde_json::Value) -> serde_json::Value {
        match tool_name {
            "bash" => json!({"cmd": value}),
            "write_file" | "edit_file" | "delete_file" => json!({"path": value}),
            _ => value,
        }
    }

    // ═══════════════════════════════════════════════════════════
    // PATTERN_STRATEGIES 表测试
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_extract_pattern_bash_prefix() {
        let args = make_args("bash", json!("git diff --stat"));
        let pattern = PermissionStore::extract_pattern("bash", &args);
        assert_eq!(pattern, "git diff:*");
    }

    #[test]
    fn test_extract_pattern_bash_single_word() {
        let args = make_args("bash", json!("ls"));
        let pattern = PermissionStore::extract_pattern("bash", &args);
        assert_eq!(pattern, "ls:*");
    }

    #[test]
    fn test_extract_pattern_write_file_glob_dir() {
        let args = make_args("write_file", json!("src/main.rs"));
        let pattern = PermissionStore::extract_pattern("write_file", &args);
        assert_eq!(pattern, "src/**");
    }

    #[test]
    fn test_extract_pattern_edit_file_nested_path() {
        let args = make_args("edit_file", json!("src/tauri/src/main.rs"));
        let pattern = PermissionStore::extract_pattern("edit_file", &args);
        assert_eq!(pattern, "src/tauri/**");
    }

    #[test]
    fn test_extract_pattern_delete_file_glob_dir() {
        let args = make_args("delete_file", json!("build/output.bin"));
        let pattern = PermissionStore::extract_pattern("delete_file", &args);
        assert_eq!(pattern, "build/**");
    }

    #[test]
    fn test_extract_pattern_unknown_tool_fallback() {
        let args = json!({"foo": "bar"});
        let pattern = PermissionStore::extract_pattern("unknown_tool", &args);
        assert_eq!(pattern, "unknown_tool");
    }

    // ═══════════════════════════════════════════════════════════
    // MATCH_ENGINES 表测试
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_match_engine_prefix_match() {
        assert!(PermissionStore::match_rule("git diff:*", "git diff --stat"));
        assert!(PermissionStore::match_rule("git diff:*", "git diff"));
        assert!(!PermissionStore::match_rule("git diff:*", "git status"));
    }

    #[test]
    fn test_match_engine_prefix_exact() {
        assert!(PermissionStore::match_rule("npm test:*", "npm test -- --watch"));
        assert!(!PermissionStore::match_rule("npm test:*", "npm run test"));
    }

    #[test]
    fn test_match_engine_glob_dir_match() {
        assert!(PermissionStore::match_rule("src/**", "src/main.rs"));
        assert!(PermissionStore::match_rule("src/**", "src/tauri/src/main.rs"));
        assert!(PermissionStore::match_rule("src/**", "src/"));
        assert!(!PermissionStore::match_rule("src/**", "tests/main.rs"));
    }

    #[test]
    fn test_match_engine_exact_match() {
        assert!(PermissionStore::match_rule("exact", "exact"));
        assert!(!PermissionStore::match_rule("exact", "exact-partial"));
    }

    // ═══════════════════════════════════════════════════════════
    // APPROVAL_OPTION_DEFS 表测试
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_build_options_bash_destructive() {
        let req = ApprovalOptionRequest {
            tool_name: "bash".to_string(),
            category: ToolCategory::Destructive,
            args_preview: "git diff".to_string(),
        };
        let options = PermissionStore::build_options(&req);

        assert_eq!(options.len(), 3);
        assert!(matches!(options[0].decision, ApprovalDecision::ApproveOnce));
        assert!(matches!(options[1].decision, ApprovalDecision::ApproveAlways));
        assert!(options[1].label.contains("git diff"));
        assert!(matches!(options[2].decision, ApprovalDecision::Deny));
    }

    #[test]
    fn test_build_options_edit_file_dangerous() {
        let req = ApprovalOptionRequest {
            tool_name: "edit_file".to_string(),
            category: ToolCategory::Dangerous,
            args_preview: "src/main.rs".to_string(),
        };
        let options = PermissionStore::build_options(&req);

        assert_eq!(options.len(), 3);
        assert!(matches!(options[0].decision, ApprovalDecision::ApproveOnce));
        assert!(matches!(options[1].decision, ApprovalDecision::ApproveSession));
        assert!(options[1].label.contains("src/"));
        assert!(matches!(options[2].decision, ApprovalDecision::Deny));
    }

    #[test]
    fn test_build_options_safe_tools_no_extra_option() {
        let req = ApprovalOptionRequest {
            tool_name: "read_file".to_string(),
            category: ToolCategory::Safe,
            args_preview: "src/main.rs".to_string(),
        };
        let options = PermissionStore::build_options(&req);

        assert_eq!(options.len(), 2);
        assert!(matches!(options[0].decision, ApprovalDecision::ApproveOnce));
        assert!(matches!(options[1].decision, ApprovalDecision::Deny));
    }

    // ═══════════════════════════════════════════════════════════
    // TOOL_DISPLAY_NAMES 表测试
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_tool_display_name_bash() {
        let (title, _) = PermissionStore::tool_display_name("bash");
        assert_eq!(title.as_str(), "Bash command");
    }

    #[test]
    fn test_tool_display_name_write_file() {
        let (title, _) = PermissionStore::tool_display_name("write_file");
        assert_eq!(title.as_str(), "Write file");
    }

    #[test]
    fn test_tool_display_name_edit_file() {
        let (title, _) = PermissionStore::tool_display_name("edit_file");
        assert_eq!(title.as_str(), "Edit file");
    }

    #[test]
    fn test_tool_display_name_delete_file() {
        let (title, _) = PermissionStore::tool_display_name("delete_file");
        assert_eq!(title.as_str(), "Delete file");
    }

    #[test]
    fn test_tool_display_name_unknown_fallback() {
        let (title, _) = PermissionStore::tool_display_name("unknown_tool");
        assert_eq!(title.as_str(), "unknown_tool");
    }

    // ═══════════════════════════════════════════════════════════
    // is_allowed() 管道测试（deny 优先 + fallback）
    // ═══════════════════════════════════════════════════════════

    #[test]
    fn test_is_allowed_deny_priority_over_allow() {
        let mut store = PermissionStore::new();

        store.add_session_rule(PermissionRule {
            tool_name: "bash".to_string(),
            pattern: "git diff:*".to_string(),
            rule_type: RuleType::Allow,
        });
        store.add_session_rule(PermissionRule {
            tool_name: "bash".to_string(),
            pattern: "git diff:*".to_string(),
            rule_type: RuleType::Deny,
        });

        let args = make_args("bash", json!("git diff --stat"));
        assert!(!store.is_allowed("bash", &args));
    }

    #[test]
    fn test_is_allowed_allow_match() {
        let mut store = PermissionStore::new();

        store.add_session_rule(PermissionRule {
            tool_name: "bash".to_string(),
            pattern: "git diff:*".to_string(),
            rule_type: RuleType::Allow,
        });

        let args = make_args("bash", json!("git diff --stat"));
        assert!(store.is_allowed("bash", &args));
    }

    #[test]
    fn test_is_allowed_no_rule_fallback_to_engine() {
        let store = PermissionStore::new();

        // Safe 工具默认自动审批
        let args = make_args("read_file", json!("src/main.rs"));
        assert!(store.is_allowed("read_file", &args));

        // Destructive 工具默认需要审批
        let args = make_args("bash", json!("rm -rf /tmp/test"));
        assert!(!store.is_allowed("bash", &args));
    }

    #[test]
    fn test_is_allow_specific_pattern_match() {
        let mut store = PermissionStore::new();

        store.add_session_rule(PermissionRule {
            tool_name: "bash".to_string(),
            pattern: "npm test:*".to_string(),
            rule_type: RuleType::Allow,
        });

        let args = make_args("bash", json!("npm test -- --watch"));
        assert!(store.is_allowed("bash", &args));

        let args = make_args("bash", json!("npm run test"));
        assert!(!store.is_allowed("bash", &args));
    }

    #[test]
    fn test_is_allowed_glob_dir_pattern() {
        let mut store = PermissionStore::new();

        store.add_session_rule(PermissionRule {
            tool_name: "edit_file".to_string(),
            pattern: "src/**".to_string(),
            rule_type: RuleType::Allow,
        });

        let args = make_args("edit_file", json!("src/main.rs"));
        assert!(store.is_allowed("edit_file", &args));

        let args = make_args("edit_file", json!("tests/test.rs"));
        assert!(!store.is_allowed("edit_file", &args));
    }
}
