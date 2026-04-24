//! Declarative Command Registry
//!
//! 🏛️ 元编程：spec 即 handler，单一数据源驱动所有功能
//!
//! CommandSpec 静态数组同时驱动：
//! - 命令发现和补全
//! - 帮助生成
//! - Dispatch 路由
//! - 权限检查

use super::session::Session;

// ============================================================================
// Types
// ============================================================================

/// 命令执行结果
pub type CommandResult = Result<Option<String>, String>;

/// 🔥 命令 Handler 函数指针类型（支持 Session 访问）
pub type Handler = fn(&mut Session, Option<&str>) -> CommandResult;

/// 权限级别（预留接口）
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum PermissionMode {
    /// 无限制
    None = 0,
    /// 需要配置
    Config = 1,
    /// 需要认证
    Auth = 2,
    /// 管理员
    Admin = 3,
}

/// 命令规格（spec + handler 合一）
pub struct CommandSpec {
    /// 命令名称（不带 / 前缀）
    pub name: &'static str,
    /// 简短描述
    pub summary: &'static str,
    /// 参数提示（可选）
    pub arg_hint: Option<&'static str>,
    /// 最低权限要求
    pub min_permission: PermissionMode,
    /// Handler 函数指针（spec 的核心 - spec 即 handler）
    pub handler: Handler,
}

// ============================================================================
// Command Registry (Static Array - Single Source of Truth)
// ============================================================================

/// 🏛️ 元编程：静态命令注册表
/// 所有命令定义在此单一数据源，任何新增命令只需添加一个条目
const COMMAND_SPECS: &[CommandSpec] = &[
    CommandSpec {
        name: "help",
        summary: "显示帮助信息",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_help,
    },
    CommandSpec {
        name: "clear",
        summary: "清空对话历史",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_clear,
    },
    CommandSpec {
        name: "compact",
        summary: "压缩对话历史（自动摘要）",
        arg_hint: None,
        min_permission: PermissionMode::Config,
        handler: cmd_compact,
    },
    CommandSpec {
        name: "cost",
        summary: "显示 token 使用和成本统计",
        arg_hint: None,
        min_permission: PermissionMode::Config,
        handler: cmd_cost,
    },
    CommandSpec {
        name: "provider",
        summary: "切换或显示当前 AI 提供商",
        arg_hint: Some("[name]"),
        min_permission: PermissionMode::Config,
        handler: cmd_provider,
    },
    CommandSpec {
        name: "model",
        summary: "切换或显示当前模型",
        arg_hint: Some("[name]"),
        min_permission: PermissionMode::Config,
        handler: cmd_model,
    },
    CommandSpec {
        name: "permissions",
        summary: "显示当前权限级别",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_permissions,
    },
    CommandSpec {
        name: "resume",
        summary: "会话持久化（save/load/list）",
        arg_hint: Some("<save|load|list> [name]"),
        min_permission: PermissionMode::Config,
        handler: cmd_resume,
    },
    CommandSpec {
        name: "export",
        summary: "导出对话历史为 Markdown",
        arg_hint: Some("<file>"),
        min_permission: PermissionMode::Config,
        handler: cmd_export,
    },
    CommandSpec {
        name: "undo",
        summary: "撤销上一轮对话",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_undo,
    },
    CommandSpec {
        name: "config",
        summary: "显示或初始化配置",
        arg_hint: Some("[init|show]"),
        min_permission: PermissionMode::Config,
        handler: cmd_config,
    },
    CommandSpec {
        name: "exit",
        summary: "退出交互模式",
        arg_hint: None,
        min_permission: PermissionMode::None,
        handler: cmd_exit,
    },
];

// ============================================================================
// Command Dispatch
// ============================================================================

/// 从名称查找命令 spec
pub fn find_command(name: &str) -> Option<&'static CommandSpec> {
    COMMAND_SPECS.iter().find(|spec| spec.name == name)
}

/// 🔥 Dispatch 命令到 handler（支持 Session 参数）
pub fn dispatch_command(session: &mut Session, name: &str, arg: Option<&str>) -> CommandResult {
    let spec = find_command(name)
        .ok_or_else(|| unknown_command_error(name))?;

    // 权限检查（预留接口，当前总是通过）
    // TODO: 集成 permission 系统

    // 调用 handler（spec 的核心 - spec 即 handler）
    (spec.handler)(session, arg)
}

