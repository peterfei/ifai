//! permission_gui — GUI 侧权限管理桥接
//!
//! 读取 TUI 已有的 ~/.ifai/permissions.toml，提供 Tauri command。
//! 独立自包含，不依赖 binary crate 的 permission/permission_store 模块。
//! 与 TUI 共享同一份 TOML 文件格式，但保持代码独立。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, PartialEq, Eq, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RuleType { #[default] Allow, Deny }

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PermissionRule {
    pub tool: String,
    pub pattern: String,
    #[serde(default)]
    pub rule_type: RuleType,
}

#[derive(Debug, Deserialize)]
struct PermissionFile {
    #[serde(default)]
    allow: Vec<AllowDenyEntry>,
    #[serde(default)]
    deny: Vec<AllowDenyEntry>,
}

#[derive(Debug, Deserialize)]
struct AllowDenyEntry {
    tool: String,
    pattern: String,
}

#[derive(Debug, Serialize)]
pub struct DecisionOption {
    #[serde(rename = "type")]
    pub decision_type: String,
    pub label: String,
    pub icon: String,
}

// ═══════════════════════════════════════════════════════════
// 会话级规则（内存中，重启失效）
// ═══════════════════════════════════════════════════════════

static SESSION_RULES: OnceLock<std::sync::Mutex<Vec<(String, String, RuleType)>>> = OnceLock::new();

fn session_rules() -> &'static std::sync::Mutex<Vec<(String, String, RuleType)>> {
    SESSION_RULES.get_or_init(|| std::sync::Mutex::new(Vec::new()))
}

// ═══════════════════════════════════════════════════════════
// 文件路径
// ═══════════════════════════════════════════════════════════

fn config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ifai")
        .join("permissions.toml")
}

// ═══════════════════════════════════════════════════════════
// 核心逻辑
// ═══════════════════════════════════════════════════════════

/// 从 TOML 文件加载规则列表
fn load_rules() -> Vec<(String, String, RuleType)> {
    let path = config_path();
    if !path.exists() {
        return Vec::new();
    }
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    parse_toml(&content)
}

/// 解析 TOML 内容为规则列表
fn parse_toml(content: &str) -> Vec<(String, String, RuleType)> {
    let file: PermissionFile = match toml::from_str(content) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };
    let mut rules = Vec::new();
    for entry in file.allow {
        rules.push((entry.tool, entry.pattern, RuleType::Allow));
    }
    for entry in file.deny {
        rules.push((entry.tool, entry.pattern, RuleType::Deny));
    }
    rules
}

/// 追加持久化规则并保存
fn add_rule(tool: &str, pattern: &str, rule_type: &RuleType) -> Result<(), String> {
    let mut rules = load_rules();
    rules.push((tool.to_string(), pattern.to_string(), rule_type.clone()));
    save_rules(&rules)
}