/// 生成未知命令错误消息（包含建议）
fn unknown_command_error(name: &str) -> String {
    let suggestions: Vec<_> = COMMAND_SPECS.iter()
        .map(|s| s.name)
        .collect();

    format!("unknown command: /{}. Available: {}", name, suggestions.join(", "))
}

/// 生成帮助文本（从 COMMAND_SPECS 自动生成）
pub fn render_help() -> String {
    let mut help = String::from("可用命令：\n\n");

    for spec in COMMAND_SPECS {
        help.push_str(&format!("  /{}", spec.name));

        if let Some(hint) = spec.arg_hint {
            help.push_str(&format!(" {}", hint));
        }

        help.push_str(&format!(" - {}\n", spec.summary));
    }

    help.push_str("\n使用 /help <command> 查看详细帮助\n");
    help
}

// ============================================================================
// Command Handlers (Placeholder Implementations)
// ============================================================================

fn cmd_help(_session: &mut Session, _arg: Option<&str>) -> CommandResult {
    Ok(Some(render_help()))
}

fn cmd_clear(_session: &mut Session, _arg: Option<&str>) -> CommandResult {
    Ok(Some("✅ 对话历史已清空".to_string()))
}

fn cmd_compact(_session: &mut Session, _arg: Option<&str>) -> CommandResult {
    Ok(Some("🔄 对话已压缩".to_string()))
}

/// 🔥 显示 token 使用和成本统计（复用 GUI 端定价数据）
fn cmd_cost(session: &mut Session, _arg: Option<&str>) -> CommandResult {
    use super::token;
    use super::render::{default_theme, RESET};

    let theme = default_theme();

    // 🔥 使用 token display 模块格式化输出（包含进度条）
    let cost_display = if session.cumulative_input_tokens == 0 && session.cumulative_output_tokens == 0 {
        format!("{}No token usage recorded yet.{}", theme.muted, RESET)
    } else {
        // 🔥 显示成本 + Token 进度条
        let cost_line = token::format_cost(
            &session.messages,
            &session.model,
            session.cumulative_input_tokens,
            session.cumulative_output_tokens,
            &theme
        );

        let token_warning = token::format_token_warning(
            &session.messages,
            &session.model,
            &theme
        );

        format!("{}\n{}", cost_line, token_warning)
    };

    Ok(Some(cost_display))
}

fn cmd_provider(_session: &mut Session, arg: Option<&str>) -> CommandResult {
    match arg {
        Some(name) => {
            // 验证 provider 是否存在
            crate::provider::resolve_provider(name)?;
            Ok(Some(format!("✅ Provider 切换为: {}", name)))
        }
        None => Ok(Some("当前 Provider: deepseek".to_string())),
    }
}

fn cmd_model(session: &mut Session, arg: Option<&str>) -> CommandResult {
    match arg {
        Some(name) => Ok(Some(format!("✅ Model 切换为: {}", name))),
        None => Ok(Some("当前 Model: deepseek-chat".to_string())),
    }
}

fn cmd_permissions(_session: &mut Session, _arg: Option<&str>) -> CommandResult {
    Ok(Some("当前权限: None (无限制)".to_string()))
}

fn cmd_resume(_session: &mut Session, arg: Option<&str>) -> CommandResult {
    match arg {
        Some("list") => Ok(Some("已保存会话: 无".to_string())),
        Some("save") | Some("load") => Ok(Some("用法: /resume save <name> 或 /resume load <name>".to_string())),
        Some(_) | None => Ok(Some("用法: /resume <save|load|list> [name]".to_string())),
    }
}

fn cmd_export(_session: &mut Session, _arg: Option<&str>) -> CommandResult {
    Ok(Some("用法: /export <file>".to_string()))
}

fn cmd_undo(session: &mut Session, _arg: Option<&str>) -> CommandResult {
    Ok(Some("✅ 已撤销上一轮对话".to_string()))
}

fn cmd_config(_session: &mut Session, arg: Option<&str>) -> CommandResult {
    match arg {
        Some("init") => Ok(Some("✅ 配置模板已生成: ~/.ifai/config.toml".to_string())),
        Some("show") | None => Ok(Some("配置: provider=deepseek, model=deepseek-chat".to_string())),
        Some(_) => Ok(Some("用法: /config <init|show>".to_string())),
    }
}