/// 保存规则到 TOML 文件
fn save_rules(rules: &[(String, String, RuleType)]) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create dir: {e}"))?;
    }
    let mut allow_list = Vec::new();
    let mut deny_list = Vec::new();
    for (tool, pattern, rt) in rules {
        match rt {
            RuleType::Allow => allow_list.push(format!(r#"[[allow]]
tool = "{tool}"
pattern = "{pattern}"
"#)),
            RuleType::Deny => deny_list.push(format!(r#"[[deny]]
tool = "{tool}"
pattern = "{pattern}"
"#)),
        }
    }
    let mut content = String::new();
    for a in &allow_list { content.push_str(a); content.push('\n'); }
    for d in &deny_list { content.push_str(d); content.push('\n'); }
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write {}: {e}", path.display()))?;
    Ok(())
}

/// 判断操作是否被允许
/// deny 优先 → allow → fallback false（需要审批）
fn is_allowed(tool: &str, args_json: &serde_json::Value) -> bool {
    let rules = load_rules();
    let target = extract_target_value(tool, args_json);

    // deny 优先
    for (t, pat, rt) in &rules {
        if t == tool && *rt == RuleType::Deny && match_rule(pat, &target) {
            return false;
        }
    }
    // allow
    for (t, pat, rt) in &rules {
        if t == tool && *rt == RuleType::Allow && match_rule(pat, &target) {
            return true;
        }
    }

    // 会话级规则（deny 优先于 allow）
    if let Ok(session) = session_rules().lock() {
        for (t, pat, rt) in session.iter() {
            if t == tool && *rt == RuleType::Deny && match_rule(pat, &target) {
                return false;
            }
        }
        for (t, pat, rt) in session.iter() {
            if t == tool && *rt == RuleType::Allow && match_rule(pat, &target) {
                return true;
            }
        }
    }

    false // fallback: 需要审批
}

/// 从工具参数中提取用于匹配的目标值
fn extract_target_value(tool: &str, args: &serde_json::Value) -> String {
    match tool {
        "bash" => args.get("cmd")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .split_whitespace()
            .take(2)
            .collect::<Vec<_>>()
            .join(" "),
        "write_file" | "edit_file" | "delete_file" | "agent_write_file" =>
            args.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        _ => args.to_string(),
    }
}

/// 模式匹配
fn match_rule(pattern: &str, target: &str) -> bool {
    if pattern.ends_with(":*") {
        let prefix = pattern.trim_end_matches(":*");
        target.starts_with(prefix)
    } else if pattern.ends_with("/**") {
        let base = pattern.trim_end_matches("/**");
        target == base || target.starts_with(&format!("{base}/"))
    } else {
        pattern == target
    }
}

/// 获取可用审批决策选项
/// category: "safe" | "dangerous" | "destructive"
fn available_decisions(category: &str) -> Vec<DecisionOption> {
    let mut opts = vec![
        DecisionOption { decision_type: "once".into(),   label: "允许本次".into(),   icon: "✅".into() },
    ];
    match category {
        "destructive" => {
            opts.push(DecisionOption { decision_type: "always".into(),  label: "始终允许".into(),  icon: "🔁".into() });
            opts.push(DecisionOption { decision_type: "session".into(), label: "本次会话允许".into(), icon: "🔄".into() });
        }
        "dangerous" => {
            opts.push(DecisionOption { decision_type: "session".into(), label: "本次会话允许".into(), icon: "🔄".into() });
        }
        _ => {} // safe: 只有一次
    }
    opts.push(DecisionOption { decision_type: "deny".into(),   label: "拒绝".into(),   icon: "✗".into() });
    opts
}

// ═══════════════════════════════════════════════════════════
// Tauri command
// ═══════════════════════════════════════════════════════════

#[tauri::command]
pub fn permission_invoke(action: String, payload: String) -> Result<String, String> {
    match action.as_str() {
        "is_allowed" => {
            #[derive(Deserialize)]
            struct IsAllowedPayload { tool: String, args: serde_json::Value }
            let p: IsAllowedPayload = serde_json::from_str(&payload)
                .map_err(|e| format!("invalid payload: {e}"))?;
            Ok(is_allowed(&p.tool, &p.args).to_string())
        }
        "add_rule" => {
            #[derive(Deserialize)]
            struct AddRulePayload { tool: String, pattern: String, rule_type: String }
            let p: AddRulePayload = serde_json::from_str(&payload)
                .map_err(|e| format!("invalid payload: {e}"))?;
            let rt = match p.rule_type.as_str() {
                "allow" => RuleType::Allow,
                "deny"  => RuleType::Deny,
                _ => return Err("rule_type must be 'allow' or 'deny'".into()),
            };
            add_rule(&p.tool, &p.pattern, &rt)?;
            Ok("ok".into())
        }
        "list_rules" => {
            let rules = load_rules();
            let json_rules: Vec<serde_json::Value> = rules.into_iter().map(|(t, p, rt)| {
                serde_json::json!({"tool": t, "pattern": p, "rule_type": match rt {
                    RuleType::Allow => "allow",
                    RuleType::Deny => "deny",
                }})
            }).collect();
            Ok(serde_json::to_string(&json_rules)
                .map_err(|e| format!("serialize error: {e}"))?)
        }
        "add_session_rule" => {
            #[derive(Deserialize)]
            struct SessionRulePayload { tool: String, pattern: String, rule_type: String }
            let p: SessionRulePayload = serde_json::from_str(&payload)
                .map_err(|e| format!("invalid payload: {e}"))?;
            let rt = match p.rule_type.as_str() {
                "allow" => RuleType::Allow,
                "deny"  => RuleType::Deny,
                _ => return Err("rule_type must be 'allow' or 'deny'".into()),
            };
            if let Ok(mut session) = session_rules().lock() {
                session.push((p.tool, p.pattern, rt));
            }
            Ok("ok".into())
        }
        "available_decisions" => {
            #[derive(Deserialize)]
            struct DecisionsPayload { category: String }
            let p: DecisionsPayload = serde_json::from_str(&payload)
                .map_err(|e| format!("invalid payload: {e}"))?;
            let opts = available_decisions(&p.category);
            Ok(serde_json::to_string(&opts)
                .map_err(|e| format!("serialize error: {e}"))?)
        }
        _ => Err(format!("unknown action: {action}")),
    }
}

// ═══════════════════════════════════════════════════════════
// 测试 (Phase 1: PS-1 ~ PS-7)
// ═══════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn test_toml_path() -> PathBuf {
        std::env::temp_dir().join(format!("ifai_test_perm_{}", std::process::id()))
    }

    fn setup_test_toml(content: &str) -> PathBuf {
        let dir = test_toml_path();
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("permissions.toml");
        std::fs::write(&path, content).unwrap();
        // 修改内部 CONFIG_PATH 的读取目标
        // 由于 config_path() 固定用 home_dir，测试直接用 parse_toml
        path
    }

    fn cleanup() {
        let dir = test_toml_path();
        let _ = std::fs::remove_dir_all(dir);
    }

    // ─── PS-1: permission_invoke("is_allowed", ...) ──────────────

    #[test]
    fn test_ps1_is_allowed_direct() {
        // 测试 parse_toml + is_allowed 管道
        let content = r#"
[[allow]]
tool = "bash"
pattern = "git diff:*"

[[deny]]
tool = "bash"
pattern = "rm -rf /*"
"#;
        let rules = parse_toml(content);
        assert_eq!(rules.len(), 2);

        let args = serde_json::json!({"cmd": "git diff --stat"});
        assert!(is_allowed_with_rules(&rules, "bash", &args));

        let args = serde_json::json!({"cmd": "rm -rf /tmp"});
        assert!(!is_allowed_with_rules(&rules, "bash", &args));
    }

    // 辅助：用指定规则列表测试 is_allowed
    fn is_allowed_with_rules(rules: &[(String, String, RuleType)], tool: &str, args: &serde_json::Value) -> bool {
        let target = extract_target_value(tool, args);
        // deny 优先
        for (t, pat, rt) in rules {
            if t == tool && *rt == RuleType::Deny && match_rule(pat, &target) { return false; }
        }
        for (t, pat, rt) in rules {
            if t == tool && *rt == RuleType::Allow && match_rule(pat, &target) { return true; }
        }
        false
    }

    // ─── PS-2: permission_invoke("add_rule") ─────────────────

    #[test]
    fn test_ps2_add_and_list_rules() {
        let dir = test_toml_path();
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("permissions.toml");
        let original_config = config_path(); // 保存

        // 直接测 save_rules + load_rules
        let rules = vec![
            ("bash".into(), "git diff:*".into(), RuleType::Allow),
            ("bash".into(), "rm -rf /*".into(), RuleType::Deny),
        ];
        assert!(save_rules_to(&rules, &path).is_ok());

        let loaded = load_rules_from(&path);
        assert_eq!(loaded.len(), 2);
        assert!(loaded.iter().any(|(t, p, _)| t == "bash" && p == "git diff:*"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    fn save_rules_to(rules: &[(String, String, RuleType)], path: &PathBuf) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("{e}"))?;
        }
        let mut allow_list = Vec::new();
        let mut deny_list = Vec::new();
        for (tool, pattern, rt) in rules {
            match rt {
                RuleType::Allow => allow_list.push(format!("[[allow]]\ntool = \"{tool}\"\npattern = \"{pattern}\"\n")),
                RuleType::Deny => deny_list.push(format!("[[deny]]\ntool = \"{tool}\"\npattern = \"{pattern}\"\n")),
            }
        }
        let mut content = String::new();
        for a in &allow_list { content.push_str(a); content.push('\n'); }
        for d in &deny_list { content.push_str(d); content.push('\n'); }
        std::fs::write(path, content).map_err(|e| format!("{e}"))
    }

    fn load_rules_from(path: &PathBuf) -> Vec<(String, String, RuleType)> {
        if !path.exists() { return Vec::new(); }
        let content = std::fs::read_to_string(path).unwrap_or_default();
        parse_toml(&content)
    }

    // ─── PS-3: list_rules 返回正确 JSON ─────────────────────

    #[test]
    fn test_ps3_list_rules_json() {
        let content = r#"
[[allow]]
tool = "bash"
pattern = "ls:*"
"#;
        let rules = parse_toml(content);
        let json_rules: Vec<serde_json::Value> = rules.into_iter().map(|(t, p, rt)| {
            serde_json::json!({"tool": t, "pattern": p, "rule_type": match rt {
                RuleType::Allow => "allow",
                RuleType::Deny => "deny",
            }})
        }).collect();
        let json_str = serde_json::to_string(&json_rules).unwrap();
        assert!(json_str.contains("bash"));
        assert!(json_str.contains("ls:*"));
        assert!(json_str.contains("allow"));
    }

    // ─── PS-4: 会话规则不持久化 ────────────────────────────

    #[test]
    fn test_ps4_session_rules_not_persisted() {
        let rules_before = load_rules();
        // 添加会话规则（仅内存）
        if let Ok(mut session) = session_rules().lock() {
            session.push(("bash".into(), "echo:*".into(), RuleType::Allow));
        }
        // 新建 store 读取文件（不包含会话规则）
        let rules_after = load_rules();
        assert_eq!(rules_before.len(), rules_after.len());
    }

    // ─── PS-5: 未知 action 返回 Err ─────────────────────────

    #[test]
    fn test_ps5_unknown_action_returns_err() {
        let result = permission_invoke("unknown_action".into(), "{}".into());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unknown"));
    }

    // ─── PS-6: available_decisions ──────────────────────────

    #[test]
    fn test_ps6_available_decisions_destructive() {
        let opts = available_decisions("destructive");
        assert_eq!(opts.len(), 4, "destructive 应有 4 个选项");
        assert_eq!(opts[0].decision_type, "once");
        assert_eq!(opts[1].decision_type, "always");
        assert_eq!(opts[2].decision_type, "session");
        assert_eq!(opts[3].decision_type, "deny");
    }

    #[test]
    fn test_ps6_available_decisions_dangerous() {
        let opts = available_decisions("dangerous");
        assert_eq!(opts.len(), 3, "dangerous 应有 3 个选项");
        assert_eq!(opts[0].decision_type, "once");
        assert_eq!(opts[1].decision_type, "session");
        assert_eq!(opts[2].decision_type, "deny");
    }

    #[test]
    fn test_ps6_available_decisions_safe() {
        let opts = available_decisions("safe");
        assert_eq!(opts.len(), 2, "safe 应有 2 个选项");
        assert_eq!(opts[0].decision_type, "once");
        assert_eq!(opts[1].decision_type, "deny");
    }

    // ─── 匹配引擎测试 ──────────────────────────────────────

    #[test]
    fn test_match_prefix() {
        assert!(match_rule("git diff:*", "git diff --stat"));
        assert!(match_rule("git diff:*", "git diff"));
        assert!(!match_rule("git diff:*", "git status"));
    }

    #[test]
    fn test_match_glob_dir() {
        assert!(match_rule("src/**", "src/main.rs"));
        assert!(match_rule("src/**", "src/"));
        assert!(match_rule("src/**", "src/tauri/main.rs"));
        assert!(!match_rule("src/**", "tests/main.rs"));
    }

    #[test]
    fn test_match_exact() {
        assert!(match_rule("ls", "ls"));
        assert!(!match_rule("ls", "ls -la"));
    }

    // ─── extract_target_value 测试 ─────────────────────────

    #[test]
    fn test_extract_bash_cmd() {
        let args = serde_json::json!({"cmd": "git diff --stat"});
        assert_eq!(extract_target_value("bash", &args), "git diff");
    }

    #[test]
    fn test_extract_file_path() {
        let args = serde_json::json!({"path": "src/main.rs"});
        assert_eq!(extract_target_value("write_file", &args), "src/main.rs");
    }

    // ─── parse_toml 边界测试 ───────────────────────────────

    #[test]
    fn test_parse_toml_empty() {
        let rules = parse_toml("");
        assert!(rules.is_empty());
    }

    #[test]
    fn test_parse_toml_invalid() {
        let rules = parse_toml("not valid toml {{{");
        assert!(rules.is_empty());
    }

    #[test]
    fn test_parse_toml_allow_deny() {
        let content = r#"
[[allow]]
tool = "bash"
pattern = "ls:*"

[[deny]]
tool = "bash"
pattern = "rm:*"
"#;
        let rules = parse_toml(content);
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[0].2, RuleType::Allow);
        assert_eq!(rules[1].2, RuleType::Deny);
    }
}