fn cmd_exit(_session: &mut Session, _arg: Option<&str>) -> CommandResult {
    Ok(Some("👋 再见！".to_string()))
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_all_commands() {
        // 验证所有 12 个命令都能找到
        assert!(find_command("help").is_some());
        assert!(find_command("clear").is_some());
        assert!(find_command("compact").is_some());
        assert!(find_command("cost").is_some());
        assert!(find_command("provider").is_some());
        assert!(find_command("model").is_some());
        assert!(find_command("permissions").is_some());
        assert!(find_command("resume").is_some());
        assert!(find_command("export").is_some());
        assert!(find_command("undo").is_some());
        assert!(find_command("config").is_some());
        assert!(find_command("exit").is_some());
    }

    #[test]
    fn test_find_unknown_command() {
        assert!(find_command("nonexistent").is_none());
    }

    #[test]
    fn test_dispatch_help() {
        let mut session = Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "help", None);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        let help_text = output.unwrap();
        assert!(help_text.contains("可用命令"));
        assert!(help_text.contains("/help"));
    }

    #[test]
    fn test_dispatch_clear() {
        let mut session = Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "clear", None);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        assert!(output.unwrap().contains("✅"));
    }

    #[test]
    fn test_dispatch_unknown_command() {
        let mut session = Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "nonexistent", None);
        assert!(result.is_err());

        let err = result.unwrap_err();
        assert!(err.contains("unknown command"));
        assert!(err.contains("Available"));
    }

    #[test]
    fn test_dispatch_provider_valid() {
        let mut session = Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "provider", Some("deepseek"));
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        assert!(output.unwrap().contains("deepseek"));
    }

    #[test]
    fn test_dispatch_provider_invalid() {
        let mut session = Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "provider", Some("nonexistent"));
        assert!(result.is_err());
    }

    #[test]
    fn test_dispatch_model_with_arg() {
        let mut session = Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "model", Some("gpt-4o"));
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        assert!(output.unwrap().contains("gpt-4o"));
    }

    #[test]
    fn test_dispatch_model_without_arg() {
        let mut session = Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "model", None);
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        assert!(output.unwrap().contains("当前 Model"));
    }

    #[test]
    fn test_dispatch_config_init() {
        let mut session = Session::new("deepseek-official".to_string(), "deepseek-chat".to_string());
        let result = dispatch_command(&mut session, "config", Some("init"));
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.is_some());
        assert!(output.unwrap().contains("✅"));
    }

    #[test]
    fn test_render_help_completeness() {
        let help = render_help();

        // 验证所有命令都在帮助中
        assert!(help.contains("/help"));
        assert!(help.contains("/clear"));
        assert!(help.contains("/compact"));
        assert!(help.contains("/cost"));
        assert!(help.contains("/provider"));
        assert!(help.contains("/model"));
        assert!(help.contains("/permissions"));
        assert!(help.contains("/resume"));
        assert!(help.contains("/export"));
        assert!(help.contains("/undo"));
        assert!(help.contains("/config"));
        assert!(help.contains("/exit"));
    }

    #[test]
    fn test_command_spec_structure() {
        // 验证 CommandSpec 结构正确
        let help_spec = find_command("help").unwrap();
        assert_eq!(help_spec.name, "help");
        assert_eq!(help_spec.summary, "显示帮助信息");
        assert!(help_spec.arg_hint.is_none());
        assert_eq!(help_spec.min_permission, PermissionMode::None);

        // 验证带参数的命令
        let provider_spec = find_command("provider").unwrap();
        assert_eq!(provider_spec.name, "provider");
        assert!(provider_spec.arg_hint.is_some());
        assert_eq!(provider_spec.arg_hint.unwrap(), "[name]");
    }

    #[test]
    fn test_command_registry_size() {
        // 验证注册表包含所有 12 个命令
        assert_eq!(COMMAND_SPECS.len(), 12);
    }

    #[test]
    fn test_permission_mode_ordering() {
        // 验证权限级别可以正确比较
        assert!(PermissionMode::Admin > PermissionMode::Auth);
        assert!(PermissionMode::Auth > PermissionMode::Config);
        assert!(PermissionMode::Config > PermissionMode::None);
    }
}
